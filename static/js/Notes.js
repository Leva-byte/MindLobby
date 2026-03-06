// ============================================================================
// MINDLOBBY — NOTES PANEL MODULE
// ============================================================================
(function () {
  'use strict';

  // ── State ──
  let _allDocs        = [];
  let _rawText        = '';
  let _isRawView      = false;
  let _currentDocId   = null;
  let _currentDocName = '';

  // ============================================================================
  // BROWSE VIEW
  // ============================================================================

  async function loadDocs() {
    try {
      const res  = await fetch('/api/documents');
      const data = await res.json();
      if (!data.success) return;

      _allDocs = data.documents || [];
      _renderDocGrid(_allDocs);
    } catch (e) {
      console.error('Notes: could not load documents:', e);
    }
  }

  function filterDocs(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) { _renderDocGrid(_allDocs); return; }

    const filtered = _allDocs.filter(d =>
      (d.original_filename || d.filename || '').toLowerCase().includes(q)
    );
    _renderDocGrid(filtered);
  }

  function _renderDocGrid(docs) {
    const grid  = document.getElementById('notesDocsGrid');
    const empty = document.getElementById('notesEmptyState');
    const search = document.querySelector('.notes-search-wrapper');
    if (!grid) return;

    if (!docs || docs.length === 0) {
      grid.style.display = 'none';
      if (empty) empty.style.display = (_allDocs.length === 0) ? 'block' : 'none';
      if (_allDocs.length > 0 && docs.length === 0) {
        grid.style.display = 'grid';
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0;">No documents match your search.</p>';
      }
      if (search) search.style.display = (_allDocs.length >= 1) ? 'flex' : 'none';
      return;
    }

    if (empty) empty.style.display = 'none';
    if (search) search.style.display = (_allDocs.length >= 1) ? 'flex' : 'none';
    grid.style.display = 'grid';
    grid.innerHTML = docs.map(_renderDocCard).join('');
  }

  function _renderDocCard(doc) {
    const ext      = doc.file_type || 'txt';
    const icon     = _fileIcon(ext);
    const date     = new Date(doc.upload_date).toLocaleDateString();
    const name     = _esc(doc.original_filename || doc.filename || '');
    const nameAttr = (doc.original_filename || doc.filename || '')
                       .replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `
      <div class="document-card" onclick="Notes.openForDocument('${doc.id}', '${nameAttr}')">
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
        <button class="doc-study-btn" onclick="event.stopPropagation(); Notes.openForDocument('${doc.id}', '${nameAttr}')">
          <i class="fas fa-sticky-note"></i> View Notes
        </button>
      </div>
    `;
  }

  function _fileIcon(ext) {
    switch (ext) {
      case 'pdf':  return 'fa-file-pdf';
      case 'doc':  case 'docx': return 'fa-file-word';
      case 'ppt':  case 'pptx': return 'fa-file-powerpoint';
      default:     return 'fa-file-alt';
    }
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ============================================================================
  // VIEWER — fetch & display markdown
  // ============================================================================

  async function openForDocument(docId, filename) {
    _showNotesPanel(docId);
    _setState('loading');

    try {
      const res  = await fetch(`/api/documents/${docId}/notes`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        _setState('error', data.message || 'Failed to load notes.');
        return;
      }

      _rawText        = data.markdown || '';
      _isRawView      = false;
      _currentDocId   = docId;
      _currentDocName = filename || '';

      const titleEl    = document.getElementById('notesPanelTitle');
      const subtitleEl = document.getElementById('notesPanelSubtitle');
      if (titleEl)    titleEl.textContent    = filename || 'Notes';
      if (subtitleEl) subtitleEl.textContent = `Extracted from ${filename || 'document'}`;

      _renderNotes();
      _setState('ready');

    } catch (err) {
      console.error('Notes: fetch error', err);
      _setState('error', 'Could not connect to server.');
    }
  }

  function _renderNotes() {
    // ── Rendered view: convert markdown to safe HTML ──
    const rendered = document.getElementById('notesRenderedContent');
    if (rendered) rendered.innerHTML = _markdownToHtml(_rawText);

    // ── Raw view: just plain text ──
    const raw = document.getElementById('notesRawContent');
    if (raw) raw.textContent = _rawText;
  }

  // ── Lightweight markdown → HTML converter ──
  // Handles: headings, bold, italic, inline code, fenced code blocks,
  // unordered/ordered lists, blockquotes, horizontal rules, tables, links
  function _markdownToHtml(md) {
    if (!md) return '<p style="color:var(--text-muted)">No content extracted from this document.</p>';

    let html = _esc(md); // escape HTML entities first

    // Restore intentional markdown syntax that got escaped
    // (we only escaped < > & — markdown chars are fine)
    html = md; // restart without escaping — we'll sanitise selectively below

    const lines  = html.split('\n');
    const output = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // ── Fenced code block ──
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(_escHtml(lines[i]));
          i++;
        }
        output.push(`<pre><code${lang ? ` class="language-${_escHtml(lang)}"` : ''}>${codeLines.join('\n')}</code></pre>`);
        i++;
        continue;
      }

      // ── Heading ──
      const heading = line.match(/^(#{1,6})\s+(.+)/);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level}>${_inlineMd(_escHtml(heading[2]))}</h${level}>`);
        i++;
        continue;
      }

      // ── Horizontal rule ──
      if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
        output.push('<hr>');
        i++;
        continue;
      }

      // ── Blockquote ──
      if (line.startsWith('>')) {
        const bqLines = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          bqLines.push(_inlineMd(_escHtml(lines[i].replace(/^>\s?/, ''))));
          i++;
        }
        output.push(`<blockquote>${bqLines.join('<br>')}</blockquote>`);
        continue;
      }

      // ── Unordered list ──
      if (/^[\*\-\+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[\*\-\+]\s/.test(lines[i])) {
          items.push(`<li>${_inlineMd(_escHtml(lines[i].replace(/^[\*\-\+]\s/, '')))}</li>`);
          i++;
        }
        output.push(`<ul>${items.join('')}</ul>`);
        continue;
      }

      // ── Ordered list ──
      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(`<li>${_inlineMd(_escHtml(lines[i].replace(/^\d+\.\s/, '')))}</li>`);
          i++;
        }
        output.push(`<ol>${items.join('')}</ol>`);
        continue;
      }

      // ── Table ──
      if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
        const headers = line.split('|').filter(c => c.trim()).map(c => `<th>${_inlineMd(_escHtml(c.trim()))}</th>`);
        i += 2; // skip separator row
        const rows = [];
        while (i < lines.length && lines[i].includes('|')) {
          const cells = lines[i].split('|').filter(c => c.trim()).map(c => `<td>${_inlineMd(_escHtml(c.trim()))}</td>`);
          rows.push(`<tr>${cells.join('')}</tr>`);
          i++;
        }
        output.push(`<table><thead><tr>${headers.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
        continue;
      }

      // ── Empty line ──
      if (line.trim() === '') {
        output.push('');
        i++;
        continue;
      }

      // ── Paragraph ──
      output.push(`<p>${_inlineMd(_escHtml(line))}</p>`);
      i++;
    }

    return output.join('\n');
  }

  // Inline markdown: bold, italic, inline code, links
  function _inlineMd(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function _escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================================
  // CONTROLS
  // ============================================================================

  function toggleView() {
    _isRawView = !_isRawView;

    const rendered    = document.getElementById('notesRenderedView');
    const raw         = document.getElementById('notesRawView');
    const toggleIcon  = document.getElementById('notesToggleIcon');
    const toggleLabel = document.getElementById('notesToggleLabel');

    if (_isRawView) {
      if (rendered) rendered.style.display = 'none';
      if (raw) raw.style.display = 'block';
      if (toggleIcon) { toggleIcon.className = 'fas fa-align-left'; }
      if (toggleLabel) toggleLabel.textContent = 'Rendered';
    } else {
      if (rendered) rendered.style.display = 'block';
      if (raw) raw.style.display = 'none';
      if (toggleIcon) { toggleIcon.className = 'fas fa-eye'; }
      if (toggleLabel) toggleLabel.textContent = 'Raw';
    }
  }

  async function copyNotes() {
    if (!_rawText) return;

    try {
      await navigator.clipboard.writeText(_rawText);
      const btn = document.getElementById('notesCopyBtn');
      if (btn) {
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<i class="fas fa-copy"></i> Copy All';
        }, 2000);
      }
    } catch {
      showNotification('Could not copy to clipboard', 'error');
    }
  }

  async function downloadDocx() {
    if (!_currentDocId) return;

    const btn = document.getElementById('notesDownloadBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    }

    try {
      const res = await fetch(`/api/documents/${_currentDocId}/notes/download`);
      if (!res.ok) {
        showNotification('Could not generate DOCX. Try again.', 'error');
        return;
      }

      // Trigger browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = (_currentDocName || 'notes').replace(/\.[^.]+$/, '') + '_notes.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification('DOCX downloaded!', 'success');
    } catch (err) {
      console.error('Download error:', err);
      showNotification('Download failed. Try again.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-word"></i> Download DOCX';
      }
    }
  }

  // ============================================================================
  // UI STATE HELPERS
  // ============================================================================

  function _setState(state, errorMsg) {
    const loading  = document.getElementById('notesLoading');
    const error    = document.getElementById('notesError');
    const errorTxt = document.getElementById('notesErrorText');
    const rendered = document.getElementById('notesRenderedView');
    const raw      = document.getElementById('notesRawView');

    const hide = el => { if (el) el.style.display = 'none'; };
    const show = (el, type = 'block') => { if (el) el.style.display = type; };

    hide(loading); hide(error); hide(rendered); hide(raw);

    if (state === 'loading') {
      show(loading);
    } else if (state === 'error') {
      if (errorTxt) errorTxt.textContent = errorMsg || 'Something went wrong.';
      show(error);
    } else if (state === 'ready') {
      show(_isRawView ? raw : rendered);
    }
  }

  function _showNotesPanel(docId) {
    // Deselect all nav items
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.remove('active');
    });

    // Mark notes nav item active
    document.querySelectorAll('.nav-item[data-view="notes"]').forEach(item => {
      item.classList.add('active');
    });

    // Hide all view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.style.display = 'none';
    });

    // Show notes panel
    const panel = document.getElementById('panel-notes');
    if (panel) panel.style.display = 'block';

    // Switch to viewer
    const browse = document.getElementById('notesBrowseView');
    const viewer = document.getElementById('notesViewerView');
    if (browse) browse.style.display = 'none';
    if (viewer) viewer.style.display = 'block';

    // Sidebar doc highlight
    document.querySelectorAll('.sidebar-doc-item').forEach(item => {
      item.classList.toggle('active', item.dataset.docId === String(docId));
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showBrowse() {
    const browse = document.getElementById('notesBrowseView');
    const viewer = document.getElementById('notesViewerView');
    if (browse) browse.style.display = 'block';
    if (viewer) viewer.style.display = 'none';

    _rawText        = '';
    _isRawView      = false;
    _currentDocId   = null;
    _currentDocName = '';

    document.querySelectorAll('.sidebar-doc-item').forEach(item => {
      item.classList.remove('active');
    });

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === 'notes');
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================================
  // VIEWER ACTIONS — jump to Flashcards or Quiz for current document
  // ============================================================================

  function _transitionTo(viewName, callback) {
    // Create overlay on the main content area only
    const content = document.querySelector('.main-content') || document.querySelector('.studio-content') || document.body;
    const overlay = document.createElement('div');
    overlay.className = 'notes-transition-overlay';
    overlay.innerHTML = `
      <div class="notes-transition-inner">
        <img src="/static/images/favicon.png" class="notes-transition-logo">
      </div>`;
    content.appendChild(overlay);

    // Fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('visible'));
    });

    // Switch view under the overlay
    setTimeout(() => {
      if (typeof showView === 'function') showView(viewName);
      if (typeof callback === 'function') callback();
    }, 250);

    // Fade out and remove
    setTimeout(() => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 350);
    }, 600);
  }

  function openFlashcards() {
    if (!_currentDocId) return;
    _transitionTo('flashcards', () => {
      if (window.Flashcards && Flashcards.openForDocument) {
        setTimeout(() => Flashcards.openForDocument(_currentDocId, _currentDocName), 50);
      }
    });
  }

  function openQuiz() {
    if (!_currentDocId) return;
    _transitionTo('quizzes', () => {
      if (window.Quizzes && Quizzes.startQuiz) {
        setTimeout(() => Quizzes.startQuiz(_currentDocId, _currentDocName), 50);
      }
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  window.Notes = {
    loadDocs,
    filterDocs,
    openForDocument,
    showBrowse,
    toggleView,
    copyNotes,
    downloadDocx,
    openFlashcards,
    openQuiz,
  };

})();