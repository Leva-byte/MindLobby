// ============================================================================
// MINDLOBBY - TOPICS MODULE
// ============================================================================
(function () {
  'use strict';

  // --- State ---
  let _allTopics = [];
  let _currentTopic = null;
  let _editMode = false;
  let _selectedColor = '#7c77c6';

  const COLORS = [
    { hex: '#7c77c6', label: 'Purple' },
    { hex: '#e74c3c', label: 'Red' },
    { hex: '#e67e22', label: 'Orange' },
    { hex: '#f1c40f', label: 'Yellow' },
    { hex: '#2ecc71', label: 'Green' },
    { hex: '#1abc9c', label: 'Teal' },
    { hex: '#3498db', label: 'Blue' },
    { hex: '#9b59b6', label: 'Violet' },
    { hex: '#e91e63', label: 'Pink' },
    { hex: '#00bcd4', label: 'Cyan' },
  ];

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  function _fileIcon(ext) {
    const map = {
      pdf: 'fa-file-pdf',
      doc: 'fa-file-word',
      docx: 'fa-file-word',
      ppt: 'fa-file-powerpoint',
      pptx: 'fa-file-powerpoint',
      txt: 'fa-file-alt',
      youtube: 'fa-brands fa-youtube',
    };
    return map[ext] || 'fa-file';
  }

  // ===========================================================================
  // LOAD & RENDER TOPICS
  // ===========================================================================

  async function loadTopics() {
    try {
      const res = await fetch('/api/topics');
      const data = await res.json();
      if (!data.success) return;

      _allTopics = data.topics;

      // Update sidebar badge
      const badge = document.querySelector('.nav-item[data-view="topics"] .nav-badge');
      if (badge) badge.textContent = _allTopics.length;

      _renderTopicsView(_allTopics);
    } catch (e) {
      console.error('Failed to load topics:', e);
    }
  }

  function _renderTopicsView(topics) {
    const grid = document.getElementById('topicsGrid');
    const empty = document.getElementById('topicsEmptyState');
    const search = document.getElementById('topicsSearchBar');
    const detail = document.getElementById('topicDetail');

    // Always hide detail when showing grid
    if (detail) detail.style.display = 'none';

    if (!topics || topics.length === 0) {
      if (grid) grid.style.display = 'none';
      if (search) search.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';
    if (search) search.style.display = _allTopics.length >= 5 ? 'block' : 'none';
    if (grid) {
      grid.style.display = 'grid';
      grid.innerHTML = topics.map(_renderTopicCard).join('');
    }
  }

  function _renderTopicCard(topic) {
    const docLabel = topic.doc_count === 1 ? '1 document' : `${topic.doc_count} documents`;
    return `
      <div class="topic-card" onclick="Topics.openDetail(${topic.id})">
        <div class="topic-card-color-bar" style="background:${topic.color};"></div>
        <div class="topic-card-icon" style="background:${topic.color}22; color:${topic.color};">
          <i class="fas fa-folder"></i>
        </div>
        <div class="topic-card-name">${_esc(topic.name)}</div>
        <div class="topic-card-count"><i class="fas fa-file-alt"></i> ${docLabel}</div>
      </div>
    `;
  }

  function filterTopics(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      _renderTopicsView(_allTopics);
      return;
    }
    const filtered = _allTopics.filter(t => t.name.toLowerCase().includes(q));
    _renderTopicsView(filtered);
  }

  // ===========================================================================
  // TOPIC DETAIL VIEW
  // ===========================================================================

  async function openDetail(topicId) {
    try {
      const res = await fetch(`/api/topics/${topicId}/documents`);
      const data = await res.json();
      if (!data.success) {
        showNotification(data.message || 'Failed to load topic', 'error');
        return;
      }

      _currentTopic = data.topic;
      const docs = data.documents;

      // Hide grid/empty/search, show detail
      const grid = document.getElementById('topicsGrid');
      const empty = document.getElementById('topicsEmptyState');
      const search = document.getElementById('topicsSearchBar');
      const detail = document.getElementById('topicDetail');

      if (grid) grid.style.display = 'none';
      if (empty) empty.style.display = 'none';
      if (search) search.style.display = 'none';
      if (detail) detail.style.display = 'block';

      // Populate header
      const colorDot = document.getElementById('detailColorDot');
      const nameEl = document.getElementById('detailTopicName');
      const countEl = document.getElementById('detailDocCount');

      if (colorDot) colorDot.style.background = _currentTopic.color;
      if (nameEl) nameEl.textContent = _currentTopic.name;
      if (countEl) {
        const label = docs.length === 1 ? '1 document' : `${docs.length} documents`;
        countEl.textContent = label;
      }

      // Render docs or empty
      const docList = document.getElementById('topicDocList');
      const docEmpty = document.getElementById('topicDocEmpty');

      if (docs.length === 0) {
        if (docList) docList.style.display = 'none';
        if (docEmpty) docEmpty.style.display = 'block';
      } else {
        if (docEmpty) docEmpty.style.display = 'none';
        if (docList) {
          docList.style.display = 'grid';
          docList.innerHTML = docs.map(_renderDocCard).join('');
        }
      }
    } catch (e) {
      console.error('Error opening topic detail:', e);
      showNotification('Failed to load topic', 'error');
    }
  }

  function _renderDocCard(doc) {
    const ext = doc.file_type || 'txt';
    const icon = _fileIcon(ext);
    const date = new Date(doc.upload_date).toLocaleDateString();
    const escapedName = _esc(doc.original_filename || '');
    const escapedNameAttr = escapedName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const badgeLabel = ext === 'youtube' ? 'YOUTUBE' : ext.toUpperCase();
    const iconPrefix = ext === 'youtube' ? '' : 'fas ';

    return `
      <div class="document-card">
        <div class="doc-header">
          <div class="doc-icon doc-icon-${ext}"><i class="${iconPrefix}${icon}"></i></div>
          <span class="doc-type-badge doc-type-${ext}">${badgeLabel}</span>
          <div class="doc-actions">
            <button class="doc-rename-btn" onclick="openRenameModal('${doc.id}', '${escapedNameAttr}')" title="Rename">
              <i class="fas fa-pen"></i>
            </button>
            <button class="doc-delete-btn" onclick="deleteDocument('${doc.id}', this)" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <h3 class="doc-title">${escapedName}</h3>
        <div class="doc-meta">
          <span class="doc-meta-item"><i class="fas fa-layer-group"></i> ${doc.flashcard_count} cards</span>
          <span class="doc-meta-item"><i class="fas fa-calendar"></i> ${date}</span>
        </div>
        <div class="topic-doc-card-actions">
          <button class="doc-study-btn" onclick="openFlashcardsForDocument('${doc.id}', '${escapedNameAttr}')">
            <i class="fas fa-layer-group"></i> Study Flashcards
          </button>
          <button class="topic-doc-unlink-btn" onclick="Topics.removeDocFromTopic(${doc.id})" title="Remove from topic">
            <i class="fas fa-unlink"></i> Remove
          </button>
        </div>
      </div>
    `;
  }

  function closeDetail() {
    const detail = document.getElementById('topicDetail');
    if (detail) detail.style.display = 'none';
    _currentTopic = null;
    loadTopics();
  }

  function refreshDetail() {
    if (_currentTopic) openDetail(_currentTopic.id);
  }

  // ===========================================================================
  // CREATE / EDIT MODAL
  // ===========================================================================

  function _renderColorPicker() {
    const container = document.getElementById('topicColorPicker');
    if (!container) return;

    container.innerHTML = COLORS.map(c =>
      `<div class="color-swatch${c.hex === _selectedColor ? ' selected' : ''}"
            style="background:${c.hex};"
            title="${c.label}"
            onclick="Topics.setColor('${c.hex}')"></div>`
    ).join('');
  }

  function setColor(hex) {
    _selectedColor = hex;
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.style.background === hex || s.style.backgroundColor === hex);
    });
    // More reliable: re-render
    _renderColorPicker();
  }

  function openCreateModal() {
    _editMode = false;
    _selectedColor = '#7c77c6';

    const titleEl = document.getElementById('topicModalTitle');
    const saveBtnText = document.getElementById('topicModalSaveBtnText');
    const nameInput = document.getElementById('topicNameInput');

    if (titleEl) titleEl.textContent = 'Create Topic';
    if (saveBtnText) saveBtnText.textContent = 'Create Topic';
    if (nameInput) nameInput.value = '';

    _renderColorPicker();
    _openModal('topicModalBackdrop', 'topicModal');
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 200);
  }

  function openEditModal() {
    if (!_currentTopic) return;
    _editMode = true;
    _selectedColor = _currentTopic.color;

    const titleEl = document.getElementById('topicModalTitle');
    const saveBtnText = document.getElementById('topicModalSaveBtnText');
    const nameInput = document.getElementById('topicNameInput');

    if (titleEl) titleEl.textContent = 'Edit Topic';
    if (saveBtnText) saveBtnText.textContent = 'Save Changes';
    if (nameInput) nameInput.value = _currentTopic.name;

    _renderColorPicker();
    _openModal('topicModalBackdrop', 'topicModal');
    setTimeout(() => { if (nameInput) { nameInput.focus(); nameInput.select(); } }, 200);
  }

  function closeModal() {
    _closeModal('topicModalBackdrop', 'topicModal');
  }

  async function saveModal() {
    const nameInput = document.getElementById('topicNameInput');
    const name = (nameInput ? nameInput.value : '').trim();

    if (!name) {
      showNotification('Topic name is required', 'warning');
      return;
    }

    try {
      if (_editMode && _currentTopic) {
        // Update existing
        const res = await fetch(`/api/topics/${_currentTopic.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color: _selectedColor }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification('Topic updated', 'success');
          closeModal();
          // Refresh detail view
          openDetail(_currentTopic.id);
        } else {
          showNotification(data.message || 'Update failed', 'error');
        }
      } else {
        // Create new
        const res = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color: _selectedColor }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification(`Topic "${name}" created!`, 'success');
          closeModal();
          loadTopics();
        } else {
          showNotification(data.message || 'Create failed', 'error');
        }
      }
    } catch (e) {
      console.error('Error saving topic:', e);
      showNotification('Network error saving topic', 'error');
    }
  }

  // ===========================================================================
  // ADD DOCUMENT TO TOPIC MODAL
  // ===========================================================================

  async function openAddDocumentModal() {
    if (!_currentTopic) return;

    try {
      // Fetch all user docs and docs already in this topic in parallel
      const [allRes, topicRes] = await Promise.all([
        fetch('/api/documents'),
        fetch(`/api/topics/${_currentTopic.id}/documents`),
      ]);
      const allData = await allRes.json();
      const topicData = await topicRes.json();

      if (!allData.success) return;

      const allDocs = allData.documents || [];
      const topicDocIds = new Set((topicData.documents || []).map(d => d.id));

      // Single-topic: only show docs in THIS topic or docs with NO topic at all
      const filteredDocs = allDocs.filter(doc => {
        if (topicDocIds.has(doc.id)) return true;           // already in this topic
        return !doc.topics || doc.topics.length === 0;      // unassigned
      });

      const listEl = document.getElementById('addDocList');
      const emptyEl = document.getElementById('addDocEmpty');

      if (filteredDocs.length === 0) {
        if (listEl) listEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        if (listEl) {
          listEl.style.display = 'flex';
          listEl.innerHTML = filteredDocs.map(doc => {
            const inTopic = topicDocIds.has(doc.id);
            const icon = _fileIcon(doc.file_type);
            const name = doc.original_filename || doc.filename;
            return `
              <div class="add-doc-item${inTopic ? ' already-added' : ''}" id="addDocItem${doc.id}">
                <span class="add-doc-item-icon"><i class="fas ${icon}"></i></span>
                <span class="add-doc-item-name">${_esc(name)}</span>
                ${inTopic
                  ? '<span class="btn-add-to-topic added">Added</span>'
                  : `<button class="btn-add-to-topic" onclick="Topics.addDocumentToTopic(${doc.id}, this)">Add</button>`
                }
              </div>
            `;
          }).join('');
        }
      }

      _openModal('addDocModalBackdrop', 'addDocModal');
    } catch (e) {
      console.error('Error loading documents for add modal:', e);
      showNotification('Failed to load documents', 'error');
    }
  }

  function closeAddDocModal() {
    _closeModal('addDocModalBackdrop', 'addDocModal');
    // Refresh detail to show updated list
    if (_currentTopic) openDetail(_currentTopic.id);
  }

  async function addDocumentToTopic(docId, btnEl) {
    if (!_currentTopic) return;

    try {
      const res = await fetch(`/api/topics/${_currentTopic.id}/documents/${docId}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        // Update button to show "Added"
        if (btnEl) {
          btnEl.outerHTML = '<span class="btn-add-to-topic added">Added</span>';
        }
        const itemEl = document.getElementById(`addDocItem${docId}`);
        if (itemEl) itemEl.classList.add('already-added');
      } else {
        showNotification(data.message || 'Failed to add document', 'error');
      }
    } catch (e) {
      showNotification('Network error adding document', 'error');
    }
  }

  async function removeDocFromTopic(docId) {
    if (!_currentTopic) return;

    try {
      const res = await fetch(`/api/topics/${_currentTopic.id}/documents/${docId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        showNotification('Document removed from topic', 'success');
        openDetail(_currentTopic.id);
      } else {
        showNotification(data.message || 'Failed to remove document', 'error');
      }
    } catch (e) {
      showNotification('Network error removing document', 'error');
    }
  }

  // ===========================================================================
  // DELETE TOPIC
  // ===========================================================================

  function promptDeleteTopic() {
    if (!_currentTopic) return;

    // Reuse the existing confirm modal from Studio
    const backdrop = document.getElementById('confirmBackdrop');
    const modal = document.getElementById('confirmModal');
    const cancelBtn = document.getElementById('confirmCancel');
    const deleteBtn = document.getElementById('confirmDelete');
    const titleEl = modal ? modal.querySelector('.confirm-title') : null;
    const msgEl = modal ? modal.querySelector('.confirm-message') : null;

    if (!backdrop || !modal) return;

    // Customize text for topic deletion
    if (titleEl) titleEl.textContent = 'Delete Topic';
    if (msgEl) msgEl.textContent = 'This will delete the topic. Your documents will NOT be deleted — they will remain in My Documents.';

    backdrop.classList.add('open');
    modal.classList.add('open');

    function close() {
      backdrop.classList.remove('open');
      modal.classList.remove('open');
      // Restore default text
      if (titleEl) titleEl.textContent = 'Delete Document';
      if (msgEl) msgEl.textContent = 'This will permanently delete this document and all its flashcards. This action cannot be undone.';
      cancelBtn.removeEventListener('click', onCancel);
      deleteBtn.removeEventListener('click', onConfirm);
      backdrop.removeEventListener('click', onCancel);
    }

    function onCancel() { close(); }

    async function onConfirm() {
      close();
      try {
        const res = await fetch(`/api/topics/${_currentTopic.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showNotification('Topic deleted', 'success');
          _currentTopic = null;
          const detail = document.getElementById('topicDetail');
          if (detail) detail.style.display = 'none';
          loadTopics();
        } else {
          showNotification(data.message || 'Delete failed', 'error');
        }
      } catch (e) {
        showNotification('Network error deleting topic', 'error');
      }
    }

    cancelBtn.addEventListener('click', onCancel);
    deleteBtn.addEventListener('click', onConfirm);
    backdrop.addEventListener('click', onCancel);
  }

  // ===========================================================================
  // MODAL HELPERS
  // ===========================================================================

  function _openModal(backdropId, modalId) {
    const backdrop = document.getElementById(backdropId);
    const modal = document.getElementById(modalId);
    if (backdrop) backdrop.classList.add('open');
    if (modal) modal.classList.add('open');
  }

  function _closeModal(backdropId, modalId) {
    const backdrop = document.getElementById(backdropId);
    const modal = document.getElementById(modalId);
    if (backdrop) backdrop.classList.remove('open');
    if (modal) modal.classList.remove('open');
  }

  function _esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===========================================================================
  // INIT
  // ===========================================================================

  // Fetch topic count and update sidebar badge on page load
  async function _updateBadgeCount() {
    try {
      const res = await fetch('/api/topics');
      const data = await res.json();
      if (data.success) {
        _allTopics = data.topics;
        const badge = document.querySelector('.nav-item[data-view="topics"] .nav-badge');
        if (badge) badge.textContent = _allTopics.length;
      }
    } catch (e) { /* silent */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    _renderColorPicker();
    _updateBadgeCount();

    // Handle Enter key in topic name input
    const nameInput = document.getElementById('topicNameInput');
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveModal();
        if (e.key === 'Escape') closeModal();
      });
    }
  });

  // Expose public API
  window.Topics = {
    loadTopics,
    filterTopics,
    openCreateModal,
    openEditModal,
    closeModal,
    saveModal,
    openDetail,
    closeDetail,
    openAddDocumentModal,
    closeAddDocModal,
    addDocumentToTopic,
    removeDocFromTopic,
    promptDeleteTopic,
    refreshDetail,
    setColor,
  };
})();
