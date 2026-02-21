// ============================================================================
// MINDLOBBY HOME PAGE JAVASCRIPT - COMPLETE WITH PASSWORD RESET
// ============================================================================

// ============================================================================
// BOOT LOADER
// ============================================================================
window.addEventListener('load', () => {
  const bootLoader = document.getElementById('bootLoader');
  
  setTimeout(() => {
    bootLoader.classList.add('hidden');
    setTimeout(() => {
      bootLoader.style.display = 'none';
    }, 500);
  }, 1000);
});

// ============================================================================
// ROTATING TEXT ANIMATION
// ============================================================================
let currentTextIndex = 0;
const rotatingTexts = document.querySelectorAll('.rotating-text');

function rotateText() {
  rotatingTexts[currentTextIndex].classList.remove('active');
  currentTextIndex = (currentTextIndex + 1) % rotatingTexts.length;
  rotatingTexts[currentTextIndex].classList.add('active');
}

setInterval(rotateText, 3000);

// ============================================================================
// SMOOTH SCROLL
// ============================================================================
function scrollToFeatures() {
  document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================================
// INTERSECTION OBSERVER FOR SCROLL ANIMATIONS
// ============================================================================
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

document.querySelectorAll('.feature-panel, .step-card, .feature-card').forEach(el => {
  observer.observe(el);
});

// ============================================================================
// PASSWORD STRENGTH VALIDATION
// ============================================================================
function checkPasswordStrength(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  
  const metRequirements = Object.values(requirements).filter(Boolean).length;
  
  let strength = 'weak';
  if (metRequirements === 5) strength = 'strong';
  else if (metRequirements >= 3) strength = 'medium';
  
  return { requirements, strength, metRequirements };
}

function updatePasswordStrengthUI(password) {
  const result = checkPasswordStrength(password);
  const strengthMeter = document.getElementById('passwordStrength');
  const strengthText = document.getElementById('passwordStrengthText');
  const submitButton = document.querySelector('#signupForm .auth-btn');
  
  if (!strengthMeter || !strengthText) return;
  
  strengthMeter.className = `password-strength-meter ${result.strength}`;
  strengthMeter.style.width = `${(result.metRequirements / 5) * 100}%`;
  
  const strengthLabels = {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong'
  };
  strengthText.textContent = strengthLabels[result.strength];
  strengthText.className = `password-strength-text ${result.strength}`;
  
  const reqElements = {
    length: document.getElementById('req-length'),
    uppercase: document.getElementById('req-uppercase'),
    lowercase: document.getElementById('req-lowercase'),
    number: document.getElementById('req-number'),
    special: document.getElementById('req-special')
  };
  
  Object.keys(result.requirements).forEach(key => {
    if (reqElements[key]) {
      reqElements[key].className = result.requirements[key] ? 'req-met' : 'req-not-met';
      reqElements[key].innerHTML = result.requirements[key] 
        ? '<i class="fas fa-check-circle"></i>' 
        : '<i class="fas fa-times-circle"></i>';
    }
  });
  
  if (submitButton) {
    if (result.strength === 'strong') {
      submitButton.disabled = false;
      submitButton.style.opacity = '1';
      submitButton.style.cursor = 'pointer';
    } else {
      submitButton.disabled = true;
      submitButton.style.opacity = '0.5';
      submitButton.style.cursor = 'not-allowed';
    }
  }
  
  return result.strength === 'strong';
}

// ⭐ NEW: Password strength for reset password modal
function updateResetPasswordStrengthUI(password) {
  const result = checkPasswordStrength(password);
  const strengthMeter = document.getElementById('resetPasswordStrength');
  const strengthText = document.getElementById('resetPasswordStrengthText');
  const submitButton = document.getElementById('resetPasswordBtn');
  
  if (!strengthMeter || !strengthText) return;
  
  strengthMeter.className = `password-strength-meter ${result.strength}`;
  strengthMeter.style.width = `${(result.metRequirements / 5) * 100}%`;
  
  const strengthLabels = {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong'
  };
  strengthText.textContent = strengthLabels[result.strength];
  strengthText.className = `password-strength-text ${result.strength}`;
  
  if (submitButton) {
    if (result.strength === 'strong') {
      submitButton.disabled = false;
      submitButton.style.opacity = '1';
      submitButton.style.cursor = 'pointer';
    } else {
      submitButton.disabled = true;
      submitButton.style.opacity = '0.5';
      submitButton.style.cursor = 'not-allowed';
    }
  }
  
  return result.strength === 'strong';
}

// ============================================================================
// AUTH MODAL FUNCTIONS
// ============================================================================
function showLoginModal() {
  const modal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  loginForm.style.display = 'block';
  loginForm.style.opacity = '1';
  signupForm.style.display = 'none';
  signupForm.style.opacity = '1';
  
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function showSignupModal() {
  const modal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  loginForm.style.display = 'none';
  loginForm.style.opacity = '1';
  signupForm.style.display = 'block';
  signupForm.style.opacity = '1';
  
  const submitButton = signupForm.querySelector('.auth-btn');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.style.opacity = '0.5';
    submitButton.style.cursor = 'not-allowed';
  }
  
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
  
  setTimeout(() => {
    loginForm.style.opacity = '1';
    signupForm.style.opacity = '1';
  }, 300);
}

function switchToSignup(e) {
  e.preventDefault();
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  loginForm.style.transition = 'opacity 0.3s ease';
  loginForm.style.opacity = '0';
  
  setTimeout(() => {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    signupForm.style.opacity = '0';
    signupForm.style.transition = 'opacity 0.3s ease';
    
    signupForm.offsetHeight;
    signupForm.style.opacity = '1';
  }, 300);
}

function switchToLogin(e) {
  e.preventDefault();
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  signupForm.style.transition = 'opacity 0.3s ease';
  signupForm.style.opacity = '0';
  
  setTimeout(() => {
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
    loginForm.style.opacity = '0';
    loginForm.style.transition = 'opacity 0.3s ease';
    
    loginForm.offsetHeight;
    loginForm.style.opacity = '1';
  }, 300);
}

// ============================================================================
// AUTHENTICATION HANDLERS
// ============================================================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(data.message, 'success');
      closeAuthModal();
      setTimeout(() => window.location.href = '/studio', 1000);
    } else {
      showNotification(data.message, 'error');
    }
  } catch (error) {
    showNotification('Connection error. Please try again.', 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  
  const passwordCheck = checkPasswordStrength(password);
  
  if (!passwordCheck.requirements.length) {
    showNotification('Password must be at least 8 characters', 'error');
    return;
  }
  
  if (!passwordCheck.requirements.uppercase) {
    showNotification('Password must contain at least one uppercase letter', 'error');
    return;
  }
  
  if (!passwordCheck.requirements.lowercase) {
    showNotification('Password must contain at least one lowercase letter', 'error');
    return;
  }
  
  if (!passwordCheck.requirements.number) {
    showNotification('Password must contain at least one number', 'error');
    return;
  }
  
  if (!passwordCheck.requirements.special) {
    showNotification('Password must contain at least one special character', 'error');
    return;
  }
  
  if (passwordCheck.strength !== 'strong') {
    showNotification('Please ensure your password meets all requirements', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(data.message, 'success');
      
      if (data.requires_verification) {
        showOTPModal(email);
      } else {
        closeAuthModal();
        setTimeout(() => window.location.href = '/studio', 1000);
      }
    } else {
      showNotification(data.message, 'error');
    }
  } catch (error) {
    showNotification('Connection error. Please try again.', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    showNotification('Logged out successfully', 'success');
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    showNotification('Error logging out', 'error');
  }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `auth-notification ${type}`;
  
  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };
  
  notification.innerHTML = `
    <i class="fas ${iconMap[type] || 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 100);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================================================
// AUTH STATE MANAGEMENT
// ============================================================================
async function checkAuth() {
  try {
    const response = await fetch('/check-auth');
    const data = await response.json();
    
    if (data.authenticated) {
      updateUIForLoggedInUser(data.username);
    }
  } catch (error) {
    console.log('Not authenticated');
  }
}

function updateUIForLoggedInUser(username) {
  const navActions = document.querySelector('.nav-actions');
  navActions.innerHTML = `
    <a href="/dashboard" class="nav-link">Dashboard</a>
    <span class="user-welcome">Welcome, ${username}</span>
    <button class="btn-nav btn-logout" onclick="handleLogout()">
      <i class="fas fa-sign-out-alt"></i>
      Log Out
    </button>
  `;
}

// ============================================================================
// PASSWORD TOGGLE FUNCTIONALITY
// ============================================================================
function togglePassword(inputId) {
  const passwordInput = document.getElementById(inputId);
  const icon = document.getElementById(inputId + '-icon');
  
  if (!passwordInput || !icon) return;
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// ============================================================================
// OTP VERIFICATION FUNCTIONS
// ============================================================================

let otpTimer = null;
let otpTimeLeft = 600;

function showOTPModal(email) {
  document.getElementById('authModal').classList.remove('show');
  
  const otpModal = document.getElementById('otpModal');
  document.getElementById('otpEmail').textContent = email;
  otpModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  document.getElementById('otp1').focus();
  
  startOTPTimer();
}

function closeOTPModal() {
  const otpModal = document.getElementById('otpModal');
  otpModal.classList.remove('show');
  document.body.style.overflow = 'auto';
  
  if (otpTimer) {
    clearInterval(otpTimer);
    otpTimer = null;
  }
  
  for (let i = 1; i <= 6; i++) {
    document.getElementById(`otp${i}`).value = '';
  }
  
  otpTimeLeft = 600;
  document.getElementById('otpTimer').textContent = '10:00';
  document.getElementById('resendBtn').disabled = true;
}

function moveToNext(current, nextId) {
  if (current.value.length === 1 && nextId) {
    document.getElementById(nextId).focus();
  }
}

function handleBackspace(event, current, prevId) {
  if (event.key === 'Backspace' && current.value === '' && prevId) {
    document.getElementById(prevId).focus();
  }
}

function handleOTPComplete() {
  const allFilled = Array.from({length: 6}, (_, i) => 
    document.getElementById(`otp${i+1}`).value
  ).every(val => val !== '');
  
  if (allFilled) {
    setTimeout(() => verifyOTP(), 300);
  }
}

function startOTPTimer() {
  otpTimeLeft = 600;
  document.getElementById('resendBtn').disabled = true;
  
  otpTimer = setInterval(() => {
    otpTimeLeft--;
    
    const minutes = Math.floor(otpTimeLeft / 60);
    const seconds = otpTimeLeft % 60;
    document.getElementById('otpTimer').textContent = 
      `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (otpTimeLeft <= 0) {
      clearInterval(otpTimer);
      document.getElementById('otpTimer').textContent = 'Expired';
      document.getElementById('resendBtn').disabled = false;
    }
  }, 1000);
}

async function verifyOTP() {
  let otpCode = '';
  for (let i = 1; i <= 6; i++) {
    otpCode += document.getElementById(`otp${i}`).value;
  }
  
  if (otpCode.length !== 6) {
    showNotification('Please enter all 6 digits', 'error');
    return;
  }
  
  const btn = document.getElementById('verifyOTPBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  
  try {
    const response = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp_code: otpCode })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(data.message, 'success');
      closeOTPModal();
      setTimeout(() => window.location.href = '/studio', 1000);
    } else {
      showNotification(data.message, 'error');
      for (let i = 1; i <= 6; i++) {
        document.getElementById(`otp${i}`).value = '';
      }
      document.getElementById('otp1').focus();
    }
  } catch (error) {
    showNotification('Verification failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify Code';
  }
}

async function resendOTP() {
  const btn = document.getElementById('resendBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  
  try {
    const response = await fetch('/api/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(data.message, 'success');
      startOTPTimer();
      for (let i = 1; i <= 6; i++) {
        document.getElementById(`otp${i}`).value = '';
      }
      document.getElementById('otp1').focus();
    } else {
      showNotification(data.message, 'error');
      btn.disabled = false;
    }
  } catch (error) {
    showNotification('Failed to resend code', 'error');
    btn.disabled = false;
  } finally {
    btn.innerHTML = '<i class="fas fa-redo"></i> Resend Code';
  }
}

// ============================================================================
// ⭐ NEW: FORGOT PASSWORD FUNCTIONS
// ============================================================================

function showForgotPassword(e) {
  e.preventDefault();
  
  // Close login modal
  document.getElementById('authModal').classList.remove('show');
  
  // Show forgot password modal
  const forgotModal = document.getElementById('forgotPasswordModal');
  forgotModal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  // Focus email input
  document.getElementById('forgotEmail').focus();
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal');
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
  
  // Clear input
  document.getElementById('forgotEmail').value = '';
}

function backToLogin(e) {
  e.preventDefault();
  closeForgotPasswordModal();
  setTimeout(() => showLoginModal(), 300);
}

async function handleForgotPassword(e) {
  e.preventDefault();
  
  const email = document.getElementById('forgotEmail').value;
  const btn = document.getElementById('sendResetBtn');
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  
  try {
    const response = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(data.message, 'success');
      closeForgotPasswordModal();
    } else {
      showNotification(data.message, 'error');
    }
  } catch (error) {
    showNotification('Failed to send reset link. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
  }
}

// ⭐ NEW: Handle reset password (called from email link)
function showResetPasswordModal(token) {
  const modal = document.getElementById('resetPasswordModal');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  // Store token for later use
  window.resetToken = token;
  
  // Focus first input
  document.getElementById('newPassword').focus();
}

function closeResetPasswordModal() {
  const modal = document.getElementById('resetPasswordModal');
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
  
  // Clear inputs
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  window.resetToken = null;
}

async function handleResetPassword(e) {
  e.preventDefault();
  
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const token = window.resetToken;
  
  if (!token) {
    showNotification('Invalid reset token', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showNotification('Passwords do not match', 'error');
    return;
  }
  
  const passwordCheck = checkPasswordStrength(newPassword);
  if (passwordCheck.strength !== 'strong') {
    showNotification('Please use a stronger password', 'error');
    return;
  }
  
  const btn = document.getElementById('resetPasswordBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
  
  try {
    const response = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification(data.message, 'success');
      closeResetPasswordModal();
      setTimeout(() => showLoginModal(), 1000);
    } else {
      showNotification(data.message, 'error');
    }
  } catch (error) {
    showNotification('Failed to reset password. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Reset Password';
  }
}

// Check URL for reset token on page load
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset_token');
  
  if (resetToken) {
    showResetPasswordModal(resetToken);
  }
});

// ============================================================================
// INITIALIZE ON PAGE LOAD
// ============================================================================
checkAuth();

console.log('MindLobby Home initialized with password reset');