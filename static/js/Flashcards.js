// ============================================================================
// MINDLOBBY - FLASHCARDS PANEL MODULE
// ============================================================================
(function () {
  'use strict';

  // --- State ---
  let _cards = [];
  let _index = 0;

  // ===========================================================================
  // PUBLIC: Open flashcard panel for a document (fetches from API)
  // ===========================================================================
  async function openForDocument(docId, filename) {
    try {
      const res = await fetch(`/api/flashcards/${docId}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        showNotification(data.message || 'Failed to load flashcards', 'error');
        return;
      }

      const cards = data.flashcards || [];
      if (cards.length === 0) {
        showNotification('No flashcards found for this document', 'warning');
        return;
      }

      openPanel(cards, filename, `${cards.length} flashcards`, docId);
    } catch (err) {
      console.error('Error loading flashcards:', err);
      showNotification('Failed to load flashcards', 'error');
    }
  }

  // ===========================================================================
  // PUBLIC: Open with pre-loaded card data (used after upload)
  // ===========================================================================
  function openPanel(cards, title, subtitle, docId) {
    _cards = cards || [];
    _index = 0;

    const titleEl = document.getElementById('fcPanelTitle');
    const subtitleEl = document.getElementById('fcPanelSubtitle');
    if (titleEl) titleEl.textContent = title || 'Flashcards';
    if (subtitleEl) subtitleEl.textContent = subtitle || '';

    _renderCurrentCard();

    // Show flashcard panel WITHOUT highlighting the Flashcards nav item
    _showFlashcardPanel(docId);
  }

  function _showFlashcardPanel(docId) {
    // Deselect all nav items
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.remove('active');
    });

    // Hide all view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.style.display = 'none';
    });

    // Show flashcard panel
    const target = document.getElementById('panel-flashcards');
    if (target) target.style.display = 'block';

    // Highlight the selected document in sidebar
    document.querySelectorAll('.sidebar-doc-item').forEach(item => {
      item.classList.remove('active');
    });
    if (docId) {
      document.querySelectorAll('.sidebar-doc-item').forEach(item => {
        if (item.dataset.docId === String(docId)) {
          item.classList.add('active');
        }
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closePanel() {
    if (typeof showView === 'function') {
      showView('overview');
    }
  }

  // ===========================================================================
  // CARD RENDERING
  // ===========================================================================
  function _renderCurrentCard() {
    if (!_cards.length) return;

    const card = _cards[_index];
    const qEl    = document.getElementById('fcPanelQuestion');
    const aEl    = document.getElementById('fcPanelAnswer');
    const fill   = document.getElementById('fcPanelProgressFill');
    const label  = document.getElementById('fcPanelProgressLabel');
    const prev   = document.getElementById('fcPanelPrevBtn');
    const next   = document.getElementById('fcPanelNextBtn');
    const inner  = document.getElementById('fcPanelCardInner');

    if (qEl) qEl.textContent = card.question || '';
    if (aEl) aEl.textContent = card.answer || '';

    const progress = ((_index + 1) / _cards.length) * 100;
    if (fill) fill.style.width = `${progress}%`;
    if (label) label.textContent = `Card ${_index + 1} of ${_cards.length}`;

    if (prev) prev.disabled = _index === 0;
    if (next) next.disabled = _index === _cards.length - 1;

    // Always show front face on navigation
    if (inner) inner.classList.remove('flipped');
  }

  function flipCard() {
    const inner = document.getElementById('fcPanelCardInner');
    if (inner) inner.classList.toggle('flipped');
  }

  function navigateCard(direction) {
    const newIndex = _index + direction;
    if (newIndex >= 0 && newIndex < _cards.length) {
      _index = newIndex;
      _renderCurrentCard();
    }
  }

  function shuffleCards() {
    for (let i = _cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_cards[i], _cards[j]] = [_cards[j], _cards[i]];
    }
    _index = 0;
    _renderCurrentCard();
    showNotification('Cards shuffled!', 'success');
  }

  function restartCards() {
    _index = 0;
    _renderCurrentCard();
    showNotification('Restarted from beginning', 'success');
  }

  // ===========================================================================
  // KEYBOARD SHORTCUTS
  // ===========================================================================
  document.addEventListener('keydown', (e) => {
    const panel = document.getElementById('panel-flashcards');
    if (!panel || panel.style.display === 'none') return;

    if (e.key === 'ArrowRight') navigateCard(1);
    if (e.key === 'ArrowLeft') navigateCard(-1);
    if (e.key === ' ') { e.preventDefault(); flipCard(); }
  });

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  window.Flashcards = {
    openForDocument,
    openPanel,
    closePanel,
    flipCard,
    navigateCard,
    shuffleCards,
    restartCards,
  };

  // Legacy compatibility shim for Topics.js inline onclick handlers
  window.openFlashcardsForDocument = function (docId, filename) {
    openForDocument(docId, filename);
  };
})();
