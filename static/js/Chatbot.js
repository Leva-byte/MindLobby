// ============================================================================
// MINDLOBBY — iTERA CHATBOT MODULE
// ============================================================================
(function () {
  'use strict';

  // --- State ---
  let _messages = []; // { role: 'user'|'assistant', content: '' }
  let _isSending = false;
  let _documentId = null;       // null = general mode
  let _documentFilename = null; // display name for the banner

  // ===========================================================================
  // DOCUMENT MODE
  // ===========================================================================

  /**
   * Load a document into iTERA's context.
   * Call this from any page that has a document open, e.g.:
   *
   *   Chatbot.loadDocument(42, 'Chapter 3 - French Revolution.pdf');
   *
   * @param {number} docId       - The document's database ID
   * @param {string} filename    - The display name shown in the banner
   */
  function loadDocument(docId, filename) {
    _documentId = docId;
    _documentFilename = filename || 'Document';
    _updateDocumentUI(true);
    // Reset conversation so the new context starts fresh
    _messages = [];
    _clearMessages();
    _appendBubble('bot',
      'Document loaded! I\'m now reading "' + _documentFilename + '". ' +
      'Ask me anything about it — I can explain concepts, quiz you, or summarise sections.'
    );
  }

  /**
   * Clear the loaded document and return to general mode.
   * Also called by the ✕ button on the banner.
   */
  function clearDocument() {
    _documentId = null;
    _documentFilename = null;
    _updateDocumentUI(false);
    _messages = [];
    _clearMessages();

    // Restore the original welcome bubble
    _appendBubble('bot', 'Hi! I\'m iTERA, your AI study buddy. Ask me anything about MindLobby or your studies!');

    // Restore suggestion pills
    const suggestions = document.getElementById('chatSuggestions');
    if (suggestions) suggestions.classList.remove('hidden');
  }

  /** Update all visual indicators when document mode changes. */
  function _updateDocumentUI(isDocMode) {
    const panel       = document.getElementById('chatPanel');
    const banner      = document.getElementById('chatDocBanner');
    const label       = document.getElementById('chatDocLabel');
    const input       = document.getElementById('chatInput');
    const suggestions = document.getElementById('chatSuggestions');

    if (isDocMode) {
      if (label)  label.textContent = _documentFilename;
      if (banner) banner.classList.add('visible');
      if (panel)  panel.classList.add('doc-mode');
      if (input)  input.placeholder = 'Ask about this document...';
      if (suggestions) suggestions.classList.add('hidden');
    } else {
      if (banner) banner.classList.remove('visible');
      if (panel)  panel.classList.remove('doc-mode');
      if (input)  input.placeholder = 'Ask iTERA anything...';
    }
  }

  // ===========================================================================
  // TOGGLE PANEL
  // ===========================================================================
  function toggle() {
    const panel = document.getElementById('chatPanel');
    const fab = document.getElementById('chatFab');
    if (!panel) return;

    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    if (fab) fab.classList.toggle('hidden', !isOpen);

    // Focus input when opening
    if (!isOpen) {
      setTimeout(() => {
        const input = document.getElementById('chatInput');
        if (input) input.focus();
      }, 300);
    }
  }

  // ===========================================================================
  // SEND MESSAGE
  // ===========================================================================
  async function send() {
    if (_isSending) return;

    const input = document.getElementById('chatInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    _autoResizeInput(input);

    // Add user message
    _messages.push({ role: 'user', content: text });
    _appendBubble('user', text);
    _hideSuggestions();

    // Show typing indicator
    _isSending = true;
    _setSendEnabled(false);
    const typingEl = _showTyping();

    try {
      // Build request body — include document_id when in document mode
      const requestBody = { messages: _messages };
      if (_documentId !== null) {
        requestBody.document_id = _documentId;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      // Remove typing indicator
      if (typingEl) typingEl.remove();

      if (data.success && data.reply) {
        _messages.push({ role: 'assistant', content: data.reply });
        _appendBubble('bot', data.reply);
      } else {
        _appendBubble('bot', data.message || 'Sorry, something went wrong. Please try again.');
      }
    } catch (err) {
      if (typingEl) typingEl.remove();
      _appendBubble('bot', 'Could not reach the server. Please check your connection.');
      console.error('Chat error:', err);
    } finally {
      _isSending = false;
      _setSendEnabled(true);
    }
  }

  function sendSuggestion(chipEl) {
    const text = chipEl.textContent.trim();
    const input = document.getElementById('chatInput');
    if (input) input.value = text;
    send();
  }

  // ===========================================================================
  // KEYBOARD HANDLING
  // ===========================================================================
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }

    // Auto-resize textarea
    setTimeout(() => _autoResizeInput(e.target), 0);
  }

  function _autoResizeInput(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
  }

  // ===========================================================================
  // DOM HELPERS
  // ===========================================================================

  function _clearMessages() {
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
  }

  function _appendBubble(type, text) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${type}`;

    // Simple text formatting: split by newlines, create paragraphs
    const paragraphs = text.split('\n').filter(line => line.trim());
    bubble.innerHTML = paragraphs.map(p => `<p>${_esc(p)}</p>`).join('');

    container.appendChild(bubble);
    _scrollToBottom();
  }

  function _showTyping() {
    const container = document.getElementById('chatMessages');
    if (!container) return null;

    const typing = document.createElement('div');
    typing.className = 'chat-typing';
    typing.id = 'chatTypingIndicator';
    typing.innerHTML = `
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
    `;
    container.appendChild(typing);
    _scrollToBottom();
    return typing;
  }

  function _hideSuggestions() {
    const el = document.getElementById('chatSuggestions');
    if (el) el.classList.add('hidden');
  }

  function _setSendEnabled(enabled) {
    const btn = document.getElementById('chatSendBtn');
    if (btn) btn.disabled = !enabled;
  }

  function _scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  window.Chatbot = {
    toggle,
    send,
    sendSuggestion,
    handleKey,
    loadDocument,    // NEW — call from flashcard/notes/quiz pages
    clearDocument,   // NEW — also wired to the banner ✕ button
  };
})();