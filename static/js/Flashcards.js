// ============================================================================
// MINDLOBBY - FLASHCARDS PANEL MODULE
// ============================================================================
(function () {
  'use strict';

  // --- State ---
  let _cards = [];
  let _index = 0;
  let _allDocs = [];
  let _currentDocId = null;
  let _currentDocName = '';

  // ===========================================================================
  // BROWSE VIEW — document card grid
  // ===========================================================================

  async function loadDocs() {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (!data.success) return;

      _allDocs = data.documents || [];
      _renderDocGrid(_allDocs);
    } catch (e) {
      console.error('Could not load documents:', e);
    }
  }

  function filterDocs(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      _renderDocGrid(_allDocs);
      return;
    }
    const filtered = _allDocs.filter(d =>
      (d.original_filename || d.filename || '').toLowerCase().includes(q)
    );
    _renderDocGrid(filtered);
  }

  function _renderDocGrid(docs) {
    const grid = document.getElementById('fcDocsGrid');
    const empty = document.getElementById('fcEmptyState');
    const search = document.querySelector('.fc-search-wrapper');
    if (!grid) return;

    if (!docs || docs.length === 0) {
      grid.style.display = 'none';
      // Show empty state only when there are truly no docs at all
      if (empty) empty.style.display = (_allDocs.length === 0) ? 'block' : 'none';
      // If searching with no results, hide empty state but keep grid hidden
      if (_allDocs.length > 0 && empty) empty.style.display = 'none';
      if (search) search.style.display = (_allDocs.length >= 1) ? 'flex' : 'none';
      // Show "no results" hint when filtering returns nothing
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
    const ext = doc.file_type || 'txt';
    const icon = _fileIcon(ext);
    const date = new Date(doc.upload_date).toLocaleDateString();
    const name = _esc(doc.original_filename || doc.filename || '');
    const nameAttr = (doc.original_filename || doc.filename || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `
      <div class="document-card" onclick="Flashcards.openForDocument('${doc.id}', '${nameAttr}')">
        <div class="doc-header">
          <div class="doc-icon"><i class="fas ${icon}"></i></div>
          <div class="doc-actions">
            <button class="doc-rename-btn" onclick="event.stopPropagation(); openRenameModal('${doc.id}', '${nameAttr}')" title="Rename">
              <i class="fas fa-pen"></i>
            </button>
            <button class="doc-delete-btn" onclick="event.stopPropagation(); deleteDocument('${doc.id}', this)" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <span class="doc-type-badge doc-type-${ext}">${ext.toUpperCase()}</span>
        <h3 class="doc-title">${name}</h3>
        <div class="doc-meta">
          <span class="doc-meta-item"><i class="fas fa-layer-group"></i> ${doc.flashcard_count || 0} cards</span>
          <span class="doc-meta-item"><i class="fas fa-calendar"></i> ${date}</span>
        </div>
        <button class="doc-study-btn" onclick="event.stopPropagation(); Flashcards.openForDocument('${doc.id}', '${nameAttr}')">
          <i class="fas fa-layer-group"></i> Study Flashcards
        </button>
      </div>
    `;
  }

  function _fileIcon(ext) {
    switch (ext) {
      case 'pdf': return 'fa-file-pdf';
      case 'doc': case 'docx': return 'fa-file-word';
      case 'ppt': case 'pptx': return 'fa-file-powerpoint';
      default: return 'fa-file-alt';
    }
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showBrowse() {
    const browse = document.getElementById('fcBrowseView');
    const viewer = document.getElementById('fcViewerView');
    if (browse) browse.style.display = 'block';
    if (viewer) viewer.style.display = 'none';

    // Clear sidebar doc selection
    document.querySelectorAll('.sidebar-doc-item').forEach(item => {
      item.classList.remove('active');
    });

    // Re-highlight the Flashcards nav item
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === 'flashcards');
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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

      _currentDocId = docId;
      _currentDocName = filename || '';
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
    if (docId) _currentDocId = docId;
    if (title) _currentDocName = title;

    const titleEl = document.getElementById('fcPanelTitle');
    const subtitleEl = document.getElementById('fcPanelSubtitle');
    if (titleEl) titleEl.textContent = title || 'Flashcards';
    if (subtitleEl) subtitleEl.textContent = subtitle || '';

    _renderCurrentCard();

    // Show flashcard panel with viewer visible, browse hidden
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

    // Switch to viewer sub-view
    const browse = document.getElementById('fcBrowseView');
    const viewer = document.getElementById('fcViewerView');
    if (browse) browse.style.display = 'none';
    if (viewer) viewer.style.display = 'block';

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
    showBrowse();
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
  // CROSS-PANEL NAVIGATION
  // ===========================================================================
  function _transitionTo(viewName, callback) {
    const content = document.querySelector('.main-content') || document.querySelector('.studio-content') || document.body;
    const overlay = document.createElement('div');
    overlay.className = 'notes-transition-overlay';
    overlay.innerHTML = `
      <div class="notes-transition-inner">
        <img src="/static/images/favicon.png" class="notes-transition-logo">
      </div>`;
    content.appendChild(overlay);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('visible'));
    });

    setTimeout(() => {
      if (typeof showView === 'function') showView(viewName);
      if (typeof callback === 'function') callback();
    }, 250);

    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 350);
    }, 600);
  }

  function openQuiz() {
    if (!_currentDocId) return;
    _transitionTo('quizzes', () => {
      showBrowse(); // Reset to grid under the overlay so returning shows document selection
      if (window.Quizzes && Quizzes.startQuiz) {
        setTimeout(() => Quizzes.startQuiz(_currentDocId, _currentDocName), 50);
      }
    });
  }

  function openNotes() {
    if (!_currentDocId) return;
    _transitionTo('notes', () => {
      showBrowse(); // Reset to grid under the overlay so returning shows document selection
      if (window.Notes && Notes.openForDocument) {
        setTimeout(() => Notes.openForDocument(_currentDocId, _currentDocName), 50);
      }
    });
  }

  // ===========================================================================
  // KEYBOARD SHORTCUTS
  // ===========================================================================
  document.addEventListener('keydown', (e) => {
    const viewer = document.getElementById('fcViewerView');
    if (!viewer || viewer.style.display === 'none') return;

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
    loadDocs,
    filterDocs,
    showBrowse,
    openQuiz,
    openNotes,
  };

  // Legacy compatibility shim for Topics.js inline onclick handlers
  window.openFlashcardsForDocument = function (docId, filename) {
    openForDocument(docId, filename);
  };
})();
