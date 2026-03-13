// ============================================================================
// MINDLOBBY — QUIZZES PANEL MODULE
// ============================================================================
(function () {
  'use strict';

  // --- State ---
  let _allDocs = [];
  let _quizResultsMap = {};   // document_id -> {best_pct, attempts, ...}
  let _questions = [];
  let _currentIndex = 0;
  let _score = 0;
  let _answered = false;
  let _docId = null;
  let _docName = '';
  let _wrongAnswers = [];

  const MIN_CARDS = 4;

  // ===========================================================================
  // BROWSE VIEW
  // ===========================================================================

  async function loadDocs() {
    try {
      const [docsRes, resultsRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/quiz/results'),
      ]);
      const docsData = await docsRes.json();
      const resultsData = await resultsRes.json();

      if (docsData.success) {
        _allDocs = (docsData.documents || []).filter(
          d => (d.flashcard_count || 0) >= MIN_CARDS
        );
      }
      if (resultsData.success) {
        _quizResultsMap = resultsData.results || {};
      }
      _renderDocGrid(_allDocs);
    } catch (e) {
      console.error('Could not load quiz documents:', e);
    }
  }

  function filterDocs(query) {
    var q = (query || '').toLowerCase().trim();
    if (!q) { _renderDocGrid(_allDocs); return; }
    var filtered = _allDocs.filter(function (d) {
      return (d.original_filename || d.filename || '').toLowerCase().includes(q);
    });
    _renderDocGrid(filtered);
  }

  function _renderDocGrid(docs) {
    var grid = document.getElementById('qzDocsGrid');
    var empty = document.getElementById('qzEmptyState');
    var search = document.getElementById('qzSearchWrapper');
    if (!grid) return;

    if (!docs || docs.length === 0) {
      grid.style.display = 'none';
      if (empty) empty.style.display = (_allDocs.length === 0) ? 'block' : 'none';
      if (search) search.style.display = (_allDocs.length >= 1) ? 'flex' : 'none';
      if (_allDocs.length > 0 && docs.length === 0) {
        grid.style.display = 'grid';
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0;">No documents match your search.</p>';
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    if (search) search.style.display = (_allDocs.length >= 1) ? 'flex' : 'none';
    grid.style.display = 'grid';
    grid.innerHTML = docs.map(_renderDocCard).join('');
  }

  function _timeAgo(dateStr) {
    var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(dateStr).toLocaleDateString();
  }

  function _renderDocCard(doc) {
    var ext = doc.file_type || 'txt';
    var icon = _fileIcon(ext);
    var name = _esc(doc.original_filename || doc.filename || '');
    var nameAttr = (doc.original_filename || doc.filename || '')
      .replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var ago = _timeAgo(doc.upload_date);
    var count = doc.flashcard_count || 0;
    var topicDots = (doc.topics || []).map(function(t) {
      return '<span class="doc-topic-dot" style="--dot-color:' + t.color + '" title="' + _esc(t.name) + '"></span>';
    }).join('');
    var badgeLabel = ext === 'youtube' ? 'YT LINK' : ext.toUpperCase();
    var iconPrefix = ext === 'youtube' ? '' : 'fas ';

    // Quiz history badge — always shown (0% if no attempts)
    var result = _quizResultsMap[doc.id];
    var pct = result ? result.best_pct : 0;
    var attempts = result ? result.attempts : 0;
    var tierClass = !result ? 'qz-tier-none' : (pct >= 80 ? 'qz-tier-gold' : pct >= 50 ? 'qz-tier-silver' : 'qz-tier-bronze');

    var historyBadge =
      '<div class="qz-history-badge ' + tierClass + '">' +
        '<div class="qz-score-ring">' +
          '<span class="qz-score-pct">' + pct + '%</span>' +
        '</div>' +
        '<div class="qz-score-detail">' +
          '<span class="qz-score-label">Best Score</span>' +
          '<span class="qz-score-attempts">' + attempts + ' attempt' + (attempts !== 1 ? 's' : '') + '</span>' +
        '</div>' +
      '</div>';

    return (
      '<div class="document-card" onclick="Quizzes.startQuiz(\'' + doc.id + '\', \'' + nameAttr + '\')">' +
        historyBadge +
        '<div class="doc-header">' +
          '<div class="doc-icon doc-icon-' + ext + '"><i class="' + iconPrefix + icon + '"></i></div>' +
          '<span class="doc-type-badge doc-type-' + ext + '">' + badgeLabel + '</span>' +
          topicDots +
        '</div>' +
        '<h3 class="doc-title">' + name + '</h3>' +
        '<div class="doc-meta">' +
          '<span class="doc-meta-item"><i class="fas fa-layer-group"></i> ' + count + ' card' + (count !== 1 ? 's' : '') + '</span>' +
          '<span class="doc-meta-item"><i class="fas fa-clock"></i> ' + ago + '</span>' +
        '</div>' +
        '<div class="qz-card-buttons">' +
          '<button class="doc-study-btn doc-study-btn-quiz qz-btn-main" onclick="event.stopPropagation(); Quizzes.startQuiz(\'' + doc.id + '\', \'' + nameAttr + '\')">' +
            '<i class="fas fa-play"></i> Start Quiz' +
          '</button>' +
          '<button class="qz-btn-heatmap" onclick="event.stopPropagation(); Quizzes.openHeatmap(\'' + doc.id + '\', \'' + nameAttr + '\')" title="Study Heatmap">' +
            '<i class="fas fa-chart-pie"></i>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ===========================================================================
  // QUIZ FLOW
  // ===========================================================================

  async function startQuiz(docId, docName) {
    try {
      var res = await fetch('/api/quiz/generate/' + docId);
      var data = await res.json();
      if (!res.ok || !data.success) {
        if (typeof showNotification === 'function') {
          showNotification(data.message || 'Failed to generate quiz', 'error');
        }
        return;
      }

      _questions = data.questions;
      _currentIndex = 0;
      _score = 0;
      _answered = false;
      _docId = docId;
      _docName = docName || data.filename;
      _wrongAnswers = [];

      var titleEl = document.getElementById('qzTitle');
      var subEl = document.getElementById('qzSubtitle');
      if (titleEl) titleEl.textContent = _docName;
      if (subEl) subEl.textContent = _questions.length + ' questions';

      _showView('quiz');
      _renderQuestion();
      _attachQzKeyListener();

      // Start quiz background music
      if (window.AudioManager) AudioManager.startMusic('quiz');
    } catch (err) {
      console.error('Error starting quiz:', err);
      if (typeof showNotification === 'function') {
        showNotification('Failed to start quiz', 'error');
      }
    }
  }

  function _renderQuestion() {
    var q = _questions[_currentIndex];
    _answered = false;

    // Progress
    var pct = ((_currentIndex) / _questions.length) * 100;
    var fill = document.getElementById('qzProgressFill');
    var label = document.getElementById('qzProgressLabel');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = 'Question ' + (_currentIndex + 1) + ' of ' + _questions.length;

    // Live score
    var liveScore = document.getElementById('qzLiveScore');
    var liveTotal = document.getElementById('qzLiveTotal');
    if (liveScore) liveScore.textContent = _score;
    if (liveTotal) liveTotal.textContent = _questions.length;

    // Question text
    var textEl = document.getElementById('qzQuestionText');
    if (textEl) textEl.textContent = q.question;

    // Options
    var optionsEl = document.getElementById('qzOptions');
    if (optionsEl) {
      var html = '';
      for (var i = 0; i < q.options.length; i++) {
        html +=
          '<button class="qz-option" data-index="' + i + '" onclick="Quizzes.selectAnswer(' + i + ')">' +
            '<span class="qz-option-letter">' + String.fromCharCode(65 + i) + '</span>' +
            '<span class="qz-option-text">' + _esc(q.options[i]) + '</span>' +
            '<span class="qz-option-icon"></span>' +
          '</button>';
      }
      optionsEl.innerHTML = html;
    }

    // Hide next button
    var nextBtn = document.getElementById('qzNextBtn');
    if (nextBtn) nextBtn.style.display = 'none';
  }

  function selectAnswer(selectedIndex) {
    if (_answered) return;
    _answered = true;

    var q = _questions[_currentIndex];
    var correct = q.correct_index;
    var isCorrect = selectedIndex === correct;

    // Play answer sound effect
    if (window.AudioManager) { isCorrect ? AudioManager.playCorrect() : AudioManager.playWrong(); }

    if (isCorrect) {
      _score++;
    } else {
      _wrongAnswers.push({
        question: q.question,
        selected: q.options[selectedIndex],
        correct: q.options[correct],
      });
    }

    // Style all option buttons
    var buttons = document.querySelectorAll('#qzOptions .qz-option');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      buttons[i].classList.add('qz-disabled');
      if (i === correct) {
        buttons[i].classList.add('qz-correct');
        buttons[i].querySelector('.qz-option-icon').innerHTML = '<i class="fas fa-check"></i>';
      } else if (i === selectedIndex && !isCorrect) {
        buttons[i].classList.add('qz-wrong');
        buttons[i].querySelector('.qz-option-icon').innerHTML = '<i class="fas fa-times"></i>';
      }
    }

    // Update live score
    var liveScore = document.getElementById('qzLiveScore');
    if (liveScore) liveScore.textContent = _score;

    // Show next button (or "See Results" if last question)
    var nextBtn = document.getElementById('qzNextBtn');
    if (nextBtn) {
      nextBtn.style.display = 'inline-flex';
      if (_currentIndex === _questions.length - 1) {
        nextBtn.innerHTML = 'See Results <i class="fas fa-flag-checkered"></i>';
      } else {
        nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      }
    }
  }

  function nextQuestion() {
    if (_currentIndex < _questions.length - 1) {
      _currentIndex++;
      _renderQuestion();
    } else {
      _showResults();
    }
  }

  // ===========================================================================
  // RESULTS VIEW
  // ===========================================================================

  async function _showResults() {
    // Stop quiz background music
    if (window.AudioManager) AudioManager.stopMusic();

    // Submit to server
    try {
      await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: parseInt(_docId),
          score: _score,
          total: _questions.length,
          wrong_answers: _wrongAnswers,
        }),
      });
    } catch (e) {
      console.error('Failed to save quiz result:', e);
    }

    var pct = Math.round((_score / _questions.length) * 100);

    // Update progress fill to 100%
    var fill = document.getElementById('qzProgressFill');
    if (fill) fill.style.width = '100%';

    // Populate results
    var docEl = document.getElementById('qzResultsDoc');
    if (docEl) docEl.textContent = _docName;

    var pctEl = document.getElementById('qzResultPct');
    if (pctEl) pctEl.textContent = pct + '%';

    var detailEl = document.getElementById('qzResultsDetail');
    if (detailEl) detailEl.textContent =
      'You got ' + _score + ' out of ' + _questions.length + ' questions correct.';

    // Animate score ring
    var ringFill = document.getElementById('qzRingFill');
    if (ringFill) {
      var circumference = 2 * Math.PI * 60;
      ringFill.style.strokeDasharray = circumference;
      ringFill.style.strokeDashoffset = circumference;
      ringFill.style.transition = 'none';
      setTimeout(function () {
        var offset = circumference - (circumference * pct / 100);
        ringFill.style.transition = 'stroke-dashoffset 1s ease';
        ringFill.style.strokeDashoffset = offset;
      }, 100);
    }

    // Wrong answers review
    var reviewSection = document.getElementById('qzReviewSection');
    var reviewList = document.getElementById('qzReviewList');
    if (_wrongAnswers.length > 0 && reviewSection && reviewList) {
      reviewSection.style.display = 'block';
      var reviewHtml = '';
      for (var i = 0; i < _wrongAnswers.length; i++) {
        var w = _wrongAnswers[i];
        reviewHtml +=
          '<div class="qz-review-item">' +
            '<p class="qz-review-q"><i class="fas fa-question-circle"></i> ' + _esc(w.question) + '</p>' +
            '<p class="qz-review-wrong"><i class="fas fa-times"></i> Your answer: ' + _esc(w.selected) + '</p>' +
            '<p class="qz-review-correct"><i class="fas fa-check"></i> Correct: ' + _esc(w.correct) + '</p>' +
          '</div>';
      }
      reviewList.innerHTML = reviewHtml;
    } else if (reviewSection) {
      reviewSection.style.display = 'none';
    }

    _showView('results');
  }

  function retakeQuiz() {
    startQuiz(_docId, _docName);
  }

  function exitQuiz() {
    var modal = document.getElementById('qzExitModal');
    if (modal) { modal.style.display = 'flex'; }
  }

  function cancelExit() {
    var modal = document.getElementById('qzExitModal');
    if (modal) { modal.style.display = 'none'; }
  }

  function confirmExit() {
    var modal = document.getElementById('qzExitModal');
    if (modal) { modal.style.display = 'none'; }
    if (window.AudioManager) AudioManager.stopMusic();
    _detachQzKeyListener();
    showBrowse();
  }

  // ===========================================================================
  // VIEW MANAGEMENT
  // ===========================================================================

  function _showView(view) {
    var browse = document.getElementById('qzBrowseView');
    var quiz = document.getElementById('qzQuizView');
    var results = document.getElementById('qzResultsView');
    if (browse) browse.style.display = (view === 'browse') ? 'block' : 'none';
    if (quiz) quiz.style.display = (view === 'quiz') ? 'block' : 'none';
    if (results) results.style.display = (view === 'results') ? 'block' : 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showBrowse() {
    loadDocs();
    _showView('browse');
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  function _esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function _fileIcon(ext) {
    switch (ext) {
      case 'pdf': return 'fa-file-pdf';
      case 'doc': case 'docx': return 'fa-file-word';
      case 'ppt': case 'pptx': return 'fa-file-powerpoint';
      case 'youtube': return 'fa-brands fa-youtube';
      default: return 'fa-file-alt';
    }
  }

  // ===========================================================================
  // STUDY HEATMAP MODAL
  // ===========================================================================

  var _masteryLevels = [
    { min: 0,  max: 19, icon: 'fa-face-meh',        comment: 'Keep studying, you\'ll get there!' },
    { min: 20, max: 39, icon: 'fa-face-smile',       comment: 'Good effort, room to improve!' },
    { min: 40, max: 59, icon: 'fa-face-laugh',       comment: 'Not bad! Keep pushing!' },
    { min: 60, max: 99, icon: 'fa-face-laugh-beam',  comment: 'Great job, almost there!' },
    { min: 100, max: 100, icon: 'fa-face-grin-stars', comment: 'Outstanding mastery!' },
  ];

  async function openHeatmap(docId, docName) {
    try {
      var res = await fetch('/api/quiz/heatmap/' + docId);
      var data = await res.json();

      if (!res.ok || !data.success) {
        // Show placeholder modal for no attempts
        _showHeatmapPlaceholder(docId, docName);
        return;
      }

      var score = data.score;
      var total = data.total;
      var wrong = data.wrong_answers || [];
      var pct = Math.round((score / total) * 100);

      // Populate doc name
      var docNameEl = document.getElementById('qzHeatmapDocName');
      if (docNameEl) docNameEl.textContent = docName;

      // Populate pie chart (animated via CSS transition)
      var pieEl = document.getElementById('qzHeatmapPie');
      var pieLabel = document.getElementById('qzPieLabel');
      if (pieEl) {
        pieEl.style.background = 'conic-gradient(rgba(124, 119, 198, 0.2) 0% 100%)';
        setTimeout(function () {
          var correctDeg = (pct / 100) * 360;
          pieEl.style.background =
            'conic-gradient(#7c77c6 0deg ' + correctDeg + 'deg, #e74c3c ' + correctDeg + 'deg 360deg)';
        }, 50);
      }
      if (pieLabel) pieLabel.textContent = pct + '%';

      // Populate mastery slider
      var level = pct >= 100 ? 4 : pct >= 60 ? 3 : pct >= 40 ? 2 : pct >= 20 ? 1 : 0;
      var fillEl = document.getElementById('qzMasteryFill');
      var commentEl = document.getElementById('qzMasteryComment');
      if (fillEl) {
        fillEl.style.width = '0%';
        setTimeout(function () { fillEl.style.width = pct + '%'; }, 50);
      }
      if (commentEl) commentEl.textContent = _masteryLevels[level].comment;

      // Highlight markers: reached / next-target / inactive
      var markers = document.querySelectorAll('.qz-mastery-marker');
      markers.forEach(function (m) {
        var lvl = parseInt(m.getAttribute('data-level'));
        m.classList.remove('reached', 'next-target');
        if (lvl <= level) {
          m.classList.add('reached');
        } else if (lvl === level + 1) {
          m.classList.add('next-target');
        }
      });

      // Populate wrong answers list
      var wrongList = document.getElementById('qzWrongList');
      var wrongCount = document.getElementById('qzWrongCount');
      var perfectState = document.getElementById('qzPerfectState');

      if (wrongCount) wrongCount.textContent = wrong.length + ' of ' + total;

      if (wrong.length > 0) {
        if (perfectState) perfectState.style.display = 'none';
        if (wrongList) {
          wrongList.style.display = 'block';
          var html = '';
          for (var i = 0; i < wrong.length; i++) {
            var w = wrong[i];
            html +=
              '<div class="qz-heatmap-wrong-item">' +
                '<p class="qz-hw-question"><i class="fas fa-question-circle"></i> ' + _esc(w.question) + '</p>' +
                '<p class="qz-hw-selected"><i class="fas fa-times"></i> ' + _esc(w.selected_answer) + '</p>' +
                '<p class="qz-hw-correct"><i class="fas fa-check"></i> ' + _esc(w.correct_answer) + '</p>' +
              '</div>';
          }
          wrongList.innerHTML = html;
        }
      } else {
        if (wrongList) wrongList.style.display = 'none';
        if (perfectState) perfectState.style.display = 'flex';
      }

      // Show modal with content, hide placeholder
      var placeholder = document.getElementById('qzHeatmapPlaceholder');
      var content = document.getElementById('qzHeatmapContent');
      if (placeholder) placeholder.style.display = 'none';
      if (content) content.style.display = 'block';

      var modal = document.getElementById('qzHeatmapModal');
      if (modal) modal.style.display = 'flex';

    } catch (err) {
      console.error('Error loading heatmap:', err);
      if (typeof showNotification === 'function') {
        showNotification('Failed to load study heatmap', 'error');
      }
    }
  }

  function _showHeatmapPlaceholder(docId, docName) {
    var placeholder = document.getElementById('qzHeatmapPlaceholder');
    var content = document.getElementById('qzHeatmapContent');
    var docNameEl = document.getElementById('qzHeatmapDocName');

    if (docNameEl) docNameEl.textContent = docName;
    if (content) content.style.display = 'none';
    if (placeholder) {
      placeholder.style.display = 'flex';
      // Wire up the "Start Quiz" button inside the placeholder
      var btn = document.getElementById('qzHeatmapStartBtn');
      if (btn) {
        btn.onclick = function () {
          closeHeatmap();
          startQuiz(docId, docName);
        };
      }
    }

    var modal = document.getElementById('qzHeatmapModal');
    if (modal) modal.style.display = 'flex';
  }

  function closeHeatmap() {
    var modal = document.getElementById('qzHeatmapModal');
    if (modal) modal.style.display = 'none';
  }

  // ===========================================================================
  // KEYBOARD SHORTCUTS  (attach/detach to avoid leaking into other views)
  // ===========================================================================
  var _qzKeyListenerActive = false;

  function _qzHandleKeyDown(e) {
    // 1-4 or A-D to select answer
    var key = e.key.toUpperCase();
    if (!_answered) {
      if (key >= '1' && key <= '4') { selectAnswer(parseInt(key) - 1); }
      if (key >= 'A' && key <= 'D') { selectAnswer(key.charCodeAt(0) - 65); }
    }
    // Enter or Space to go next
    if (_answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      nextQuestion();
    }
  }

  function _attachQzKeyListener() {
    if (!_qzKeyListenerActive) {
      document.addEventListener('keydown', _qzHandleKeyDown);
      _qzKeyListenerActive = true;
    }
  }

  function _detachQzKeyListener() {
    if (_qzKeyListenerActive) {
      document.removeEventListener('keydown', _qzHandleKeyDown);
      _qzKeyListenerActive = false;
    }
  }

  /** Called by Studio.js when navigating away from quizzes. */
  function cleanup() {
    _detachQzKeyListener();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  window.Quizzes = {
    loadDocs: loadDocs,
    filterDocs: filterDocs,
    showBrowse: showBrowse,
    startQuiz: startQuiz,
    selectAnswer: selectAnswer,
    nextQuestion: nextQuestion,
    retakeQuiz: retakeQuiz,
    exitQuiz: exitQuiz,
    cancelExit: cancelExit,
    confirmExit: confirmExit,
    openHeatmap: openHeatmap,
    closeHeatmap: closeHeatmap,
    cleanup: cleanup,
  };
})();
