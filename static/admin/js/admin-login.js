// ============================================================================
// MINDLOBBY ADMIN — LOGIN
// ============================================================================

const form     = document.getElementById('adminLoginForm');
const loginBtn = document.getElementById('loginBtn');
const pwInput  = document.getElementById('password');
const pwToggle = document.getElementById('pwToggle');

// ── Password visibility toggle ──────────────────────────────────────────────
if (pwToggle) {
  pwToggle.addEventListener('click', () => {
    const isPassword = pwInput.type === 'password';
    pwInput.type = isPassword ? 'text' : 'password';
    pwToggle.querySelector('i').className = isPassword
      ? 'fas fa-eye-slash'
      : 'fas fa-eye';
  });
}

// ── Form submit ──────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = pwInput.value;

  if (!username || !password) {
    showNotification('Please fill in all fields.', 'error');
    return;
  }

  // Disable & show loading state
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Authenticating…';

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const response = await fetch(window.location.pathname, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Timezone': timezone
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      loginBtn.innerHTML = '<i class="fas fa-check"></i> Access Granted';
      loginBtn.style.background = 'var(--success)';
      setTimeout(() => { window.location.href = data.redirect; }, 600);
    } else {
      showNotification(data.message || 'Authentication failed.', 'error');
      resetButton();
    }

  } catch {
    showNotification('Connection error. Please try again.', 'error');
    resetButton();
  }
});

function resetButton() {
  loginBtn.disabled = false;
  loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  loginBtn.style.background = '';
}

// ── Notification ─────────────────────────────────────────────────────────────
function showNotification(message, type) {
  // Remove any existing ones first
  document.querySelectorAll('.notification').forEach(n => n.remove());

  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.innerHTML = `
    <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(n);

  requestAnimationFrame(() => n.classList.add('show'));

  setTimeout(() => {
    n.classList.remove('show');
    setTimeout(() => n.remove(), 400);
  }, 3500);
}