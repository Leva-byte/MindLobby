/* ============================================================================
   MINDLOBBY — GENERAL SETTINGS
   Reads / writes user preferences to localStorage.
   Controls: theme toggle, SFX slider, music slider, music mute, lobby type.
   ============================================================================ */
(function () {
  'use strict';

  var KEYS = {
    theme:       'ml_theme',
    sfxVolume:   'ml_sfxVolume',
    musicVolume: 'ml_musicVolume',
    musicMuted:  'ml_musicMuted',
    lobbyType:   'ml_defaultLobbyType'
  };

  var _bound = false; // prevent duplicate event binding

  // ── Load settings into UI controls ─────────────────────────────────────────
  function loadSettings() {
    // Theme
    var theme = localStorage.getItem(KEYS.theme) || 'dark';
    var themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
      themeToggle.checked = (theme === 'light');
      _setText('settingsThemeValue', theme === 'light' ? 'Light Mode' : 'Dark Mode');
    }

    // SFX volume
    var sfx = _getFloat(KEYS.sfxVolume, 0.7);
    var sfxSlider = document.getElementById('settingsSfxSlider');
    if (sfxSlider) {
      sfxSlider.value = Math.round(sfx * 100);
      _setText('settingsSfxValue', Math.round(sfx * 100) + '%');
    }

    // Music volume
    var music = _getFloat(KEYS.musicVolume, 0.5);
    var musicSlider = document.getElementById('settingsMusicSlider');
    if (musicSlider) {
      musicSlider.value = Math.round(music * 100);
      _setText('settingsMusicValue', Math.round(music * 100) + '%');
    }

    // Music muted
    var muted = localStorage.getItem(KEYS.musicMuted) === 'true';
    var muteToggle = document.getElementById('settingsMusicMuteToggle');
    if (muteToggle) {
      muteToggle.checked = !muted; // checked = enabled = not muted
      _setText('settingsMusicMuteValue', muted ? 'Disabled' : 'Enabled');
    }

    // Default lobby type
    var lobby = localStorage.getItem(KEYS.lobbyType) || 'public';
    var pubBtn  = document.getElementById('settingsLobbyPublic');
    var privBtn = document.getElementById('settingsLobbyPrivate');
    if (pubBtn && privBtn) {
      pubBtn.classList.toggle('active', lobby === 'public');
      privBtn.classList.toggle('active', lobby === 'private');
      _setText('settingsLobbyValue', lobby === 'public' ? 'Public' : 'Private');
    }

    // Audio theme buttons
    var themeGroup = document.getElementById('settingsAudioThemeGroup');
    if (themeGroup && window.AudioManager) {
      var themes = AudioManager.getThemeList();
      var currentTheme = AudioManager.getTheme();
      themeGroup.innerHTML = '';
      themes.forEach(function (t) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-audio-theme-btn' + (t.id === currentTheme ? ' active' : '');
        btn.dataset.themeId = t.id;
        btn.innerHTML = '<i class="fas fa-music"></i> ' + t.name;
        themeGroup.appendChild(btn);
      });
      _setText('settingsThemeAudioValue', (themes.find(function (t) { return t.id === currentTheme; }) || {}).name || 'Default');
    }

    if (!_bound) {
      _bindEvents();
      _bound = true;
    }
  }

  // ── Bind change / input events ─────────────────────────────────────────────
  function _bindEvents() {
    // Theme toggle
    var themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('change', function () {
        var isLight = this.checked;
        localStorage.setItem(KEYS.theme, isLight ? 'light' : 'dark');
        _setText('settingsThemeValue', isLight ? 'Light Mode' : 'Dark Mode');
        applyTheme();
        _syncToServer();
      });
    }

    // SFX volume slider
    var sfxSlider = document.getElementById('settingsSfxSlider');
    if (sfxSlider) {
      sfxSlider.addEventListener('input', function () {
        var pct = parseInt(this.value, 10);
        var vol = pct / 100;
        _setText('settingsSfxValue', pct + '%');
        localStorage.setItem(KEYS.sfxVolume, JSON.stringify(vol));
        if (window.AudioManager) AudioManager.setSfxVolume(vol);
        _syncToServer();
      });
    }

    // Music volume slider
    var musicSlider = document.getElementById('settingsMusicSlider');
    if (musicSlider) {
      musicSlider.addEventListener('input', function () {
        var pct = parseInt(this.value, 10);
        var vol = pct / 100;
        _setText('settingsMusicValue', pct + '%');
        localStorage.setItem(KEYS.musicVolume, JSON.stringify(vol));
        if (window.AudioManager) AudioManager.setMusicVolume(vol);
        _syncToServer();
      });
    }

    // Music mute toggle
    var muteToggle = document.getElementById('settingsMusicMuteToggle');
    if (muteToggle) {
      muteToggle.addEventListener('change', function () {
        var muted = !this.checked;
        localStorage.setItem(KEYS.musicMuted, JSON.stringify(muted));
        _setText('settingsMusicMuteValue', muted ? 'Disabled' : 'Enabled');
        if (window.AudioManager) AudioManager.setMusicMuted(muted);
        _syncToServer();
      });
    }

    // Lobby type buttons
    var pubBtn  = document.getElementById('settingsLobbyPublic');
    var privBtn = document.getElementById('settingsLobbyPrivate');
    if (pubBtn) {
      pubBtn.addEventListener('click', function () {
        localStorage.setItem(KEYS.lobbyType, 'public');
        pubBtn.classList.add('active');
        if (privBtn) privBtn.classList.remove('active');
        _setText('settingsLobbyValue', 'Public');
        _syncToServer();
      });
    }
    if (privBtn) {
      privBtn.addEventListener('click', function () {
        localStorage.setItem(KEYS.lobbyType, 'private');
        privBtn.classList.add('active');
        if (pubBtn) pubBtn.classList.remove('active');
        _setText('settingsLobbyValue', 'Private');
        _syncToServer();
      });
    }

    // Audio theme buttons (delegated click on the group container)
    var themeGroup = document.getElementById('settingsAudioThemeGroup');
    if (themeGroup) {
      themeGroup.addEventListener('click', function (e) {
        var btn = e.target.closest('.settings-audio-theme-btn');
        if (!btn) return;
        var themeId = btn.dataset.themeId;
        if (window.AudioManager) AudioManager.setTheme(themeId);
        // Update active state
        themeGroup.querySelectorAll('.settings-audio-theme-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        var themes = window.AudioManager ? AudioManager.getThemeList() : [];
        var match = themes.find(function (t) { return t.id === themeId; });
        _setText('settingsThemeAudioValue', match ? match.name : themeId);
        _syncToServer();
      });
    }

    // Preview button — plays a 5-second snippet of the theme's quiz music
    var previewBtn = document.getElementById('settingsPreviewBtn');
    if (previewBtn) {
      var _previewAudio = null;
      previewBtn.addEventListener('click', function () {
        // Stop any existing preview
        if (_previewAudio) { _previewAudio.pause(); _previewAudio = null; }

        if (window.AudioManager) {
          AudioManager.startMusic('quiz');
          var icon = previewBtn.querySelector('i');
          if (icon) { icon.className = 'fas fa-stop'; }
          setTimeout(function () {
            AudioManager.stopMusic();
            if (icon) { icon.className = 'fas fa-play'; }
          }, 5000);
        }
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function _getFloat(key, fallback) {
    var v = parseFloat(localStorage.getItem(key));
    return isNaN(v) ? fallback : v;
  }

  /** Collect current localStorage settings into a plain object. */
  function _collectSettings() {
    return {
      theme:              localStorage.getItem(KEYS.theme) || 'dark',
      sfxVolume:          _getFloat(KEYS.sfxVolume, 0.7),
      musicVolume:        _getFloat(KEYS.musicVolume, 0.5),
      musicMuted:         localStorage.getItem(KEYS.musicMuted) === 'true',
      defaultLobbyType:   localStorage.getItem(KEYS.lobbyType) || 'public',
      audioTheme:         localStorage.getItem('ml_audioTheme') || 'default',
      tutorial_completed: localStorage.getItem('ml_tutorialCompleted') === 'true'
    };
  }

  /** Fire-and-forget save to server. */
  function _syncToServer() {
    var payload = _collectSettings();
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: payload })
    }).catch(function () {});
  }

  /**
   * Called after check-auth returns server-saved settings.
   * Writes them into localStorage so the rest of the UI picks them up.
   */
  function loadFromServer(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.theme)            localStorage.setItem(KEYS.theme, obj.theme);
    if (obj.sfxVolume != null) localStorage.setItem(KEYS.sfxVolume, JSON.stringify(obj.sfxVolume));
    if (obj.musicVolume != null) localStorage.setItem(KEYS.musicVolume, JSON.stringify(obj.musicVolume));
    if (obj.musicMuted != null) localStorage.setItem(KEYS.musicMuted, JSON.stringify(obj.musicMuted));
    if (obj.defaultLobbyType) localStorage.setItem(KEYS.lobbyType, obj.defaultLobbyType);
    if (obj.audioTheme) localStorage.setItem('ml_audioTheme', obj.audioTheme);
    if (obj.tutorial_completed != null) localStorage.setItem('ml_tutorialCompleted', JSON.stringify(!!obj.tutorial_completed));

    // Re-apply theme in case it changed
    applyTheme();

    // Sync AudioManager volumes and theme if already loaded
    if (window.AudioManager) {
      AudioManager.setSfxVolume(_getFloat(KEYS.sfxVolume, 0.7));
      AudioManager.setMusicVolume(_getFloat(KEYS.musicVolume, 0.5));
      AudioManager.setMusicMuted(localStorage.getItem(KEYS.musicMuted) === 'true');
      if (obj.audioTheme) AudioManager.setTheme(obj.audioTheme);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  /** Mark tutorial as completed and sync full settings to server. */
  function syncTutorialCompleted() {
    localStorage.setItem('ml_tutorialCompleted', 'true');
    _syncToServer();
  }

  window.Settings = {
    loadSettings:   loadSettings,
    loadFromServer: loadFromServer,
    syncTutorialCompleted: syncTutorialCompleted
  };
})();

// ============================================================================
// THEME APPLICATION — runs on every page that includes this script.
// Placed OUTSIDE the IIFE so it executes immediately on script load,
// preventing a flash of the wrong theme colour.
// ============================================================================
function applyTheme() {
  var theme = localStorage.getItem('ml_theme') || 'dark';
  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}
applyTheme();
