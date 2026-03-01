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

  function _renderDocCard(doc) {
    var ext = doc.file_type || 'txt';
    var icon = _fileIcon(ext);
    var name = _esc(doc.original_filename || doc.filename || '');
    var nameAttr = (doc.original_filename || doc.filename || '')
      .replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var date = new Date(doc.upload_date).toLocaleDateString();

    // Quiz history badge
    var result = _quizResultsMap[doc.id];
    var historyBadge = '';
    if (result) {
      historyBadge =
        '<span class="qz-history-badge">' +
          '<i class="fas fa-trophy"></i> Best: ' + result.best_pct + '% ' +
          '(' + result.attempts + ' attempt' + (result.attempts !== 1 ? 's' : '') + ')' +
        '</span>';
    }

    return (
      '<div class="document-card" onclick="Quizzes.startQuiz(\'' + doc.id + '\', \'' + nameAttr + '\')">' +
        '<div class="doc-header">' +
          '<div class="doc-icon"><i class="fas ' + icon + '"></i></div>' +
        '</div>' +
        '<span class="doc-type-badge doc-type-' + ext + '">' + ext.toUpperCase() + '</span>' +
        '<h3 class="doc-title">' + name + '</h3>' +
        '<div class="doc-meta">' +
          '<span class="doc-meta-item"><i class="fas fa-layer-group"></i> ' + (doc.flashcard_count || 0) + ' cards</span>' +
          '<span class="doc-meta-item"><i class="fas fa-calendar"></i> ' + date + '</span>' +
        '</div>' +
        historyBadge +
        '<button class="doc-study-btn qz-start-btn" onclick="event.stopPropagation(); Quizzes.startQuiz(\'' + doc.id + '\', \'' + nameAttr + '\')">' +
          '<i class="fas fa-play"></i> Start Quiz' +
        '</button>' +
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
    if (liveTotal) liveTotal.textContent = _currentIndex;

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
    var liveTotal = document.getElementById('qzLiveTotal');
    if (liveScore) liveScore.textContent = _score;
    if (liveTotal) liveTotal.textContent = _currentIndex + 1;

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
    // Submit to server
    try {
      await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: parseInt(_docId),
          score: _score,
          total: _questions.length,
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
      default: return 'fa-file-alt';
    }
  }

  // ===========================================================================
  // KEYBOARD SHORTCUTS
  // ===========================================================================
  document.addEventListener('keydown', function (e) {
    var quizView = document.getElementById('qzQuizView');
    if (!quizView || quizView.style.display === 'none') return;

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
  });

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
  };
})();
