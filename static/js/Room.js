// ============================================================================
// MINDLOBBY — ROOM / MULTIPLAYER QUIZ MODULE
// ============================================================================
(function () {
    'use strict';

    // =========================================================================
    // GLOBAL STATE  (room & username are set by inline <script> in Room.html)
    // =========================================================================
    var socket = io();
    var room     = window.__ROOM_CODE || '';
    var username = window.__USERNAME  || 'Mind' + Math.floor(Math.random() * 10000);

    var isHost            = false;
    var connectionStatus  = 'connecting';
    var lobbyStartTime    = Date.now();
    var peakPlayerCount   = 0;
    var MAX_PLAYERS       = 7;   // Absolute hard cap — must match MAX_PLAYERS_PER_ROOM in App.py
    var MIN_PLAYERS       = 2;   // Minimum — must match MIN_PLAYERS_PER_ROOM in App.py
    var roomCap           = MAX_PLAYERS; // Current cap for this room (host-configurable)

    // Game state
    var totalQuestions      = 0;
    var currentQuestionIndex = 0;
    var myTotalScore        = 0;
    var timerInterval       = null;
    var selectedDocId       = null;
    var hasAnswered         = false;
    var timerEndTime        = 0;       // timestamp when current question timer expires
    var timerTotalSeconds   = 0;       // total seconds for current question

    // Cached DOM elements (filled on load)
    var el = {};

    // =========================================================================
    // PHASE MANAGEMENT
    // =========================================================================
    function showPhase(phase) {
        document.getElementById('lobbyPhase').style.display   = (phase === 'lobby')   ? 'flex' : 'none';
        document.getElementById('gamePhase').style.display     = (phase === 'game')    ? 'flex' : 'none';
        document.getElementById('revealPhase').style.display   = (phase === 'reveal')  ? 'flex' : 'none';
        document.getElementById('resultsPhase').style.display  = (phase === 'results') ? 'flex' : 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    window.onload = function () {
        el = {
            playerList:       document.getElementById('playerList'),
            playerCount:      document.getElementById('playerCount'),
            startBtn:         document.getElementById('startBtn'),
            statusIndicator:  document.getElementById('statusIndicator'),
            connectionStatus: document.getElementById('connectionStatus'),
            connectionIcon:   document.getElementById('connectionIcon'),
            connectionText:   document.getElementById('connectionText'),
            copyBtn:          document.getElementById('copyBtn'),
            lobbyStats:       document.getElementById('lobbyStats'),
            lobbyDuration:    document.getElementById('lobbyDuration'),
            peakPlayers:      document.getElementById('peakPlayers')
        };

        updateStatus('Synchronizing with the collective...');
        updateConnectionStatus('connecting');
        socket.emit('join_room', { username: username, room: room });
        startLobbyTimer();

        // Start lobby waiting room music
        if (window.AudioManager) AudioManager.startMusic('lobby');
    };

    // =========================================================================
    // SOCKET — CONNECTION
    // =========================================================================
    socket.on('connect', function () {
        console.log('Neural network established');
        updateConnectionStatus('connected');
        if (socket.recovered) {
            updateStatus('Reconnected to the mind network!');
            socket.emit('join_room', { username: username, room: room });
        }
    });

    socket.on('disconnect', function (reason) {
        console.log('Neural link disconnected:', reason);
        updateConnectionStatus('disconnected');
        updateStatus('Mental connection lost. Attempting to reconnect...');
    });

    socket.on('connect_error', function (error) {
        console.error('Connection error:', error);
        updateConnectionStatus('disconnected');
        updateStatus('Failed to establish neural link. Check your connection.');
    });

    // =========================================================================
    // SOCKET — LOBBY
    // =========================================================================
    socket.on('room_joined', function (data) {
        console.log('Successfully joined the mind lobby:', data);
        isHost = data.is_host;
        if (data.room_cap) {
            roomCap = data.room_cap;
        }
        updateStatus(isHost
            ? 'You are the Mind Master! Select a document and prepare to challenge others.'
            : 'Neural link established. Awaiting Mind Master\'s command.'
        );

        el.lobbyStats.style.display = 'flex';

        if (isHost) {
            document.getElementById('documentSelectSection').style.display = 'block';
            loadHostDocuments();
            renderCapControl();
        }
    });

    socket.on('update_player_list', function (data) {
        // Support both formats: array of players (legacy) or {players, host_username} object
        var players = Array.isArray(data) ? data : data.players;
        var hostUsername = Array.isArray(data) ? null : data.host_username;
        console.log('Mind network updated:', players);
        updatePlayerList(players);
        updatePlayerCount(players.length);

        if (players.length > peakPlayerCount) {
            peakPlayerCount = players.length;
            el.peakPlayers.textContent = peakPlayerCount;
        }

        // Trust server's host_username when available, fallback to array position
        if (hostUsername) {
            isHost = (hostUsername === username);
        } else {
            isHost = players.length > 0 && players[0].username === username;
        }
        updateHostControls();

        if (isHost) {
            updateStatus(players.length > 1
                ? 'Neural network ready! Select a document and begin the challenge.'
                : 'Scanning for other minds to join the challenge...'
            );
        } else {
            updateStatus('Synced with the collective. Awaiting Mind Master\'s signal...');
        }
    });

    socket.on('room_closed', function (data) {
        var reason = data.reason === 'host_left'
            ? 'The Mind Master has departed the neural network.'
            : 'The mental arena has been dissolved.';
        showNotification(reason, 'error', 'Neural Network Dissolved');
        setTimeout(function () { window.location.replace('/quickplay'); }, 3000);
    });

    socket.on('error', function (data) {
        console.error('Neural network error:', data);
        showNotification(data.message || 'An unexpected error occurred', 'error', 'System Error');
        if (isHost && el.startBtn) {
            el.startBtn.disabled = false;
            el.startBtn.querySelector('span').textContent = 'Begin Mental Challenge';
        }
    });

    // =========================================================================
    // SOCKET — DOCUMENT SELECTION
    // =========================================================================
    socket.on('room_cap_updated', function (data) {
        roomCap = data.cap;
        var slider = document.getElementById('capSlider');
        var label  = document.getElementById('capValueLabel');
        if (slider) slider.value = data.cap;
        if (label)  label.textContent = data.cap;
        applyCapColor(data.cap);
        var count = parseInt(el.playerCount.textContent.split(' / ')[0]) || 0;
        el.playerCount.textContent = count + ' / ' + roomCap;
    });

    // =========================================================================
    // HOST — PLAYER CAP CONTROL
    // =========================================================================
    var CAP_COLORS = {
        2: { grad: 'linear-gradient(135deg, #27ae60, #2ecc71)', hex: '#2ecc71' },
        3: { grad: 'linear-gradient(135deg, #1abc9c, #16a085)', hex: '#1abc9c' },
        4: { grad: 'linear-gradient(135deg, #2980b9, #3498db)', hex: '#3498db' },
        5: { grad: 'linear-gradient(135deg, #7c77c6, #a8a4e3)', hex: '#a8a4e3' },
        6: { grad: 'linear-gradient(135deg, #e67e22, #f39c12)', hex: '#f39c12' },
        7: { grad: 'linear-gradient(135deg, #c0392b, #e74c3c)', hex: '#e74c3c' }
    };

    function applyCapColor(val) {
        var color = CAP_COLORS[val] || CAP_COLORS[7];
        var badge  = document.getElementById('capValueLabel');
        var slider = document.getElementById('capSlider');
        var track  = document.getElementById('capTrackFill');

        if (badge)  badge.style.background = color.grad;
        if (slider) {
            slider.style.setProperty('--thumb-color', color.hex);
            // Fill track from left to current thumb position
            var pct = ((val - MIN_PLAYERS) / (MAX_PLAYERS - MIN_PLAYERS)) * 100;
            slider.style.background =
                'linear-gradient(to right, ' + color.hex + ' 0%, ' + color.hex + ' ' + pct + '%, rgba(124,119,198,0.25) ' + pct + '%, rgba(124,119,198,0.25) 100%)';
        }

        // Highlight the matching pip
        for (var i = MIN_PLAYERS; i <= MAX_PLAYERS; i++) {
            var pip = document.getElementById('capPip' + i);
            if (!pip) continue;
            if (i === val) {
                pip.style.color      = CAP_COLORS[i].hex;
                pip.style.opacity    = '1';
                pip.style.transform  = 'scale(1.35)';
                pip.style.fontWeight = '800';
            } else {
                pip.style.color      = '';
                pip.style.opacity    = '0.4';
                pip.style.transform  = '';
                pip.style.fontWeight = '';
            }
        }
    }

    function renderCapControl() {
        var section = document.getElementById('documentSelectSection');
        if (!section || document.getElementById('capControlBlock')) return;

        // Build pip labels  2 · 3 · 4 · 5 · 6 · 7
        var pipsHtml = '';
        for (var i = MIN_PLAYERS; i <= MAX_PLAYERS; i++) {
            pipsHtml +=
                '<span id="capPip' + i + '" class="cap-pip" style="color:' + CAP_COLORS[i].hex + '">' + i + '</span>';
        }

        var block = document.createElement('div');
        block.id = 'capControlBlock';
        block.className = 'cap-control-block';
        block.innerHTML =
            '<div class="cap-control-label">' +
                '<i class="fas fa-users-cog"></i>' +
                'Player Cap' +
                '<span class="cap-value-badge" id="capValueLabel">' + roomCap + '</span>' +
            '</div>' +
            '<input type="range" id="capSlider" class="cap-slider"' +
                ' min="' + MIN_PLAYERS + '" max="' + MAX_PLAYERS + '"' +
                ' value="' + roomCap + '" step="1">' +
            '<div class="cap-pips">' + pipsHtml + '</div>';

        section.appendChild(block);

        applyCapColor(roomCap);

        document.getElementById('capSlider').addEventListener('input', function () {
            var val = parseInt(this.value);
            document.getElementById('capValueLabel').textContent = val;
            applyCapColor(val);
        });

        document.getElementById('capSlider').addEventListener('change', function () {
            socket.emit('set_room_cap', { room: room, cap: parseInt(this.value) });
        });
    }

    socket.on('document_selected', function (data) {
        var info   = document.getElementById('selectedDocInfo');
        var nameEl = document.getElementById('selectedDocName');
        var cardsEl = document.getElementById('selectedDocCards');
        if (info)   info.style.display = 'flex';
        if (nameEl) nameEl.textContent = data.document_name;
        if (cardsEl) cardsEl.textContent = data.question_count + ' questions';

        if (isHost && el.startBtn) {
            el.startBtn.disabled = false;
            el.startBtn.querySelector('span').textContent = 'Begin Mental Challenge';
            el.startBtn.querySelector('.btn-subtitle').textContent = data.document_name;
        }
    });

    // =========================================================================
    // SOCKET — KICK
    // =========================================================================
    socket.on('player_kicked', function () {
        showNotification('You have been removed from the lobby by the host.', 'error', 'Kicked');
        setTimeout(function () { window.location.replace('/quickplay'); }, 2000);
    });

    // =========================================================================
    // SOCKET — GAME FLOW
    // =========================================================================
    socket.on('game_started', function (data) {
        console.log('Game started:', data);
        totalQuestions = data.total_questions;
        myTotalScore = 0;
        showPhase('game');
        document.getElementById('gameMyScore').textContent = '0';
        // Show end game button for host
        var endBtn = document.getElementById('endGameBtn');
        if (endBtn) endBtn.style.display = isHost ? 'flex' : 'none';
        if (window.AudioManager) AudioManager.startMusic('game');
        showNotification('The mental challenge begins!', 'success', 'Game On');
    });

    socket.on('question_start', function (data) {
        currentQuestionIndex = data.question_index;
        hasAnswered = false;
        showPhase('game');
        renderQuestion(data);
        startTimer(data.time_limit || 20);
    });

    socket.on('question_end', function (data) {
        clearInterval(timerInterval);
        timerEndTime = 0;
        renderReveal(data);
        showPhase('reveal');
    });

    socket.on('game_results', function (data) {
        if (window.AudioManager) AudioManager.stopMusic();
        var endBtn = document.getElementById('endGameBtn');
        if (endBtn) endBtn.style.display = 'none';
        renderResults(data);
        showPhase('results');
    });

    socket.on('game_reset', function () {
        selectedDocId = null;
        myTotalScore = 0;
        var endBtn = document.getElementById('endGameBtn');
        if (endBtn) endBtn.style.display = 'none';
        var info = document.getElementById('selectedDocInfo');
        if (info) info.style.display = 'none';
        showPhase('lobby');
        if (window.AudioManager) AudioManager.startMusic('lobby');
        if (isHost) {
            loadHostDocuments();
            el.startBtn.disabled = true;
            el.startBtn.querySelector('span').textContent = 'Select a Document First';
            el.startBtn.querySelector('.btn-subtitle').textContent = 'Choose a document above';
        }
        showNotification('Back to lobby! Host can pick a new document.', 'info', 'Game Reset');
        // Re-render cap control for host if it was removed during game phase
        if (isHost && !document.getElementById('capControlBlock')) {
            renderCapControl();
        }
    });

    // =========================================================================
    // HOST DOCUMENT LOADING
    // =========================================================================
    function loadHostDocuments() {
        var listEl = document.getElementById('hostDocList');
        if (!listEl) return;

        fetch('/api/host-documents')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success || !data.documents || data.documents.length === 0) {
                    listEl.innerHTML = '<p class="doc-list-empty"><i class="fas fa-info-circle"></i> No documents with 4+ flashcards found. Upload documents in your Studio first.</p>';
                    return;
                }

                var html = '';
                data.documents.forEach(function (doc) {
                    var ext   = doc.file_type || 'txt';
                    var name  = escHtml(doc.original_filename || doc.filename || 'Untitled');
                    var cards = doc.flashcard_count || 0;
                    html +=
                        '<div class="doc-item' + (selectedDocId === doc.id ? ' active' : '') + '" onclick="Room.selectDocument(' + doc.id + ', this)" data-doc-id="' + doc.id + '">' +
                            '<div class="doc-item-icon"><i class="fas ' + fileIcon(ext) + '"></i></div>' +
                            '<div class="doc-item-info">' +
                                '<div class="doc-item-name">' + name + '</div>' +
                                '<div class="doc-item-meta">' + cards + ' flashcards &bull; ' + ext.toUpperCase() + '</div>' +
                            '</div>' +
                            '<div class="doc-item-check"><i class="fas fa-check"></i></div>' +
                        '</div>';
                });
                listEl.innerHTML = html;
            })
            .catch(function (err) {
                console.error('Failed to load host documents:', err);
                listEl.innerHTML = '<p class="doc-list-empty">Failed to load documents.</p>';
            });
    }

    function selectDocument(docId, elem) {
        selectedDocId = docId;
        document.querySelectorAll('.doc-item').forEach(function (item) {
            item.classList.remove('active');
        });
        if (elem) elem.classList.add('active');
        socket.emit('select_document', { room: room, document_id: docId });
    }

    // =========================================================================
    // KICK PLAYER
    // =========================================================================
    function kickPlayer(playerName) {
        showConfirmDialog(
            'Remove ' + playerName + ' from the lobby?',
            function () {
                socket.emit('kick_player', { room: room, username: playerName });
            }
        );
    }

    // =========================================================================
    // GAME RENDERING
    // =========================================================================
    function renderQuestion(data) {
        var counter = document.getElementById('gameQuestionCounter');
        if (counter) counter.textContent = 'Question ' + (data.question_index + 1) + ' of ' + data.total;

        var text = document.getElementById('gameQuestionText');
        if (text) text.textContent = data.question_text;

        var grid = document.getElementById('gameOptionsGrid');
        if (grid) {
            var html = '';
            var letters = ['A', 'B', 'C', 'D'];
            for (var i = 0; i < data.options.length; i++) {
                html +=
                    '<button class="option-btn" data-index="' + i + '" onclick="Room.selectGameAnswer(' + i + ')">' +
                        '<span class="option-letter">' + letters[i] + '</span>' +
                        '<span class="option-text">' + escHtml(data.options[i]) + '</span>' +
                    '</button>';
            }
            grid.innerHTML = html;
        }

        document.getElementById('waitingIndicator').style.display = 'none';
    }

    function selectGameAnswer(index) {
        if (hasAnswered) return;
        hasAnswered = true;

        socket.emit('submit_answer', { room: room, answer_index: index });

        var buttons = document.querySelectorAll('#gameOptionsGrid .option-btn');
        buttons.forEach(function (btn, i) {
            btn.disabled = true;
            btn.classList.add('disabled');
            if (i === index) btn.classList.add('selected');
        });

        document.getElementById('waitingIndicator').style.display = 'flex';
    }

    function startTimer(seconds) {
        clearInterval(timerInterval);
        timerTotalSeconds = seconds;
        timerEndTime = Date.now() + (seconds * 1000);

        var bar  = document.getElementById('timerBar');
        var text = document.getElementById('timerText');

        bar.style.transition = 'none';
        bar.style.width = '100%';
        bar.className = 'timer-bar';

        void bar.offsetWidth; // force reflow

        bar.style.transition = 'width ' + seconds + 's linear';
        bar.style.width = '0%';
        text.textContent = seconds;

        timerInterval = setInterval(function () {
            // Use wall-clock time so tab throttling doesn't desync
            var remaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
            text.textContent = remaining;
            if (remaining <= 0) { clearInterval(timerInterval); }
            if (remaining <= 5) {
                bar.classList.add('timer-danger');
                text.classList.add('timer-danger-text');
            } else {
                text.classList.remove('timer-danger-text');
            }
        }, 1000);
    }

    // Handle tab visibility changes — resync timer when user returns
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && timerEndTime > 0) {
            var remaining = Math.max(0, (timerEndTime - Date.now()) / 1000);
            var bar  = document.getElementById('timerBar');
            var text = document.getElementById('timerText');
            if (bar && remaining > 0) {
                // Re-sync the CSS transition to match actual remaining time
                bar.style.transition = 'none';
                bar.style.width = (remaining / timerTotalSeconds * 100) + '%';
                void bar.offsetWidth;
                bar.style.transition = 'width ' + remaining + 's linear';
                bar.style.width = '0%';
            }
            if (text) text.textContent = Math.ceil(remaining);
        }
    });

    // =========================================================================
    // REVEAL RENDERING
    // =========================================================================
    function renderReveal(data) {
        var myResult  = data.player_results.find(function (r) { return r.username === username; });
        var isCorrect = myResult && myResult.correct;
        var myScore   = myResult ? myResult.score : 0;

        if (isCorrect) myTotalScore += myScore;
        if (window.AudioManager) { isCorrect ? AudioManager.playCorrect() : AudioManager.playWrong(); }
        document.getElementById('gameMyScore').textContent = myTotalScore;

        var iconEl  = document.getElementById('revealResultIcon');
        var textEl  = document.getElementById('revealResultText');
        var scoreEl = document.getElementById('revealScoreGained');

        if (isCorrect) {
            iconEl.innerHTML = '<i class="fas fa-check-circle" style="color:#2ecc71;"></i>';
            textEl.textContent = 'Correct!';
            textEl.style.color = '#2ecc71';
            scoreEl.textContent = '+' + myScore + ' points';
            scoreEl.style.color = '#2ecc71';
        } else {
            iconEl.innerHTML = '<i class="fas fa-times-circle" style="color:#e74c3c;"></i>';
            textEl.textContent = 'Wrong!';
            textEl.style.color = '#e74c3c';
            scoreEl.textContent = '+0 points';
            scoreEl.style.color = '#e74c3c';
        }

        // Correct answer text
        var correctAnswerEl = document.getElementById('revealCorrectAnswer');
        var optionBtns = document.querySelectorAll('#gameOptionsGrid .option-btn');
        if (optionBtns.length > data.correct_index) {
            var correctText = optionBtns[data.correct_index].querySelector('.option-text');
            if (correctText) correctAnswerEl.textContent = correctText.textContent;
        }

        // Per-player results
        var scoresList = document.getElementById('revealScoresList');
        var scoresHtml = '';
        data.player_results.forEach(function (r) {
            var icon = r.correct
                ? '<i class="fas fa-check" style="color:#2ecc71;"></i>'
                : '<i class="fas fa-times" style="color:#e74c3c;"></i>';
            scoresHtml +=
                '<div class="reveal-score-row">' +
                    '<span class="reveal-score-name">' + icon + ' ' + escHtml(r.username) + (r.username === username ? ' (You)' : '') + '</span>' +
                    '<span class="reveal-score-pts' + (r.correct ? ' correct' : ' wrong') + '">+' + r.score + '</span>' +
                '</div>';
        });
        scoresList.innerHTML = scoresHtml;

        // Leaderboard
        var lbEl  = document.getElementById('revealLeaderboard');
        var lbHtml = '';
        data.leaderboard.forEach(function (entry, i) {
            var medal = i === 0 ? '<i class="fas fa-crown" style="color:#f1c40f;"></i> ' : (i + 1) + '. ';
            lbHtml +=
                '<div class="reveal-lb-row' + (entry.username === username ? ' is-me' : '') + '">' +
                    '<span class="reveal-lb-rank">' + medal + '</span>' +
                    '<span class="reveal-lb-name">' + escHtml(entry.username) + '</span>' +
                    '<span class="reveal-lb-score">' + entry.total_score + '</span>' +
                '</div>';
        });
        lbEl.innerHTML = lbHtml;
    }

    // =========================================================================
    // RESULTS RENDERING
    // =========================================================================
    function renderResults(data) {
        var subtitle = document.getElementById('resultsSubtitle');
        if (subtitle) subtitle.textContent = data.total_questions + ' questions completed';

        var lb = document.getElementById('resultsLeaderboard');
        var html = '';
        data.leaderboard.forEach(function (entry, i) {
            var rank = i + 1;
            var medal = '';
            if (rank === 1) medal = '<i class="fas fa-crown" style="color:#f1c40f; font-size:1.4em;"></i>';
            else if (rank === 2) medal = '<i class="fas fa-medal" style="color:#c0c0c0;"></i>';
            else if (rank === 3) medal = '<i class="fas fa-medal" style="color:#cd7f32;"></i>';

            var isMe = entry.username === username;
            html +=
                '<div class="leaderboard-item' + (rank === 1 ? ' first-place' : '') + (isMe ? ' is-me' : '') + '">' +
                    '<div class="lb-rank">' + (medal || ('#' + rank)) + '</div>' +
                    '<div class="lb-info">' +
                        '<div class="lb-name">' + escHtml(entry.username) + (isMe ? ' (You)' : '') + '</div>' +
                        '<div class="lb-correct">' + entry.correct_count + '/' + data.total_questions + ' correct</div>' +
                    '</div>' +
                    '<div class="lb-score">' + entry.total_score + '</div>' +
                '</div>';
        });
        lb.innerHTML = html;

        var playAgainBtn = document.getElementById('playAgainBtn');
        if (playAgainBtn) playAgainBtn.style.display = isHost ? 'flex' : 'none';

        // Host: "Back to Lobby" resets for everyone; Non-host: "Leave Room" just exits
        var backBtn = document.getElementById('backToLobbyBtn');
        if (backBtn) {
            var span = backBtn.querySelector('span');
            if (isHost) {
                if (span) span.textContent = 'Back to Lobby';
            } else {
                if (span) span.textContent = 'Leave Room';
            }
        }
    }

    function playAgain() {
        socket.emit('reset_game', { room: room });
    }

    function backToLobby() {
        if (isHost) {
            // Host: reset game back to lobby for everyone
            socket.emit('reset_game', { room: room });
        } else {
            // Non-host: just leave the room
            window.location.replace('/quickplay');
        }
    }

    // =========================================================================
    // PLAYER LIST UI
    // =========================================================================
    function updatePlayerList(players) {
        el.playerList.innerHTML = '';

        if (players.length === 0) {
            el.playerList.innerHTML = '<li class="loading-players"><div class="loading-spinner"></div>No minds detected in the network...</li>';
            return;
        }

        players.forEach(function (player, index) {
            var playerName = typeof player === 'string' ? player : player.username;
            var profilePic = typeof player === 'object' ? player.profile_picture : null;

            var li = document.createElement('li');
            li.className = 'player-item fade-in';
            if (index === 0) li.classList.add('host');

            var isCurrentUser = playerName === username;
            var brainColor = generatePlayerColor(playerName);

            var kickHtml = '';
            if (isHost && !isCurrentUser) {
                kickHtml = '<button class="kick-btn" onclick="event.stopPropagation(); Room.kickPlayer(\'' + playerName.replace(/'/g, "\\'") + '\')" title="Kick player"><i class="fas fa-times"></i></button>';
            }

            var avatarHtml;
            if (profilePic) {
                avatarHtml = '<img src="' + escHtml(profilePic) + '" class="player-avatar-img" alt="">';
            } else {
                avatarHtml = '<div class="player-avatar" style="background: ' + brainColor + ';"><i class="fas fa-brain"></i></div>';
            }

            li.innerHTML =
                '<div class="player-info">' +
                    avatarHtml +
                    '<div>' +
                        '<div class="player-name">' + escHtml(playerName) + (isCurrentUser ? ' (You)' : '') + '</div>' +
                        '<div class="player-status">' + (index === 0 ? 'Mind Master' : 'Neural Node') + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="player-actions">' +
                    (index === 0 ? '<div class="host-badge"><i class="fas fa-crown"></i> Mind Master</div>' : '') +
                    kickHtml +
                '</div>';

            el.playerList.appendChild(li);
        });
    }

    function generatePlayerColor(playerName) {
        var colors = [
            'linear-gradient(135deg, #7c77c6, #a8a4e3)',
            'linear-gradient(135deg, #e74c3c, #f39c12)',
            'linear-gradient(135deg, #3498db, #2ecc71)',
            'linear-gradient(135deg, #9b59b6, #e91e63)',
            'linear-gradient(135deg, #f39c12, #f1c40f)',
            'linear-gradient(135deg, #1abc9c, #16a085)'
        ];
        var hash = 0;
        for (var i = 0; i < playerName.length; i++) {
            hash = playerName.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    function updatePlayerCount(count) {
        el.playerCount.textContent = count + ' / ' + roomCap;
        el.playerCount.style.animation = 'pulse 0.5s ease';
        setTimeout(function () { el.playerCount.style.animation = ''; }, 500);
    }

    function updateStatus(message, icon) {
        icon = icon || 'fas fa-brain';
        el.statusIndicator.innerHTML =
            '<i class="' + icon + ' status-icon"></i>' +
            '<span class="waiting-animation">' + message + '</span>';
    }

    function updateConnectionStatus(status) {
        connectionStatus = status;
        var configs = {
            'connected':    { cls: 'connected',    icon: 'fas fa-brain',           text: 'Neural Link Active' },
            'connecting':   { cls: 'connecting',   icon: 'fas fa-spinner fa-spin', text: 'Establishing Link...' },
            'disconnected': { cls: 'disconnected', icon: 'fas fa-brain',           text: 'Neural Link Lost' }
        };
        var c = configs[status];
        el.connectionStatus.className = 'connection-status ' + c.cls;
        el.connectionIcon.className   = c.icon;
        el.connectionText.textContent = c.text;
    }

    function updateHostControls() {
        if (isHost) {
            el.startBtn.style.display = 'flex';
            document.getElementById('documentSelectSection').style.display = 'block';
            if (!selectedDocId) {
                el.startBtn.disabled = true;
                el.startBtn.querySelector('span').textContent = 'Select a Document First';
                el.startBtn.querySelector('.btn-subtitle').textContent = 'Choose a document above';
            }
        } else {
            el.startBtn.style.display = 'none';
            document.getElementById('documentSelectSection').style.display = 'none';
        }
    }

    function startLobbyTimer() {
        setInterval(function () {
            var elapsed = Date.now() - lobbyStartTime;
            var minutes = Math.floor(elapsed / 60000);
            var seconds = Math.floor((elapsed % 60000) / 1000);
            el.lobbyDuration.textContent =
                minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
        }, 1000);
    }

    // =========================================================================
    // BUTTON HANDLERS
    // =========================================================================
    function copyRoomCode() {
        navigator.clipboard.writeText(room).then(function () {
            var original = el.copyBtn.innerHTML;
            el.copyBtn.innerHTML = '<i class="fas fa-brain"></i> Neural Code Copied!';
            el.copyBtn.classList.add('copied');
            setTimeout(function () {
                el.copyBtn.innerHTML = original;
                el.copyBtn.classList.remove('copied');
            }, 2500);
        }).catch(function () {
            var ta = document.createElement('textarea');
            ta.value = room;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showNotification('Room code copied!', 'success', 'Copied');
        });
    }

    function inviteFriends() {
        var shareText = 'Join my neural network in MindLobby! Access code: ' + room;
        var shareUrl  = window.location.origin + '/room/' + room;

        if (navigator.share) {
            navigator.share({ title: 'MindLobby', text: shareText, url: shareUrl }).catch(function () {});
        } else {
            navigator.clipboard.writeText(shareText + '\n' + shareUrl).then(function () {
                showNotification('Invitation copied to clipboard!', 'success', 'Invitation Copied');
            }).catch(function () {
                showNotification('Share this: ' + shareText, 'info', 'Share Invitation');
            });
        }
    }

    function startGame() {
        if (!isHost) {
            showNotification('Only the Mind Master can start the game!', 'warning', 'Access Denied');
            return;
        }
        if (connectionStatus !== 'connected') {
            showNotification('Cannot start while connection is unstable!', 'error', 'Connection Error');
            return;
        }
        if (!selectedDocId) {
            showNotification('Please select a document first!', 'warning', 'No Document');
            return;
        }

        el.startBtn.disabled = true;
        el.startBtn.querySelector('span').textContent = 'Starting...';
        socket.emit('start_game', { room: room });
    }

    function leaveRoom() {
        var message = isHost
            ? 'Are you sure? Leaving will close the lobby for everyone!'
            : 'Ready to leave the lobby?';

        showConfirmDialog(message, function () {
            updateStatus('Disconnecting...', 'fas fa-power-off');
            socket.emit('leave_room', { room: room });
            showNotification('Leaving lobby...', 'info', 'Goodbye');
            setTimeout(function () { window.location.replace('/quickplay'); }, 1000);
        });
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function fileIcon(ext) {
        switch (ext) {
            case 'pdf':  return 'fa-file-pdf';
            case 'doc':  case 'docx': return 'fa-file-word';
            case 'ppt':  case 'pptx': return 'fa-file-powerpoint';
            default:     return 'fa-file-alt';
        }
    }

    function showNotification(message, type, title) {
        type  = type  || 'info';
        title = title || '';
        var existing = document.querySelectorAll('.notification-toast');
        existing.forEach(function (n) { n.remove(); });

        var notification = document.createElement('div');
        notification.className = 'notification-toast toast-' + type;

        var icons = {
            'warning': 'fas fa-exclamation-triangle',
            'success': 'fas fa-check-circle',
            'error':   'fas fa-times-circle',
            'info':    'fas fa-info-circle'
        };
        var titles = {
            'warning': title || 'Warning',
            'success': title || 'Success',
            'error':   title || 'Error',
            'info':    title || 'Information'
        };

        notification.innerHTML =
            '<i class="' + (icons[type] || icons.info) + '"></i>' +
            '<div class="notification-content">' +
                '<div class="notification-title">' + (titles[type] || title) + '</div>' +
                '<div class="notification-message">' + message + '</div>' +
            '</div>';

        document.body.appendChild(notification);
        setTimeout(function () { notification.classList.add('show'); }, 100);
        setTimeout(function () {
            notification.classList.remove('show');
            setTimeout(function () { notification.remove(); }, 400);
        }, 4000);
    }

    function showConfirmDialog(message, onConfirm, onCancel) {
        var modal = document.createElement('div');
        modal.className = 'custom-alert';
        modal.innerHTML =
            '<div class="alert-content">' +
                '<img src="/static/images/favicon.png" style="width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(124,119,198,0.5));margin-bottom:8px;">' +
                '<p>' + message + '</p>' +
                '<div style="display: flex; gap: 15px; justify-content: center;">' +
                    '<button class="confirm-btn" style="background: linear-gradient(135deg, #7c77c6 0%, #a8a4e3 100%);">Confirm</button>' +
                    '<button class="cancel-btn" style="background: rgba(255, 255, 255, 0.1); color: white;">Cancel</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        modal.querySelector('.confirm-btn').onclick = function () {
            modal.remove();
            if (onConfirm) onConfirm();
        };
        modal.querySelector('.cancel-btn').onclick = function () {
            modal.remove();
            if (onCancel) onCancel();
        };
        modal.onclick = function (e) {
            if (e.target === modal) {
                modal.remove();
                if (onCancel) onCancel();
            }
        };
    }

    // =========================================================================
    // KEYBOARD SHORTCUTS
    // =========================================================================
    document.addEventListener('keydown', function (e) {
        // Game phase shortcuts
        var gamePhase = document.getElementById('gamePhase');
        if (gamePhase && gamePhase.style.display !== 'none' && !hasAnswered) {
            var key = e.key.toUpperCase();
            if (key >= '1' && key <= '4') { selectGameAnswer(parseInt(key) - 1); return; }
            if (key >= 'A' && key <= 'D') { selectGameAnswer(key.charCodeAt(0) - 65); return; }
        }

        // Lobby shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            copyRoomCode();
        }
    });

    window.addEventListener('beforeunload', function () {
        if (socket.connected) {
            socket.emit('leave_room', { room: room });
            socket.disconnect();
        }
    });

    // Back-button prevention: if page restored from bfcache, re-check auth
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            fetch('/check-auth').then(function (r) { return r.json(); }).then(function (data) {
                if (!data.authenticated) window.location.replace('/');
            }).catch(function () {});
        }
    });

    // =========================================================================
    // END GAME (HOST) — confirmation modal + emit reset
    // =========================================================================
    function confirmEndGame() {
        var backdrop = document.getElementById('endGameBackdrop');
        var modal = document.getElementById('endGameModal');
        if (backdrop) backdrop.classList.add('open');
        if (modal) modal.classList.add('open');
    }

    function cancelEndGame() {
        var backdrop = document.getElementById('endGameBackdrop');
        var modal = document.getElementById('endGameModal');
        if (backdrop) backdrop.classList.remove('open');
        if (modal) modal.classList.remove('open');
    }

    function endGame() {
        cancelEndGame();
        socket.emit('reset_game', { room: room });
    }

    // =========================================================================
    // PUBLIC API — for onclick handlers in HTML
    // =========================================================================
    window.Room = {
        selectDocument:   selectDocument,
        selectGameAnswer: selectGameAnswer,
        kickPlayer:       kickPlayer,
        copyRoomCode:     copyRoomCode,
        inviteFriends:    inviteFriends,
        startGame:        startGame,
        leaveRoom:        leaveRoom,
        playAgain:        playAgain,
        backToLobby:      backToLobby,
        confirmEndGame:   confirmEndGame,
        cancelEndGame:    cancelEndGame,
        endGame:          endGame
    };

    console.log('MindLobby Neural Network initialized!');
})();