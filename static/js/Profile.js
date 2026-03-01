// ============================================================================
// MINDLOBBY — USER PROFILE MODULE
// ============================================================================
(function () {
  'use strict';

  let _profile = null;

  // ===========================================================================
  // LOAD PROFILE
  // ===========================================================================
  async function loadProfile() {
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();

      if (!data.success) return;

      _profile = data.profile;

      // Banner
      const bannerImg = document.getElementById('profileBannerImg');
      if (bannerImg) {
        bannerImg.src = _profile.banner
          ? '/' + _profile.banner
          : '/static/img/default-banner.png';
      }

      // Avatar — always show image (default or custom), hide letter
      const avatarImg = document.getElementById('profileAvatarImg');
      const avatarLetter = document.getElementById('profileAvatarLetter');
      if (avatarImg) {
        avatarImg.src = _profile.profile_picture
          ? '/' + _profile.profile_picture
          : '/static/img/default-pfp.png';
        avatarImg.style.display = 'block';
      }
      if (avatarLetter) avatarLetter.style.display = 'none';

      // Info
      const displayName = document.getElementById('profileDisplayName');
      if (displayName) displayName.textContent = _profile.username;

      const email = document.getElementById('profileEmail');
      if (email) email.textContent = _profile.email;

      const emailValue = document.getElementById('profileEmailValue');
      if (emailValue) emailValue.textContent = _profile.email;

      const usernameValue = document.getElementById('profileUsernameValue');
      if (usernameValue) usernameValue.textContent = _profile.username;

      const memberSince = document.getElementById('profileMemberSince');
      if (memberSince && _profile.created_at) {
        const date = new Date(_profile.created_at);
        memberSince.textContent = 'Member since ' + date.toLocaleDateString('en-US', {
          month: 'long', year: 'numeric'
        });
      }

      // Update header avatar too
      _updateHeaderAvatar();

    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }

  // ===========================================================================
  // IMAGE UPLOADS
  // ===========================================================================
  function changePicture() {
    const input = document.getElementById('profilePictureInput');
    if (input) input.click();
  }

  function changeBanner() {
    const input = document.getElementById('profileBannerInput');
    if (input) input.click();
  }

  async function handlePictureUpload(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      _toast('Image must be under 5MB', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/profile/picture', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        const avatarImg = document.getElementById('profileAvatarImg');
        const avatarLetter = document.getElementById('profileAvatarLetter');
        if (avatarImg) {
          avatarImg.src = '/' + data.profile_picture + '?t=' + Date.now();
          avatarImg.style.display = 'block';
        }
        if (avatarLetter) avatarLetter.style.display = 'none';
        if (_profile) _profile.profile_picture = data.profile_picture;
        _updateHeaderAvatar();
        _updateWelcomeBanner();
        _toast('Profile picture updated');
      } else {
        _toast(data.message || 'Upload failed', 'error');
      }
    } catch (err) {
      _toast('Upload failed. Please try again.', 'error');
    }

    input.value = '';
  }

  async function handleBannerUpload(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      _toast('Image must be under 5MB', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/profile/banner', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        const bannerImg = document.getElementById('profileBannerImg');
        if (bannerImg) bannerImg.src = '/' + data.banner + '?t=' + Date.now();
        if (_profile) _profile.banner = data.banner;
        _updateWelcomeBanner();
        _toast('Banner updated');
      } else {
        _toast(data.message || 'Upload failed', 'error');
      }
    } catch (err) {
      _toast('Upload failed. Please try again.', 'error');
    }

    input.value = '';
  }

  // ===========================================================================
  // USERNAME EDIT
  // ===========================================================================
  function editUsername() {
    const valueEl = document.getElementById('profileUsernameValue');
    const editEl = document.getElementById('profileUsernameEdit');
    const btn = document.getElementById('profileUsernameBtn');
    const input = document.getElementById('profileUsernameInput');

    if (valueEl) valueEl.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (editEl) editEl.style.display = 'flex';
    if (input) {
      input.value = _profile ? _profile.username : '';
      input.focus();
      input.select();
    }
  }

  function cancelUsernameEdit() {
    const valueEl = document.getElementById('profileUsernameValue');
    const editEl = document.getElementById('profileUsernameEdit');
    const btn = document.getElementById('profileUsernameBtn');

    if (valueEl) valueEl.style.display = 'block';
    if (btn) btn.style.display = 'flex';
    if (editEl) editEl.style.display = 'none';
  }

  async function saveUsername() {
    const input = document.getElementById('profileUsernameInput');
    if (!input) return;

    const newUsername = input.value.trim();
    if (!newUsername) {
      _toast('Username cannot be empty', 'error');
      return;
    }

    try {
      const res = await fetch('/api/profile/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername }),
      });
      const data = await res.json();

      if (data.success) {
        if (_profile) _profile.username = data.username;

        // Update all displays
        const displayName = document.getElementById('profileDisplayName');
        if (displayName) displayName.textContent = data.username;

        const usernameValue = document.getElementById('profileUsernameValue');
        if (usernameValue) usernameValue.textContent = data.username;

        // Update header + welcome banner
        const headerUsername = document.querySelector('.username');
        if (headerUsername) headerUsername.textContent = data.username;

        const welcomeTitle = document.querySelector('.welcome-title');
        if (welcomeTitle) welcomeTitle.textContent = 'Welcome back, ' + data.username + '!';

        const headerAvatar = document.querySelector('.header-actions .user-avatar');
        if (headerAvatar && !_profile.profile_picture) {
          // Update letter avatar
          const letterEl = headerAvatar.querySelector('span') || headerAvatar;
          if (!headerAvatar.querySelector('img')) {
            headerAvatar.textContent = data.username[0].toUpperCase();
          }
        }

        // Update avatar letter on profile page
        const avatarLetter = document.getElementById('profileAvatarLetter');
        if (avatarLetter) avatarLetter.textContent = data.username[0].toUpperCase();

        cancelUsernameEdit();
        _toast('Username updated');
      } else {
        _toast(data.message || 'Failed to update username', 'error');
      }
    } catch (err) {
      _toast('Failed to update username', 'error');
    }
  }

  // ===========================================================================
  // PASSWORD RESET
  // ===========================================================================
  async function resetPassword() {
    try {
      const res = await fetch('/api/profile/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (data.success) {
        _toast(data.message);
      } else {
        _toast(data.message || 'Failed to send reset email', 'error');
      }
    } catch (err) {
      _toast('Failed to send reset email', 'error');
    }
  }

  // ===========================================================================
  // DELETE ACCOUNT
  // ===========================================================================
  function showDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    const passwordInput = document.getElementById('deleteConfirmPassword');
    const errorEl = document.getElementById('deleteError');

    if (modal) modal.style.display = 'flex';
    if (passwordInput) passwordInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
  }

  function hideDeleteModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmDelete() {
    const passwordInput = document.getElementById('deleteConfirmPassword');
    const errorEl = document.getElementById('deleteError');
    const confirmBtn = document.getElementById('deleteConfirmBtn');

    if (!passwordInput || !passwordInput.value.trim()) {
      if (errorEl) {
        errorEl.textContent = 'Please enter your password';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const res = await fetch('/api/profile/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value }),
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = '/';
      } else {
        if (errorEl) {
          errorEl.textContent = data.message || 'Failed to delete account';
          errorEl.style.display = 'block';
        }
        if (confirmBtn) confirmBtn.disabled = false;
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
      }
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================
  function _updateWelcomeBanner() {
    if (!_profile) return;
    var t = '?t=' + Date.now();

    // Welcome banner background
    var bannerBg = document.getElementById('welcomeBannerBg');
    if (bannerBg) {
      bannerBg.src = _profile.banner
        ? '/' + _profile.banner + t
        : '/static/img/default-banner.png';
    }

    // Welcome profile picture
    var pfpImg = document.getElementById('welcomePfpImg');
    if (pfpImg) {
      pfpImg.src = _profile.profile_picture
        ? '/' + _profile.profile_picture + t
        : '/static/img/default-pfp.png';
    }
  }

  function _updateHeaderAvatar() {
    const headerAvatar = document.querySelector('.header-actions .user-avatar');
    if (!headerAvatar || !_profile) return;

    if (_profile.profile_picture) {
      // Replace letter with image
      const existingImg = headerAvatar.querySelector('img');
      if (existingImg) {
        existingImg.src = '/' + _profile.profile_picture + '?t=' + Date.now();
      } else {
        headerAvatar.textContent = '';
        const img = document.createElement('img');
        img.src = '/' + _profile.profile_picture + '?t=' + Date.now();
        img.alt = 'Profile';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        headerAvatar.appendChild(img);
      }
    }
  }

  function _toast(message, type) {
    type = type || 'success';

    // Remove any existing toast
    const existing = document.querySelector('.profile-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'profile-toast ' + type;
    toast.innerHTML = '<i class="fas fa-' +
      (type === 'success' ? 'check-circle' : 'exclamation-circle') +
      '"></i> ' + _esc(message);

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  window.Profile = {
    loadProfile,
    changePicture,
    changeBanner,
    handlePictureUpload,
    handleBannerUpload,
    editUsername,
    cancelUsernameEdit,
    saveUsername,
    resetPassword,
    showDeleteModal,
    hideDeleteModal,
    confirmDelete,
  };
})();
