/* ============================================================================
   MINDLOBBY — AUDIO MANAGER
   Centralized singleton for SFX and background music playback.
   All settings read from localStorage (ml_ prefix keys).
   ============================================================================ */
(function () {
  'use strict';

  // ── Audio file paths ───────────────────────────────────────────────────────
  var PATHS = {
    correct:  '/static/audio/correct.mp3',
    wrong:    '/static/audio/wrong.mp3',
    lobby:    '/static/audio/lobby-bgm.mp3',
    game:     '/static/audio/game-bgm.mp3',
    quiz:     '/static/audio/quiz-bgm.mp3'
  };

  // ── Defaults ───────────────────────────────────────────────────────────────
  var DEFAULT_SFX_VOL   = 0.7;
  var DEFAULT_MUSIC_VOL = 0.5;

  // ── Internal state ─────────────────────────────────────────────────────────
  var _sfx       = {};   // { correct: Audio, wrong: Audio }
  var _music     = {};   // { lobby: Audio, game: Audio, quiz: Audio }
  var _currentCtx = null; // currently playing music context key

  // ── localStorage helpers ───────────────────────────────────────────────────
  function _get(key, fallback) {
    var v = localStorage.getItem('ml_' + key);
    if (v === null) return fallback;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }

  function sfxVolume()   { return _get('sfxVolume',   DEFAULT_SFX_VOL); }
  function musicVolume() { return _get('musicVolume', DEFAULT_MUSIC_VOL); }
  function musicMuted()  { return _get('musicMuted',  false); }

  // ── Lazy-load audio elements ───────────────────────────────────────────────
  function _ensureSfx(name) {
    if (!_sfx[name]) {
      _sfx[name] = new Audio(PATHS[name]);
      _sfx[name].preload = 'auto';
    }
    return _sfx[name];
  }

  function _ensureMusic(ctx) {
    if (!_music[ctx]) {
      _music[ctx] = new Audio(PATHS[ctx]);
      _music[ctx].loop = true;
      _music[ctx].preload = 'auto';
    }
    return _music[ctx];
  }

  // ── SFX playback ──────────────────────────────────────────────────────────
  function playCorrect() {
    var a = _ensureSfx('correct');
    a.volume = sfxVolume();
    a.currentTime = 0;
    a.play().catch(function () {});
  }

  function playWrong() {
    var a = _ensureSfx('wrong');
    a.volume = sfxVolume();
    a.currentTime = 0;
    a.play().catch(function () {});
  }

  // ── Background music ──────────────────────────────────────────────────────
  function startMusic(context) {
    // context: 'lobby' | 'game' | 'quiz'
    if (!PATHS[context]) return;

    // Already playing this context — just ensure volume/mute is correct
    if (_currentCtx === context) {
      var existing = _music[context];
      if (existing) {
        existing.volume = musicVolume();
        existing.muted  = musicMuted();
      }
      return;
    }

    // Stop whatever is currently playing
    stopMusic();

    var a = _ensureMusic(context);
    a.volume = musicVolume();
    a.muted  = musicMuted();
    a.currentTime = 0;
    a.play().catch(function () {});
    _currentCtx = context;
  }

  function stopMusic() {
    if (_currentCtx && _music[_currentCtx]) {
      _music[_currentCtx].pause();
      _music[_currentCtx].currentTime = 0;
    }
    _currentCtx = null;
  }

  // ── Volume / mute setters (called from Settings panel) ─────────────────────
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

  // ── Public API ─────────────────────────────────────────────────────────────
  window.AudioManager = {
    playCorrect:    playCorrect,
    playWrong:      playWrong,
    startMusic:     startMusic,
    stopMusic:      stopMusic,
    setSfxVolume:   setSfxVolume,
    setMusicVolume: setMusicVolume,
    setMusicMuted:  setMusicMuted,
    sfxVolume:      sfxVolume,
    musicVolume:    musicVolume,
    musicMuted:     musicMuted
  };
})();
