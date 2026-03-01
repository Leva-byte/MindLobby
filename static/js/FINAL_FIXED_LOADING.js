// ============================================================================
// COMPLETE FIXED LOADING SYSTEM - Timer and Steps Working
// ============================================================================

let isUploading = false;
let uploadTimer = null;
let uploadStartTime = null;
let overtimeNotified = false;
let uploadAbortController = null;
const ESTIMATED_UPLOAD_TIME = 60; // 60 seconds
const MAX_UPLOAD_TIME = 150;      // hard fail at 150 seconds

function showLoadingOverlay(filename) {
  if (isUploading) {
    showNotification('⏳ Please wait for the current upload to complete', 'warning');
    return false;
  }
  
  isUploading = true;
  uploadStartTime = Date.now();
  overtimeNotified = false;
  
  const overlay = document.getElementById('fcLoadingOverlay');
  if (!overlay) {
    console.error('fcLoadingOverlay not found!');
    return false;
  }
  
  // Reset classes
  overlay.classList.remove('completing');
  overlay.classList.add('active');
  
  // Reset all steps
  for (let i = 1; i <= 4; i++) {
    const step = document.getElementById(`step${i}`);
    if (step) {
      step.classList.remove('active', 'complete');
    }
  }
  
  // Set filename
  const fileEl = document.getElementById('fcLoadingFile');
  if (fileEl) {
    fileEl.textContent = filename || '';
  }
  
  // IMPORTANT: Set initial timer text BEFORE starting interval
  const timerText = document.getElementById('fcTimerText');
  if (timerText) {
    timerText.textContent = `${ESTIMATED_UPLOAD_TIME}s`;
  }
  
  // Start countdown timer
  startCountdownTimer();
  
  // Start Step 1 immediately
  setTimeout(() => {
    setLoadingStep(1, 'Uploading File...', 'Sending file to server...');
  }, 100);
  
  return true;
}

function hideLoadingOverlay() {
  isUploading = false;
  
  // Stop timer
  if (uploadTimer) {
    clearInterval(uploadTimer);
    uploadTimer = null;
  }
  
  const overlay = document.getElementById('fcLoadingOverlay');
  if (!overlay) return;
  
  // Hide overlay
  overlay.classList.remove('active', 'completing');
  
  // Reset timer display
  const timerEl = document.getElementById('fcTimer');
  const timerText = document.getElementById('fcTimerText');
  if (timerEl) timerEl.classList.remove('warning');
  if (timerText) timerText.textContent = `${ESTIMATED_UPLOAD_TIME}s`;
}

function startCountdownTimer() {
  const timerEl = document.getElementById('fcTimer');
  const timerText = document.getElementById('fcTimerText');
  
  if (!timerEl || !timerText) {
    console.error('Timer elements not found!');
    return;
  }
  
  // Clear any existing timer
  if (uploadTimer) {
    clearInterval(uploadTimer);
  }
  
  // Update immediately
  timerText.textContent = `${ESTIMATED_UPLOAD_TIME}s`;
  timerEl.classList.remove('warning');
  
  // Then start interval
  uploadTimer = setInterval(() => {
    if (!uploadStartTime) return;
    
    const elapsed = Math.floor((Date.now() - uploadStartTime) / 1000);
    const remainingSeconds = Math.max(0, ESTIMATED_UPLOAD_TIME - elapsed);
    
    timerText.textContent = `${remainingSeconds}s`;
    
    // Turn orange when less than 15 seconds remain
    if (remainingSeconds <= 15 && remainingSeconds > 0) {
      timerEl.classList.add('warning');
    }
    
    // If we go past estimated time, show overtime
    if (remainingSeconds === 0 && elapsed > ESTIMATED_UPLOAD_TIME) {
      const overtime = elapsed - ESTIMATED_UPLOAD_TIME;
      timerText.textContent = `+${overtime}s`;
      timerEl.classList.add('warning');

      // Show patience modal once at 60s
      if (!overtimeNotified) {
        overtimeNotified = true;
        showOvertimeModal();
      }

      // Hard fail at 150s
      if (elapsed >= MAX_UPLOAD_TIME) {
        if (uploadAbortController) uploadAbortController.abort();
        hideLoadingOverlay();
        closeOvertimeModal();
        showNotification('Upload timed out — the file was too large to process. Please try a smaller file.', 'error');
      }
    }
  }, 100); // Update every 100ms for smoother countdown
}

function setLoadingStep(stepNumber, title, message) {
  console.log(`Setting step ${stepNumber}: ${title}`);
  
  // Update title
  const titleEl = document.getElementById('fcLoadingTitle');
  if (titleEl) {
    titleEl.textContent = title;
  } else {
    console.error('fcLoadingTitle not found!');
  }
  
  // Update status message
  const msgEl = document.getElementById('fcStatusMsg');
  if (msgEl) {
    msgEl.textContent = message;
  } else {
    console.error('fcStatusMsg not found!');
  }
  
  // Mark previous steps as complete
  for (let i = 1; i < stepNumber; i++) {
    const step = document.getElementById(`step${i}`);
    if (step) {
      step.classList.remove('active');
      step.classList.add('complete');
    } else {
      console.error(`step${i} not found!`);
    }
  }
  
  // Mark current step as active
  const currentStep = document.getElementById(`step${stepNumber}`);
  if (currentStep) {
    currentStep.classList.remove('complete');
    currentStep.classList.add('active');
  } else {
    console.error(`step${stepNumber} not found!`);
  }
  
  // Remove active from future steps
  for (let i = stepNumber + 1; i <= 4; i++) {
    const step = document.getElementById(`step${i}`);
    if (step) {
      step.classList.remove('active', 'complete');
    }
  }
}

function completeLoadingSpinner() {
  const overlay = document.getElementById('fcLoadingOverlay');
  if (overlay) {
    overlay.classList.add('completing');
  }
}

// ============================================================================
// OVERTIME MODAL CONTROL
// ============================================================================

function showOvertimeModal() {
  const backdrop = document.getElementById('overtimeBackdrop');
  const modal = document.getElementById('overtimeModal');
  if (backdrop) backdrop.classList.add('open');
  if (modal) modal.classList.add('open');
}

function closeOvertimeModal() {
  const backdrop = document.getElementById('overtimeBackdrop');
  const modal = document.getElementById('overtimeModal');
  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');
}

window.closeOvertimeModal = closeOvertimeModal;

// ============================================================================
// UPLOAD FILE FUNCTION
// ============================================================================

window.uploadFile = async function(file) {
  console.log('uploadFile called for:', file.name);

  if (!showLoadingOverlay(file.name)) {
    return false;
  }

  uploadAbortController = new AbortController();
  const formData = new FormData();
  formData.append('file', file);

  try {
    // Step 1 is already set in showLoadingOverlay

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: uploadAbortController.signal
    });

    // Step 2: Extracting
    setLoadingStep(2, 'Extracting Text...', 'Reading document content...');
    await sleep(800);

    const data = await response.json();

    if (response.ok && data.success) {
      // Step 3: AI Processing
      setLoadingStep(3, 'AI Processing...', 'Generating flashcards with AI...');
      await sleep(1200);
      
      // Step 4: Complete
      setLoadingStep(4, 'Complete!', `${data.flashcards_generated} flashcards created!`);
      completeLoadingSpinner();
      await sleep(1200);
      
      hideLoadingOverlay();
      
      showNotification(`✅ ${data.flashcards_generated} flashcards created for "${file.name}"!`, 'success');
      
      // Refresh documents and dashboard stats
      if (typeof loadDocuments === 'function') loadDocuments();
      if (typeof updateDashboardStats === 'function') updateDashboardStats();

      // Auto-open flashcard panel
      if (data.flashcards && data.flashcards.length > 0 && window.Flashcards) {
        setTimeout(() => {
          Flashcards.openPanel(data.flashcards, file.name, `${data.flashcards.length} flashcards generated`);
        }, 300);
      }
      return true;

    } else {
      hideLoadingOverlay();
      const msg = data.message || 'Upload failed';
      showNotification(msg, 'error');
      return false;
    }

  } catch (err) {
    hideLoadingOverlay();
    closeOvertimeModal();
    // Don't show a duplicate error if the abort was triggered by the 150s timeout
    if (err.name !== 'AbortError') {
      showNotification(`Network error uploading ${file.name}`, 'error');
    }
    console.error('Upload error:', err);
    return false;
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// UPLOAD BUTTON CONTROL
// ============================================================================

function disableUploadButtons() {
  const uploadBtns = document.querySelectorAll('.upload-btn, [onclick*="uploadDocument"], button:has(i.fa-upload)');
  uploadBtns.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });
}

function enableUploadButtons() {
  const uploadBtns = document.querySelectorAll('.upload-btn, [onclick*="uploadDocument"], button:has(i.fa-upload)');
  uploadBtns.forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  });
}

