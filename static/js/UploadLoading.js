// ============================================================================
// UNIFIED LOADING SYSTEM — Document Uploads & YouTube Imports
// Card-style overlays, count-up timer (M:SS), simulated step progression,
// overtime modal, cancel with confirmation + server cleanup
// ============================================================================

// ── State ───────────────────────────────────────────────────────────────────
var isUploading = false;
var uploadAbortController = null;

// Track document_id so we can delete on cancel
var _lastDocId = null;

// Document state
var _docTimerInterval = null;
var _docStartTime = null;
var _docOvertimeNotified = false;
var _docProgressInterval = null;

// YouTube state
var _ytTimerInterval = null;
var _ytStartTime = null;
var _ytOvertimeNotified = false;
var _ytLoadInterval = null;

// Thresholds (seconds)
var OVERTIME_THRESHOLD = 120;
var HARD_TIMEOUT = 240;
var WARNING_THRESHOLD = 90;

// ── Helpers ─────────────────────────────────────────────────────────────────

function _formatTime(totalSeconds) {
  var m = Math.floor(totalSeconds / 60);
  var s = totalSeconds % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Delete a document from the server (cleanup on cancel)
function _deleteDocument(docId) {
  if (!docId) return;
  fetch('/api/documents/' + docId, { method: 'DELETE' }).catch(function () {});
}

// ── Shared Timer ────────────────────────────────────────────────────────────

function _startTimer(type) {
  var startTime = Date.now();

  var timerEl, timerTextEl;
  if (type === 'doc') {
    _docStartTime = startTime;
    _docOvertimeNotified = false;
    timerEl = document.getElementById('fcTimer');
    timerTextEl = document.getElementById('fcTimerText');
  } else {
    _ytStartTime = startTime;
    _ytOvertimeNotified = false;
    timerEl = document.getElementById('ytTimer');
    timerTextEl = document.getElementById('ytTimerText');
  }

  if (!timerEl || !timerTextEl) return;

  timerTextEl.textContent = '0:00';
  timerEl.classList.remove('warning');

  var interval = setInterval(function () {
    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    timerTextEl.textContent = _formatTime(elapsed);

    if (elapsed >= WARNING_THRESHOLD) {
      timerEl.classList.add('warning');
    }

    if (elapsed >= OVERTIME_THRESHOLD) {
      var alreadyNotified = type === 'doc' ? _docOvertimeNotified : _ytOvertimeNotified;
      if (!alreadyNotified) {
        if (type === 'doc') _docOvertimeNotified = true;
        else _ytOvertimeNotified = true;
        showOvertimeModal();
      }
    }

    if (elapsed >= HARD_TIMEOUT) {
      _doCancel(type);
      closeOvertimeModal();
      showNotification('Process timed out. Please try again with a smaller file.', 'error');
    }
  }, 500);

  if (type === 'doc') _docTimerInterval = interval;
  else _ytTimerInterval = interval;
}

function _stopTimer(type) {
  if (type === 'doc' && _docTimerInterval) {
    clearInterval(_docTimerInterval);
    _docTimerInterval = null;
  }
  if (type === 'yt' && _ytTimerInterval) {
    clearInterval(_ytTimerInterval);
    _ytTimerInterval = null;
  }
}

// ============================================================================
// DOCUMENT UPLOAD LOADING — with simulated progression
// ============================================================================

function showLoadingOverlay(filename) {
  if (isUploading) {
    showNotification('Please wait for the current process to complete.', 'warning');
    return false;
  }

  isUploading = true;
  _lastDocId = null;

  var overlay = document.getElementById('fcLoadingOverlay');
  if (!overlay) { console.error('fcLoadingOverlay not found'); return false; }

  overlay.classList.add('active');

  // Reset steps
  for (var i = 1; i <= 5; i++) {
    var s = document.getElementById('step' + i);
    if (s) s.classList.remove('active', 'complete');
  }

  // Reset bar
  var bar = document.getElementById('fcLoadingBarFill');
  if (bar) bar.style.width = '0%';

  // Set filename
  var fileEl = document.getElementById('fcLoadingFile');
  if (fileEl) fileEl.textContent = filename || '';

  // Initial text
  var titleEl = document.getElementById('fcLoadingTitle');
  var msgEl = document.getElementById('fcStatusMsg');
  if (titleEl) titleEl.textContent = 'Uploading File...';
  if (msgEl) msgEl.textContent = 'Sending file to server';

  // Show cancel button
  var cancelBtn = document.getElementById('fcCancelBtn');
  if (cancelBtn) cancelBtn.style.display = '';

  // Start timer
  _startTimer('doc');

  // Activate step 1 immediately
  _setDocStep(1);

  // Simulated step progression (bar creeps forward like YouTube)
  var elapsed = 0;
  if (_docProgressInterval) clearInterval(_docProgressInterval);
  _docProgressInterval = setInterval(function () {
    elapsed++;
    var pct = Math.min(elapsed * 0.8, 85);
    if (bar) bar.style.width = pct + '%';

    if (elapsed === 3) {
      _setDocStep(2);
      _setDocText('Extracting Text...', 'Reading document content');
    } else if (elapsed === 10) {
      _setDocStep(3);
      _setDocText('Generating Flashcards...', 'AI is creating your study cards');
    } else if (elapsed === 25) {
      _setDocStep(4);
      _setDocText('Summarizing Notes...', 'AI is writing your lecture notes');
    }
  }, 1000);

  return true;
}

function hideLoadingOverlay() {
  isUploading = false;
  _stopTimer('doc');
  if (_docProgressInterval) { clearInterval(_docProgressInterval); _docProgressInterval = null; }

  var overlay = document.getElementById('fcLoadingOverlay');
  if (overlay) overlay.classList.remove('active');

  var timerEl = document.getElementById('fcTimer');
  var timerText = document.getElementById('fcTimerText');
  if (timerEl) timerEl.classList.remove('warning');
  if (timerText) timerText.textContent = '0:00';
}

function completeDocLoading(data) {
  // Stop simulated progression
  if (_docProgressInterval) { clearInterval(_docProgressInterval); _docProgressInterval = null; }

  // Hide cancel button
  var cancelBtn = document.getElementById('fcCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Snap bar to 100%
  var bar = document.getElementById('fcLoadingBarFill');
  if (bar) bar.style.width = '100%';

  // Mark all steps complete, set step 5 active
  _setDocStep(5);
  var count = data && data.flashcards_generated ? data.flashcards_generated : 0;
  _setDocText('Complete!', count + ' flashcards and notes created!');
}

function _setDocText(title, msg) {
  var t = document.getElementById('fcLoadingTitle');
  var m = document.getElementById('fcStatusMsg');
  if (t) t.textContent = title;
  if (m) m.textContent = msg;
}

function _setDocStep(num) {
  for (var i = 1; i <= 5; i++) {
    var s = document.getElementById('step' + i);
    if (!s) continue;
    if (i < num) { s.classList.remove('active'); s.classList.add('complete'); }
    else if (i === num) { s.classList.remove('complete'); s.classList.add('active'); }
    else { s.classList.remove('active', 'complete'); }
  }
}

// ============================================================================
// YOUTUBE LOADING
// ============================================================================

function showYtLoadingOverlay(url) {
  window._lastYtDocId = null;

  var overlay = document.getElementById('ytLoadingOverlay');
  if (!overlay) return;
  overlay.classList.add('active');

  // Reset steps
  for (var i = 1; i <= 4; i++) {
    var s = document.getElementById('ytStep' + i);
    if (s) s.classList.remove('active', 'complete');
  }
  var s1 = document.getElementById('ytStep1');
  if (s1) s1.classList.add('active');

  // Reset bar
  var bar = document.getElementById('ytLoadingBarFill');
  if (bar) bar.style.width = '0%';

  // Show cancel button
  var cancelBtn = document.getElementById('ytCancelBtn');
  if (cancelBtn) cancelBtn.style.display = '';

  _setYtText('Fetching Transcript...', 'Connecting to YouTube servers');

  // Start timer
  _startTimer('yt');

  // Simulated step progression
  var elapsed = 0;
  if (_ytLoadInterval) clearInterval(_ytLoadInterval);
  _ytLoadInterval = setInterval(function () {
    elapsed++;
    var pct = Math.min(elapsed * 1.2, 85);
    if (bar) bar.style.width = pct + '%';

    if (elapsed === 5) {
      _setYtStep(2);
      _setYtText('Generating Flashcards...', 'AI is creating your study cards');
    } else if (elapsed === 15) {
      _setYtStep(3);
      _setYtText('Summarizing Notes...', 'AI is writing your lecture notes');
    }
  }, 1000);
}

function completeYtLoading(data) {
  if (_ytLoadInterval) { clearInterval(_ytLoadInterval); _ytLoadInterval = null; }

  // Hide cancel button
  var cancelBtn = document.getElementById('ytCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  var bar = document.getElementById('ytLoadingBarFill');
  if (bar) bar.style.width = '100%';

  _setYtStep(4);
  var count = data && data.flashcards_generated ? data.flashcards_generated : 0;
  _setYtText('Complete!', count + ' flashcards and notes created!');
}

function hideYtLoadingOverlay() {
  if (_ytLoadInterval) { clearInterval(_ytLoadInterval); _ytLoadInterval = null; }
  _stopTimer('yt');

  var overlay = document.getElementById('ytLoadingOverlay');
  if (overlay) overlay.classList.remove('active');

  var timerEl = document.getElementById('ytTimer');
  var timerText = document.getElementById('ytTimerText');
  if (timerEl) timerEl.classList.remove('warning');
  if (timerText) timerText.textContent = '0:00';
}

function _setYtText(title, msg) {
  var t = document.getElementById('ytLoadingTitle');
  var m = document.getElementById('ytLoadingMsg');
  if (t) t.textContent = title;
  if (m) m.textContent = msg;
}

function _setYtStep(num) {
  for (var i = 1; i <= 4; i++) {
    var s = document.getElementById('ytStep' + i);
    if (!s) continue;
    if (i < num) { s.classList.remove('active'); s.classList.add('complete'); }
    else if (i === num) { s.classList.remove('complete'); s.classList.add('active'); }
    else { s.classList.remove('active', 'complete'); }
  }
}

// ============================================================================
// OVERTIME MODAL
// ============================================================================

function showOvertimeModal() {
  var backdrop = document.getElementById('overtimeBackdrop');
  var modal = document.getElementById('overtimeModal');
  if (backdrop) backdrop.classList.add('open');
  if (modal) modal.classList.add('open');
}

function closeOvertimeModal() {
  var backdrop = document.getElementById('overtimeBackdrop');
  var modal = document.getElementById('overtimeModal');
  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

// ============================================================================
// CANCEL — confirmation modal + cleanup
// ============================================================================

// Which cancel type is pending confirmation
var _pendingCancelType = null;

// Show confirmation modal before cancelling
window.cancelUpload = function (type) {
  _pendingCancelType = type;
  var backdrop = document.getElementById('cancelConfirmBackdrop');
  var modal = document.getElementById('cancelConfirmModal');
  if (backdrop) backdrop.classList.add('open');
  if (modal) modal.classList.add('open');
};

// User confirmed cancel
window.confirmCancel = function () {
  _closeCancelModal();
  if (_pendingCancelType) {
    _doCancel(_pendingCancelType);
  }
  _pendingCancelType = null;
};

// User chose to keep going
window.dismissCancel = function () {
  _closeCancelModal();
  _pendingCancelType = null;
};

function _closeCancelModal() {
  var backdrop = document.getElementById('cancelConfirmBackdrop');
  var modal = document.getElementById('cancelConfirmModal');
  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

// Actually perform the cancel + cleanup
function _doCancel(type) {
  if (type === 'doc') {
    if (uploadAbortController) uploadAbortController.abort();
    // Delete any document already saved server-side
    if (_lastDocId) { _deleteDocument(_lastDocId); _lastDocId = null; }
    hideLoadingOverlay();
  } else if (type === 'yt') {
    if (window._ytAbortController) window._ytAbortController.abort();
    if (window._lastYtDocId) { _deleteDocument(window._lastYtDocId); window._lastYtDocId = null; }
    hideYtLoadingOverlay();
  }
  closeOvertimeModal();
  showNotification('Upload cancelled. Any generated content has been removed.', 'warning');
}

// ============================================================================
// UPLOAD FILE FUNCTION
// ============================================================================

window.uploadFile = async function (file) {
  console.log('uploadFile called for:', file.name);

  if (!showLoadingOverlay(file.name)) {
    return false;
  }

  uploadAbortController = new AbortController();
  var formData = new FormData();
  formData.append('file', file);

  try {
    var response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: uploadAbortController.signal
    });

    var data = await response.json();

    // Track document_id for cancel cleanup
    if (data.document_id) _lastDocId = data.document_id;

    if (response.ok && data.success) {
      // Show completion
      completeDocLoading(data);
      await sleep(1500);

      hideLoadingOverlay();
      _lastDocId = null; // Clear — upload succeeded, no cleanup needed

      // Refresh everything
      if (typeof loadDocuments === 'function') loadDocuments();
      if (typeof updateDashboardStats === 'function') updateDashboardStats();
      if (window.Flashcards && Flashcards.loadDocs) Flashcards.loadDocs();
      if (window.Notes && Notes.loadDocs) Notes.loadDocs();

      // Show topic picker, then auto-open notes after user picks or skips
      var _docId = data.document_id;
      var _fileName = file.name;
      var _cardCount = data.flashcards_generated;

      if (_docId && typeof window.showTopicPicker === 'function') {
        window.showTopicPicker(_docId, _fileName, function () {
          // After topic picker closes, open notes
          if (window.Notes && Notes.openForDocument) {
            setTimeout(function () {
              if (typeof showView === 'function') showView('notes');
              Notes.openForDocument(_docId, _fileName);
            }, 300);
          }
        });
      } else if (_docId && window.Notes && Notes.openForDocument) {
        // Fallback if topic picker not available
        setTimeout(function () {
          if (typeof showView === 'function') showView('notes');
          Notes.openForDocument(_docId, _fileName);
        }, 300);
      }
      return true;

    } else {
      hideLoadingOverlay();
      _lastDocId = null;
      var msg = data.message || 'Upload failed';
      showNotification(msg, 'error');
      return false;
    }

  } catch (err) {
    hideLoadingOverlay();
    closeOvertimeModal();
    if (err.name !== 'AbortError') {
      showNotification('Network error uploading ' + file.name, 'error');
    }
    console.error('Upload error:', err);
    return false;
  }
};

// ============================================================================
// UPLOAD BUTTON CONTROL
// ============================================================================

function disableUploadButtons() {
  var btns = document.querySelectorAll('.upload-btn, [onclick*="uploadDocument"], button:has(i.fa-upload)');
  btns.forEach(function (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

function enableUploadButtons() {
  var btns = document.querySelectorAll('.upload-btn, [onclick*="uploadDocument"], button:has(i.fa-upload)');
  btns.forEach(function (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// POST-UPLOAD TOPIC PICKER
// ============================================================================

var _tpDocId = null;
var _tpDocName = null;
var _tpSelectedTopicId = null;
var _tpCallback = null; // called after modal closes (skip or assign)

function showTopicPicker(docId, docName, onDone) {
  _tpDocId = docId;
  _tpDocName = docName;
  _tpSelectedTopicId = null;
  _tpCallback = onDone || null;

  var backdrop = document.getElementById('tpBackdrop');
  var modal = document.getElementById('tpModal');
  var list = document.getElementById('tpTopicList');
  var empty = document.getElementById('tpEmpty');
  var assignBtn = document.getElementById('tpAssignBtn');
  if (!modal) { if (_tpCallback) _tpCallback(); return; }

  // Reset state
  if (list) list.innerHTML = '';
  if (empty) empty.style.display = 'none';
  if (assignBtn) { assignBtn.classList.remove('active'); }

  // Fetch topics
  fetch('/api/topics')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success || !data.topics || data.topics.length === 0) {
        if (empty) empty.style.display = 'block';
        if (list) list.style.display = 'none';
      } else {
        if (empty) empty.style.display = 'none';
        if (list) {
          list.style.display = 'flex';
          list.innerHTML = data.topics.map(function (t) {
            return '<div class="tp-topic-item" data-topic-id="' + t.id + '" onclick="window._tpSelect(' + t.id + ', this)">' +
              '<div class="tp-topic-dot" style="background:' + (t.color || '#7c77c6') + '"></div>' +
              '<span class="tp-topic-name">' + _escHtml(t.name) + '</span>' +
              '<span class="tp-topic-count">' + (t.document_count || 0) + ' docs</span>' +
              '</div>';
          }).join('');
        }
      }

      // Show modal
      if (backdrop) backdrop.classList.add('open');
      if (modal) modal.classList.add('open');
    })
    .catch(function () {
      // On error, just skip the picker
      if (_tpCallback) _tpCallback();
    });
}

function _escHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

window._tpSelect = function (topicId, el) {
  _tpSelectedTopicId = topicId;
  // Update selection UI
  var items = document.querySelectorAll('.tp-topic-item');
  items.forEach(function (item) { item.classList.remove('selected'); });
  if (el) el.classList.add('selected');
  // Enable assign button
  var btn = document.getElementById('tpAssignBtn');
  if (btn) btn.classList.add('active');
};

window._tpSkip = function () {
  _closeTopicPicker();
  if (_tpCallback) _tpCallback();
};

window._tpGoToTopics = function () {
  _closeTopicPicker();
  if (typeof showView === 'function') showView('topics');
  if (window.Topics && Topics.openCreateModal) Topics.openCreateModal();
};

window._tpAssign = function () {
  if (!_tpSelectedTopicId || !_tpDocId) return;

  fetch('/api/topics/' + _tpSelectedTopicId + '/documents/' + _tpDocId, {
    method: 'POST'
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        showNotification('Document added to topic!', 'success');
        if (typeof loadDocuments === 'function') loadDocuments();
      }
    })
    .catch(function () {});

  _closeTopicPicker();
  if (_tpCallback) _tpCallback();
};

function _closeTopicPicker() {
  var backdrop = document.getElementById('tpBackdrop');
  var modal = document.getElementById('tpModal');
  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');
  _tpDocId = null;
  _tpDocName = null;
  _tpSelectedTopicId = null;
}

window.showTopicPicker = showTopicPicker;

window.showYtLoadingOverlay = showYtLoadingOverlay;
window.completeYtLoading = completeYtLoading;
window.hideYtLoadingOverlay = hideYtLoadingOverlay;
window.closeOvertimeModal = closeOvertimeModal;
