/* ============================================================================
   MINDLOBBY — AUDIO MANAGER (Theme-Based)
   Centralized singleton for SFX and background music playback.
   Supports multiple audio themes (Default, Pixel, Meme, etc.).
   All settings read from localStorage (ml_ prefix keys).
   ============================================================================ */
(function () {
  'use strict';

  // ── Audio themes ─────────────────────────────────────────────────────────
  // Each theme defines paths for SFX and music contexts.
  // Missing files are handled gracefully (no error, just silence).
  var THEMES = {
    default: {
      name: 'Default',
      sfx: {
        correct: '/static/audio/default/correct.mp3',
        wrong:   '/static/audio/default/wrong.mp3',
        flip:    '/static/audio/default/flip.mp3'
      },
      music: {
        lobby: '/static/audio/default/lobby-bgm.mp3',
        game:  '/static/audio/default/game-bgm.mp3',
        quiz:  '/static/audio/default/quiz-bgm.mp3'
      }
    }
    // Future themes — add folders under static/audio/<theme_id>/:
    // pixel: { name: 'Pixel', sfx: { correct: '/static/audio/pixel/correct.mp3', ... }, music: { ... } },
    // meme:  { name: 'Meme',  sfx: { ... }, music: { ... } },
  };

  var DEFAULT_THEME     = 'default';
  var DEFAULT_SFX_VOL   = 0.7;
  var DEFAULT_MUSIC_VOL = 0.5;

  // ── Internal state ─────────────────────────────────────────────────────────
  var _sfx        = {};    // loaded Audio elements keyed by "theme:name"
  var _music      = {};    // loaded Audio elements keyed by "theme:ctx"
  var _currentCtx = null;  // currently playing key ("theme:ctx")

  // ── localStorage helpers ───────────────────────────────────────────────────
  function _get(key, fallback) {
    var v = localStorage.getItem('ml_' + key);
    if (v === null) return fallback;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }

  function sfxVolume()   { return _get('sfxVolume',   DEFAULT_SFX_VOL); }
  function musicVolume() { return _get('musicVolume', DEFAULT_MUSIC_VOL); }
  function musicMuted()  { return _get('musicMuted',  false); }

  function getTheme() {
    var id = localStorage.getItem('ml_audioTheme') || DEFAULT_THEME;
    return THEMES[id] ? id : DEFAULT_THEME;
  }

  function _themePaths() {
    return THEMES[getTheme()] || THEMES[DEFAULT_THEME];
  }

  // ── Lazy-load audio elements ───────────────────────────────────────────────
  function _ensureSfx(name) {
    var theme = _themePaths();
    var path = theme.sfx[name];
    if (!path) return null;

    var key = getTheme() + ':' + name;
    if (!_sfx[key]) {
      var audio = new Audio(path);
      audio.preload = 'auto';
      audio.addEventListener('error', function () {});
      _sfx[key] = audio;
    }
    return _sfx[key];
  }

  function _ensureMusic(ctx) {
    var theme = _themePaths();
    var path = theme.music[ctx];
    if (!path) return null;

    var key = getTheme() + ':' + ctx;
    if (!_music[key]) {
      var audio = new Audio(path);
      audio.loop = true;
      audio.preload = 'auto';
      audio.addEventListener('error', function () {});
      _music[key] = audio;
    }
    return _music[key];
  }

  // ── SFX playback ──────────────────────────────────────────────────────────
  function playCorrect() {
    var a = _ensureSfx('correct');
    if (!a) return;
    a.volume = sfxVolume();
    a.currentTime = 0;
    a.play().catch(function () {});
  }

  function playWrong() {
    var a = _ensureSfx('wrong');
    if (!a) return;
    a.volume = sfxVolume();
    a.currentTime = 0;
    a.play().catch(function () {});
  }

  function playFlip() {
    var a = _ensureSfx('flip');
    if (!a) return;
    a.volume = sfxVolume();
    a.currentTime = 0;
    a.play().catch(function () {});
  }

  // ── Background music ──────────────────────────────────────────────────────
  function startMusic(context) {
    var theme = _themePaths();
    if (!theme.music[context]) return;

    var key = getTheme() + ':' + context;

    // Already playing this exact theme+context
    if (_currentCtx === key) {
      var existing = _music[key];
      if (existing) {
        existing.volume = musicVolume();
        existing.muted  = musicMuted();
      }
      return;
    }

    stopMusic();

    var a = _ensureMusic(context);
    if (!a) return;
    a.volume = musicVolume();
    a.muted  = musicMuted();
    a.currentTime = 0;
    a.play().catch(function () {});
    _currentCtx = key;
  }

  function stopMusic() {
    if (_currentCtx && _music[_currentCtx]) {
      _music[_currentCtx].pause();
      _music[_currentCtx].currentTime = 0;
    }
    _currentCtx = null;
  }

  // ── Volume / mute setters ─────────────────────────────────────────────────
  function setSfxVolume(val) {
    localStorage.setItem('ml_sfxVolume', JSON.stringify(val));
    Object.keys(_sfx).forEach(function (k) { _sfx[k].volume = val; });
  }

  function setMusicVolume(val) {
    localStorage.setItem('ml_musicVolume', JSON.stringify(val));
    Object.keys(_music).forEach(function (k) { _music[k].volume = val; });
  }

  function setMusicMuted(muted) {
    localStorage.setItem('ml_musicMuted', JSON.stringify(muted));
    Object.keys(_music).forEach(function (k) { _music[k].muted = muted; });
  }

  // ── Theme selection ───────────────────────────────────────────────────────
  function setTheme(themeId) {
    if (!THEMES[themeId]) return;
    var wasPlaying = _currentCtx;
    stopMusic();
    localStorage.setItem('ml_audioTheme', themeId);

    // If music was playing, restart with new theme
    if (wasPlaying) {
      var ctx = wasPlaying.split(':')[1];
      if (ctx) startMusic(ctx);
    }
  }

  function getThemeList() {
    var list = [];
    Object.keys(THEMES).forEach(function (id) {
      list.push({ id: id, name: THEMES[id].name });
    });
    return list;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.AudioManager = {
    playCorrect:    playCorrect,
    playWrong:      playWrong,
    playFlip:       playFlip,
    startMusic:     startMusic,
    stopMusic:      stopMusic,
    setSfxVolume:   setSfxVolume,
    setMusicVolume: setMusicVolume,
    setMusicMuted:  setMusicMuted,
    sfxVolume:      sfxVolume,
    musicVolume:    musicVolume,
    musicMuted:     musicMuted,
    setTheme:       setTheme,
    getTheme:       getTheme,
    getThemeList:   getThemeList
  };
})();
