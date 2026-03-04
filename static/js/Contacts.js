// ============================================================================
// MINDLOBBY — CONTACTS PAGE MODULE
// ============================================================================
(function () {
  'use strict';

  // ===========================================================================
  // FORM SUBMISSION
  // ===========================================================================

  async function submitForm() {
    if (!_validateForm()) return;

    _setLoading(true);

    var payload = {
      first_name:  document.getElementById('contactFirstName').value.trim(),
      last_name:   document.getElementById('contactLastName').value.trim(),
      email:       document.getElementById('contactEmail').value.trim(),
      subject:     document.getElementById('contactSubject').value,
      message:     document.getElementById('contactMessage').value.trim(),
    };

    try {
      var res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      var data = await res.json();

      if (res.ok && data.success) {
        _showSuccessModal(payload.email);
        _resetForm();
      } else {
        _showNotification('error', data.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Contact form error:', err);
      _showNotification('error', 'Failed to send message. Please check your connection and try again.');
    } finally {
      _setLoading(false);
    }
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  function _validateForm() {
    var valid = true;

    _clearErrors();

    var firstName = document.getElementById('contactFirstName').value.trim();
    var lastName  = document.getElementById('contactLastName').value.trim();
    var email     = document.getElementById('contactEmail').value.trim();
    var subject   = document.getElementById('contactSubject').value;
    var message   = document.getElementById('contactMessage').value.trim();

    if (!firstName) {
      _setError('errFirstName', 'First name is required.'); valid = false;
    }
    if (!lastName) {
      _setError('errLastName', 'Last name is required.'); valid = false;
    }
    if (!email) {
      _setError('errEmail', 'Email address is required.'); valid = false;
    } else if (!_isValidEmail(email)) {
      _setError('errEmail', 'Please enter a valid email address.'); valid = false;
    }
    if (!subject) {
      _setError('errSubject', 'Please select a subject.'); valid = false;
    }
    if (!message) {
      _setError('errMessage', 'Message cannot be empty.'); valid = false;
    } else if (message.length < 10) {
      _setError('errMessage', 'Message must be at least 10 characters.'); valid = false;
    }

    // Highlight invalid inputs
    ['contactFirstName', 'contactLastName', 'contactEmail', 'contactSubject', 'contactMessage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        var errId = 'err' + id.replace('contact', '');
        var errEl = document.getElementById(errId);
        if (errEl && errEl.textContent) {
          el.classList.add('input-error');
        } else {
          el.classList.remove('input-error');
        }
      }
    });

    return valid;
  }

  function _isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function _setError(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg;
  }

  function _clearErrors() {
    ['errFirstName', 'errLastName', 'errEmail', 'errSubject', 'errMessage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = '';
    });
    ['contactFirstName', 'contactLastName', 'contactEmail', 'contactSubject', 'contactMessage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('input-error');
    });
  }

  // ===========================================================================
  // UI HELPERS
  // ===========================================================================

  function _setLoading(on) {
    var btn      = document.getElementById('submitBtn');
    var btnText  = document.getElementById('submitBtnText');
    var btnLoad  = document.getElementById('submitBtnLoading');
    if (!btn) return;

    btn.disabled = on;
    if (btnText) btnText.style.display = on ? 'none' : 'inline-flex';
    if (btnLoad) btnLoad.style.display = on ? 'inline-flex' : 'none';
  }

  function _showNotification(type, text) {
    var notif    = document.getElementById('formNotification');
    var icon     = document.getElementById('notifIcon');
    var notifTxt = document.getElementById('notifText');
    if (!notif) return;

    notif.className = 'form-notification ' + type;
    if (icon) icon.className = type === 'success'
      ? 'fas fa-check-circle'
      : 'fas fa-exclamation-circle';
    if (notifTxt) notifTxt.textContent = text;

    notif.style.display = 'flex';
    notif.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _showSuccessModal(email) {
    var emailEl = document.getElementById('modalUserEmail');
    if (emailEl) emailEl.textContent = email;
    var modal = document.getElementById('contactSuccessModal');
    if (modal) modal.style.display = 'flex';
  }

  function closeSuccessModal() {
    var modal = document.getElementById('contactSuccessModal');
    if (modal) modal.style.display = 'none';
  }

  function _resetForm() {
    var ids = ['contactFirstName', 'contactLastName', 'contactEmail', 'contactMessage'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var subject = document.getElementById('contactSubject');
    if (subject) subject.selectedIndex = 0;

    var charCount = document.getElementById('charCount');
    if (charCount) charCount.textContent = '0';

    _clearErrors();
  }

  // ===========================================================================
  // CHARACTER COUNTER
  // ===========================================================================

  function _initCharCounter() {
    var textarea = document.getElementById('contactMessage');
    var counter  = document.getElementById('charCount');
    if (!textarea || !counter) return;

    textarea.addEventListener('input', function () {
      var len = this.value.length;
      if (len > 1000) { this.value = this.value.slice(0, 1000); len = 1000; }

      counter.textContent = len;
      var wrap = counter.parentElement;
      wrap.classList.remove('near-limit', 'at-limit');
      if (len >= 1000)      wrap.classList.add('at-limit');
      else if (len >= 850)  wrap.classList.add('near-limit');
    });
  }

  // ===========================================================================
  // FAQ ACCORDION
  // ===========================================================================

  function toggleFaq(btn) {
    var item = btn.closest('.faq-item');
    var isOpen = item.classList.contains('open');

    // Close all others
    document.querySelectorAll('.faq-item.open').forEach(function (el) {
      if (el !== item) el.classList.remove('open');
    });

    item.classList.toggle('open', !isOpen);
  }

  // ===========================================================================
  // INIT
  // ===========================================================================

  document.addEventListener('DOMContentLoaded', function () {
    _initCharCounter();

    // Clear per-field errors on input
    ['contactFirstName', 'contactLastName', 'contactEmail', 'contactMessage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        this.classList.remove('input-error');
        var errId = 'err' + id.replace('contact', '');
        var errEl = document.getElementById(errId);
        if (errEl) errEl.textContent = '';
      });
    });

    var subject = document.getElementById('contactSubject');
    if (subject) {
      subject.addEventListener('change', function () {
        this.classList.remove('input-error');
        var errEl = document.getElementById('errSubject');
        if (errEl) errEl.textContent = '';
      });
    }
  });

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  window.Contacts = {
    submitForm: submitForm,
    toggleFaq:  toggleFaq,
    closeSuccessModal: closeSuccessModal
  };
})();