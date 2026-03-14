/* ============================================================================
   Tutorial.js — Step-by-step onboarding overlay for new MindLobby users
   ============================================================================ */
(function () {
  'use strict';

  // ── Tutorial step definitions ──────────────────────────────────────────
  // Desktop steps (sidebar visible)
  var DESKTOP_STEPS = [
    {
      target: null,
      title: 'Welcome to MindLobby!',
      text: "Let's take a quick tour of your Studio so you know where everything is.",
      position: 'center'
    },
    {
      target: '#sidebar',
      title: 'Sidebar Navigation',
      text: 'Use the sidebar to switch between your study tools, topics, profile, and settings.',
      position: 'right'
    },
    {
      target: '.quick-actions',
      title: 'Quick Actions',
      text: 'Shortcuts to the features you\'ll use most — upload material, create topics, study flashcards, or jump into a quiz.',
      position: 'bottom'
    },
    {
      target: '.nav-item[onclick*="openAddMaterial"]',
      title: 'Add Material',
      text: 'Upload documents (PDF, DOCX, PPTX, TXT) or import YouTube videos. Our AI will generate flashcards and notes automatically.',
      position: 'right'
    },
    {
      target: '.nav-item[data-view="notes"]',
      title: 'Study Tools',
      text: 'Your Notes, Flashcards, and Quizzes live here — all generated from your uploaded materials.',
      position: 'right'
    },
    {
      target: '.nav-item[href="/quickplay"]',
      title: 'Quick Play',
      text: 'Join or host multiplayer quiz rooms to study with friends in real time.',
      position: 'right'
    },
    {
      target: '#chatFab',
      title: 'iTERA — AI Study Buddy',
      text: 'Need help? Click here to chat with iTERA, your AI assistant. Ask questions about your documents or the platform.',
      position: 'top-left'
    },
    {
      target: '.nav-item[data-view="settings"]',
      title: 'Settings & Replay',
      text: 'Customize your theme, audio, and preferences here. You can also replay this tutorial anytime from the Help section inside Settings.',
      position: 'right'
    },
    {
      target: null,
      title: "You're All Set!",
      text: "That's everything! Start by adding your first material and let MindLobby do the rest.",
      position: 'center'
    }
  ];

  // Mobile steps — walk left-to-right across the bottom nav
  var MOBILE_STEPS = [
    {
      target: null,
      title: 'Welcome to MindLobby!',
      text: "Let's take a quick tour of your Studio so you know where everything is.",
      position: 'center'
    },
    {
      target: '.mobile-nav-btn[data-view="overview"]',
      title: 'Home',
      text: 'Your overview at a glance — see everything all at once including your quick actions, recent activity, and study stats.',
      position: 'top'
    },
    {
      target: '.mobile-nav-btn[data-view="topics"]',
      title: 'Topics',
      text: 'Browse and manage your study topics. All your uploaded materials are organized here.',
      position: 'top'
    },
    {
      target: '.mobile-nav-add',
      title: 'Add Material',
      text: 'Tap the + button to upload documents (PDF, DOCX, PPTX, TXT) or import YouTube videos. Our AI generates flashcards and notes automatically.',
      position: 'top'
    },
    {
      target: '.mobile-nav-btn[onclick*="quickplay"]',
      title: 'Quick Play',
      text: 'Join or host multiplayer quiz rooms to study with friends in real time.',
      position: 'top'
    },
    {
      target: '#chatFab',
      title: 'iTERA — AI Study Buddy',
      text: 'Need help? Tap here to chat with iTERA, your AI assistant. Ask questions about your documents or the platform.',
      position: 'top-left'
    },
    {
      target: '#mobileMoreBtn',
      title: 'More — Study Tools & Settings',
      text: 'Tap here to access your Notes, Flashcards, Quizzes, Profile, and Settings. You can replay this tutorial anytime from the Help section inside Settings.',
      position: 'top'
    },
    {
      target: null,
      title: "You're All Set!",
      text: "That's everything! Start by adding your first material and let MindLobby do the rest.",
      position: 'center'
    }
  ];

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function getSteps() {
    return isMobile() ? MOBILE_STEPS : DESKTOP_STEPS;
  }

  var currentStep = 0;
  var backdropEl = null;
  var tooltipEl = null;
  var isActive = false;

  // ── Build DOM elements ─────────────────────────────────────────────────
  function createOverlay() {
    if (backdropEl) return;

    backdropEl = document.createElement('div');
    backdropEl.className = 'tutorial-backdrop';
    backdropEl.id = 'tutorialBackdrop';

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tutorial-tooltip';
    tooltipEl.id = 'tutorialTooltip';

    document.body.appendChild(backdropEl);
    document.body.appendChild(tooltipEl);
  }

  function removeOverlay() {
    if (backdropEl) { backdropEl.remove(); backdropEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    // Remove any lingering highlight
    var prev = document.querySelector('.tutorial-highlight');
    if (prev) prev.classList.remove('tutorial-highlight');
  }

  // ── Render a single step ───────────────────────────────────────────────
  function renderStep() {
    var steps = getSteps();
    var step = steps[currentStep];
    if (!step) return;

    // Remove previous highlight
    var prev = document.querySelector('.tutorial-highlight');
    if (prev) prev.classList.remove('tutorial-highlight');

    var isFirst = currentStep === 0;
    var isLast = currentStep === steps.length - 1;

    // Step counter
    var counter = '<div class="tutorial-step-counter">Step ' + (currentStep + 1) + ' of ' + steps.length + '</div>';

    // Buttons
    var buttons = '<div class="tutorial-buttons">';
    if (!isLast) {
      buttons += '<button class="tutorial-btn tutorial-btn-skip" onclick="Tutorial.skip()">Skip Tour</button>';
    }
    if (!isFirst) {
      buttons += '<button class="tutorial-btn tutorial-btn-back" onclick="Tutorial.prev()">Back</button>';
    }
    if (isLast) {
      buttons += '<button class="tutorial-btn tutorial-btn-next" onclick="Tutorial.finish()">Get Started</button>';
    } else {
      buttons += '<button class="tutorial-btn tutorial-btn-next" onclick="Tutorial.next()">' + (isFirst ? "Let's Go" : 'Next') + '</button>';
    }
    buttons += '</div>';

    tooltipEl.innerHTML =
      counter +
      '<div class="tutorial-title">' + step.title + '</div>' +
      '<div class="tutorial-text">' + step.text + '</div>' +
      buttons;

    // Position
    if (!step.target || step.position === 'center') {
      // Center overlay (welcome / finish) — clear any leftover inline positioning
      backdropEl.classList.add('tutorial-backdrop-solid');
      tooltipEl.className = 'tutorial-tooltip tutorial-tooltip-center';
      tooltipEl.style.top = '';
      tooltipEl.style.left = '';
      tooltipEl.style.right = '';
      tooltipEl.style.bottom = '';
      tooltipEl.style.transform = '';
    } else {
      backdropEl.classList.remove('tutorial-backdrop-solid');
      tooltipEl.className = 'tutorial-tooltip';

      var el = document.querySelector(step.target);
      if (!el) {
        // If target not found, skip to next
        if (currentStep < steps.length - 1) { currentStep++; renderStep(); }
        return;
      }

      // Highlight the element
      el.classList.add('tutorial-highlight');

      // Scroll into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Position tooltip near the element
      positionTooltip(el, step.position);
    }
  }

  function positionTooltip(el, position) {
    var rect = el.getBoundingClientRect();
    var tt = tooltipEl;
    var TOOLTIP_W = 340;   // matches max-width in CSS
    var TOOLTIP_H = 220;   // conservative estimate; real height measured after
    var MARGIN    = 12;    // min gap from viewport edge
    var FLIP_BUFFER = Math.min(400, window.innerWidth * 0.30); // wider on tight screens

    // Reset inline positioning
    tt.style.top       = '';
    tt.style.left      = '';
    tt.style.right     = '';
    tt.style.bottom    = '';
    tt.style.transform = '';

    var top, left;

    switch (position) {
      case 'top':
        top  = rect.top - TOOLTIP_H - MARGIN;
        left = rect.left;
        // Flip below if not enough room above
        if (top < MARGIN) top = rect.bottom + MARGIN;
        break;

      case 'right':
        top  = rect.top;
        left = rect.right + MARGIN;
        // Flip below if tooltip would bleed off right edge
        if (left + TOOLTIP_W + MARGIN > window.innerWidth || rect.right + FLIP_BUFFER > window.innerWidth) {
          left = rect.left;
          top  = rect.bottom + MARGIN;
        }
        break;

      case 'bottom':
        top  = rect.bottom + MARGIN;
        left = rect.left;
        // Flip above if not enough room below
        if (top + TOOLTIP_H > window.innerHeight - MARGIN) top = rect.top - TOOLTIP_H - MARGIN;
        break;

      case 'top-left':
        top  = rect.top - TOOLTIP_H - MARGIN;
        left = rect.left - TOOLTIP_W - MARGIN;
        // If goes off left edge, anchor to left edge instead
        if (left < MARGIN) left = MARGIN;
        // If not enough room above, flip below
        if (top < MARGIN) top = rect.bottom + MARGIN;
        break;

      default:
        top  = rect.bottom + MARGIN;
        left = rect.left;
    }

    // ── Clamp to viewport ────────────────────────────────────────────────
    // Right edge
    if (left + TOOLTIP_W + MARGIN > window.innerWidth) {
      left = window.innerWidth - TOOLTIP_W - MARGIN;
    }
    // Left edge
    if (left < MARGIN) left = MARGIN;
    // Bottom edge — flip above if we'd go off-screen
    if (top + TOOLTIP_H + MARGIN > window.innerHeight) {
      top = rect.top - TOOLTIP_H - MARGIN;
    }
    // Top edge (last resort)
    if (top < MARGIN) top = MARGIN;

    tt.style.top  = top + 'px';
    tt.style.left = left + 'px';
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  function next() {
    if (currentStep < getSteps().length - 1) {
      currentStep++;
      renderStep();
    }
  }

  function prev() {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  }

  function skip() {
    finish();
  }

  function finish() {
    isActive = false;
    removeOverlay();
    document.body.classList.remove('tutorial-active');

    // Save completion to server
    saveTutorialCompleted();
  }

  function saveTutorialCompleted() {
    try {
      // Use Settings module to sync (it sends the full settings object)
      if (window.Settings && Settings.syncTutorialCompleted) {
        Settings.syncTutorialCompleted();
      } else {
        // Fallback: direct API call with just the tutorial flag
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: { tutorial_completed: true } })
        }).catch(function () {});
      }
    } catch (e) {
      console.error('Tutorial: failed to save completion', e);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function start() {
    currentStep = 0;
    isActive = true;
    document.body.classList.add('tutorial-active');
    createOverlay();
    renderStep();
  }

  function shouldShow(settings) {
    return settings && settings.tutorial_completed === false;
  }

  // Handle window resize while tutorial is active
  window.addEventListener('resize', function () {
    if (!isActive) return;
    var step = getSteps()[currentStep];
    if (step && step.target && step.position !== 'center') {
      var el = document.querySelector(step.target);
      if (el) positionTooltip(el, step.position);
    }
  });

  window.Tutorial = {
    start: start,
    next: next,
    prev: prev,
    skip: skip,
    finish: finish,
    shouldShow: shouldShow
  };
})();