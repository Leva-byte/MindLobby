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
      });
    }
    if (privBtn) {
      privBtn.addEventListener('click', function () {
        localStorage.setItem(KEYS.lobbyType, 'private');
        privBtn.classList.add('active');
        if (pubBtn) pubBtn.classList.remove('active');
        _setText('settingsLobbyValue', 'Private');
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

  // ── Public API ─────────────────────────────────────────────────────────────
  window.Settings = {
    loadSettings: loadSettings
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
