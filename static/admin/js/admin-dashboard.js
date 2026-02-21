// ============================================================================
// MINDLOBBY ADMIN — DASHBOARD
// ADMIN_PATH is injected by Flask as a global constant in the HTML
// ============================================================================

// ── State ─────────────────────────────────────────────────────────────────────
let auditOffset   = 0;
const AUDIT_LIMIT = 30;
let pendingAction = null;   // { type, userId, username }
let usersCache    = [];

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadUsers(true);   // silent — don't log the initial page load fetch
  loadSecurityStats();
  loadRecentActivity();
  updateTimestamp();
});

// ── Tab Navigation ────────────────────────────────────────────────────────────
function showTab(tabId, clickedBtn) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');

  if (clickedBtn) {
    clickedBtn.classList.add('active');
  } else {
    document.querySelectorAll('.sidebar-item').forEach(b => {
      if (b.getAttribute('onclick')?.includes(tabId)) b.classList.add('active');
    });
  }

  // Lazy-load on first visit
  if (tabId === 'tab-security')                                  loadSecurityStats();
  if (tabId === 'tab-auditlog')                                  loadAuditLog(true);
  if (tabId === 'tab-failedlogins')                              loadFailedLogins();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(iso) {
  return iso ? iso.substring(0, 10) : '—';
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return iso.replace('T', '  ').substring(0, 19);
}

function updateTimestamp() {
  const el = document.getElementById('lastRefresh');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

function escapeHTML(str) {
  const m = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
  return String(str ?? '').replace(/[&<>"']/g, c => m[c]);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setLoading(el, msg = 'Loading…') {
  if (el) el.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>${msg}</span></div>`;
}

function setEmpty(el, icon, msg) {
  if (el) el.innerHTML = `<div class="empty-state"><i class="fas ${icon}"></i><p>${msg}</p></div>`;
}

// ── Log icon helper ───────────────────────────────────────────────────────────
function logIcon(action) {
  const map = {
    admin_login:         ['t-login',  'fa-right-to-bracket'],
    admin_logout:        ['t-logout', 'fa-right-from-bracket'],
    ban_user:            ['t-ban',    'fa-ban'],
    unban_user:          ['t-unban',  'fa-circle-check'],
    delete_user:         ['t-delete', 'fa-trash'],
    change_role:         ['t-role',   'fa-crown'],
    view_users:          ['t-view',   'fa-eye'],
    view_security_stats: ['t-view',   'fa-eye'],
  };
  const [cls, ico] = map[action] ?? ['t-default', 'fa-circle-dot'];
  return `<div class="log-icon ${cls}"><i class="fas ${ico}"></i></div>`;
}

function friendlyAction(action) {
  return (action ?? 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function loadUsers(silent = false) {
  const container = document.getElementById('usersTableContainer');
  const btn       = document.getElementById('refreshUsersBtn');

  setLoading(container, 'Loading users…');
  if (btn) btn.classList.add('spinning');

  try {
    const url  = silent ? `/${ADMIN_PATH}/api/users?silent=1` : `/${ADMIN_PATH}/api/users`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    usersCache = data.users;
    setText('totalUsers',    usersCache.length);
    setText('verifiedUsers', usersCache.filter(u => u.email_verified === 1).length);

    if (!usersCache.length) { setEmpty(container, 'fa-users-slash', 'No users found.'); return; }

    container.innerHTML = buildUsersTable(usersCache);
    updateTimestamp();

  } catch (err) {
    console.error('loadUsers:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load users.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function buildUsersTable(users) {
  const rows = users.map(user => {
    const isAdmin = user.role === 'admin';
    const initials = getInitials(user.username);

    const roleBadge = isAdmin
      ? `<span class="badge badge-admin"><i class="fas fa-crown"></i> Admin</span>`
      : `<span class="badge badge-user"><i class="fas fa-user"></i> User</span>`;

    const verifiedBadge = user.email_verified === 1
      ? `<span class="badge badge-verified"><i class="fas fa-check"></i> Verified</span>`
      : `<span class="badge badge-unverified"><i class="fas fa-times"></i> Unverified</span>`;

    // Don't show destructive actions on admin accounts or yourself
    const banBtn = !isAdmin
      ? `<button class="action-btn action-btn-ban" onclick="confirmBan(${user.id},'${escapeHTML(user.username)}')"><i class="fas fa-ban"></i> Ban</button>`
      : '';

    const unbanBtn = !isAdmin
      ? `<button class="action-btn action-btn-unban" onclick="confirmUnban(${user.id},'${escapeHTML(user.username)}')"><i class="fas fa-circle-check"></i> Unban</button>`
      : '';

    const roleBtn = isAdmin
      ? `<button class="action-btn action-btn-demote" onclick="confirmRole(${user.id},'${escapeHTML(user.username)}','user')"><i class="fas fa-arrow-down"></i> Demote</button>`
      : `<button class="action-btn action-btn-promote" onclick="confirmRole(${user.id},'${escapeHTML(user.username)}','admin')"><i class="fas fa-crown"></i> Promote</button>`;

    const delBtn = !isAdmin
      ? `<button class="action-btn action-btn-delete" onclick="confirmDelete(${user.id},'${escapeHTML(user.username)}')"><i class="fas fa-trash"></i></button>`
      : `<span style="color:var(--text-muted);font-size:0.7em;padding:5px 6px;">Protected</span>`;

    return `
      <tr>
        <td><span class="id-badge">#${user.id}</span></td>
        <td>
          <div class="user-cell">
            <div class="user-mini-avatar">${initials}</div>
            <span class="user-cell-name">${escapeHTML(user.username)}</span>
          </div>
        </td>
        <td>${escapeHTML(user.email)}</td>
        <td>${roleBadge}</td>
        <td>${verifiedBadge}</td>
        <td>${formatDate(user.created_at)}</td>
        <td>${user.last_login ? formatDate(user.last_login) : '<span style="color:var(--text-muted)">Never</span>'}</td>
        <td><div class="actions-cell">${banBtn}${unbanBtn}${roleBtn}${delBtn}</div></td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th><th>User</th><th>Email</th><th>Role</th>
          <th>Status</th><th>Joined</th><th>Last Login</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Security Stats ────────────────────────────────────────────────────────────
async function loadSecurityStats() {
  const container = document.getElementById('securityStatsContainer');
  const btn       = document.getElementById('refreshSecurityBtn');

  setLoading(container, 'Loading security data…');
  if (btn) btn.classList.add('spinning');

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/security-stats`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const s = data.stats;
    setText('activeBans',     s.active_bans     ?? 0);
    setText('failedAttempts', s.failed_attempts ?? 0);

    const bansClass  = (s.active_bans  ?? 0) > 0 ? 'warn' : 'ok';
    const failsClass = (s.failed_attempts ?? 0) > 5 ? 'warn' : 'ok';

    container.innerHTML = `
      <div class="security-grid">
        <div class="security-cell">
          <div class="sec-value ${bansClass}">${s.active_bans ?? 0}</div>
          <div class="sec-label">Active Bans</div>
        </div>
        <div class="security-cell">
          <div class="sec-value ${failsClass}">${s.failed_attempts ?? 0}</div>
          <div class="sec-label">Failed Attempts</div>
        </div>
        <div class="security-cell">
          <div class="sec-value neutral">${s.total_audit_logs ?? 0}</div>
          <div class="sec-label">Audit Log Entries</div>
        </div>
      </div>`;

    updateTimestamp();

  } catch (err) {
    console.error('loadSecurityStats:', err);
    setEmpty(container, 'fa-shield-alt', 'Failed to load security data.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

// ── Recent Activity (overview snapshot) ───────────────────────────────────────
async function loadRecentActivity() {
  const container = document.getElementById('recentActivityContainer');
  if (!container) return;
  try {
    // silent=1 tells the backend not to log this fetch as an audit action
    const res  = await fetch(`/${ADMIN_PATH}/api/audit-log?limit=8&silent=1`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    if (!data.entries.length) { setEmpty(container, 'fa-scroll', 'No activity yet.'); return; }
    container.innerHTML = '';
    renderLogEntries(container, data.entries);
  } catch {
    setEmpty(container, 'fa-scroll', 'Could not load recent activity.');
  }
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
async function loadAuditLog(reset = false) {
  const container = document.getElementById('auditLogContainer');
  const btn       = document.getElementById('refreshAuditBtn');

  if (reset) { auditOffset = 0; setLoading(container, 'Loading audit log…'); }
  if (btn) btn.classList.add('spinning');

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/audit-log?limit=${AUDIT_LIMIT}&offset=${auditOffset}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (reset) container.innerHTML = '';

    if (!data.entries.length && reset) {
      setEmpty(container, 'fa-scroll', 'No audit log entries yet.');
      return;
    }

    renderLogEntries(container, data.entries);

    // Load more button
    const existing = container.querySelector('.log-load-more');
    if (existing) existing.remove();

    const hasMore = (auditOffset + AUDIT_LIMIT) < data.total;
    if (hasMore) {
      const more = document.createElement('div');
      more.className = 'log-load-more';
      more.innerHTML = `<button class="btn-refresh" onclick="loadMoreAudit()">Load more <i class="fas fa-chevron-down"></i></button>`;
      container.appendChild(more);
      auditOffset += AUDIT_LIMIT;
    }

    updateTimestamp();

  } catch (err) {
    console.error('loadAuditLog:', err);
    if (reset) setEmpty(container, 'fa-scroll', 'Failed to load audit log.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function loadMoreAudit() { loadAuditLog(false); }

function renderLogEntries(container, entries) {
  const html = entries.map(e => `
    <div class="log-entry">
      ${logIcon(e.action)}
      <div class="log-body">
        <div class="log-action">${friendlyAction(e.action)}</div>
        <div class="log-detail">${escapeHTML(e.details ?? "—")}</div>
      </div>
      <div class="log-meta">
        <div class="log-time">${formatDateTime(e.timestamp)}</div>
        <div class="log-admin">${escapeHTML(e.admin_username ?? 'system')}</div>
      </div>
    </div>`).join('');

  container.insertAdjacentHTML('beforeend', html);
}

// ── Failed Logins ─────────────────────────────────────────────────────────────
async function loadFailedLogins() {
  const container = document.getElementById('failedLoginsContainer');
  const btn       = document.getElementById('refreshFailedBtn');

  setLoading(container, 'Loading failed login attempts…');
  if (btn) btn.classList.add('spinning');

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/failed-logins?limit=50`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (!data.entries.length) {
      setEmpty(container, 'fa-triangle-exclamation', 'No failed login attempts on record.');
      return;
    }

    container.innerHTML = data.entries.map(e => `
      <div class="log-entry">
        <div class="log-icon t-ban"><i class="fas fa-triangle-exclamation"></i></div>
        <div class="log-body">
          <div class="log-action">${escapeHTML(e.ip_address ?? 'Unknown IP')}</div>
          <div class="log-detail">${escapeHTML(e.reason ?? '—')}</div>
        </div>
        <div class="log-meta">
          <div class="log-time">${formatDateTime(e.attempted_at)}</div>
        </div>
      </div>`).join('');

  } catch (err) {
    console.error('loadFailedLogins:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load data.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal({ icon, iconClass, title, message, confirmClass, confirmLabel, banOptions, action }) {
  pendingAction = action;

  document.getElementById('modalIcon').className      = `modal-icon ${iconClass}`;
  document.getElementById('modalIconInner').className = `fas ${icon}`;
  document.getElementById('modalTitle').textContent   = title;
  document.getElementById('modalMessage').innerHTML   = message;

  const confirmBtn = document.getElementById('modalConfirmBtn');
  confirmBtn.className   = `modal-btn modal-btn-confirm ${confirmClass ?? ''}`;
  confirmBtn.textContent = confirmLabel ?? 'Confirm';

  document.getElementById('banOptions').style.display = banOptions ? 'block' : 'none';
  if (banOptions) {
    document.getElementById('banReason').value   = '';
    document.getElementById('banDuration').value = '168';
  }

  document.getElementById('confirmModal').classList.add('open');
}

function closeModal() {
  document.getElementById('confirmModal').classList.remove('open');
  pendingAction = null;
}

// Close on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});

async function executeModalAction() {
  if (!pendingAction) return;
  const { type, userId } = pendingAction;
  closeModal();

  try {
    let res, data;

    if (type === 'ban') {
      const reason   = document.getElementById('banReason')?.value.trim() || 'Banned by admin';
      const duration = parseInt(document.getElementById('banDuration')?.value) || 168;
      res  = await fetch(`/${ADMIN_PATH}/api/users/${userId}/ban`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, duration_hours: duration })
      });
    } else if (type === 'unban') {
      res = await fetch(`/${ADMIN_PATH}/api/users/${userId}/unban`, { method: 'POST' });
    } else if (type === 'promote' || type === 'demote') {
      res = await fetch(`/${ADMIN_PATH}/api/users/${userId}/role`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: type === 'promote' ? 'admin' : 'user' })
      });
    } else if (type === 'delete') {
      res = await fetch(`/${ADMIN_PATH}/api/users/${userId}`, { method: 'DELETE' });
    }

    data = await res.json();

    if (data?.success) {
      showNotification(data.message, 'success');
      loadUsers(true);
      loadSecurityStats();
    } else {
      showNotification(data?.message || 'Action failed.', 'error');
    }

  } catch (err) {
    console.error('executeModalAction:', err);
    showNotification('Connection error.', 'error');
  }
}

// ── Modal triggers ────────────────────────────────────────────────────────────
function confirmBan(userId, username) {
  openModal({
    icon: 'fa-ban', iconClass: 'danger',
    title: 'Ban User',
    message: `Ban <strong>${escapeHTML(username)}</strong>? They won't be able to log in until the ban expires.`,
    confirmClass: '', confirmLabel: 'Ban User',
    banOptions: true,
    action: { type: 'ban', userId, username }
  });
}

function confirmUnban(userId, username) {
  openModal({
    icon: 'fa-circle-check', iconClass: 'success',
    title: 'Unban User',
    message: `Remove all active bans for <strong>${escapeHTML(username)}</strong>?`,
    confirmClass: 'success', confirmLabel: 'Unban',
    banOptions: false,
    action: { type: 'unban', userId, username }
  });
}

function confirmRole(userId, username, newRole) {
  const promote = newRole === 'admin';
  openModal({
    icon: promote ? 'fa-crown' : 'fa-arrow-down',
    iconClass: promote ? 'warning' : 'danger',
    title: promote ? 'Promote to Admin' : 'Demote to User',
    message: promote
      ? `Give <strong>${escapeHTML(username)}</strong> full admin access?`
      : `Remove admin privileges from <strong>${escapeHTML(username)}</strong>?`,
    confirmClass: promote ? 'warn' : '',
    confirmLabel: promote ? 'Promote' : 'Demote',
    banOptions: false,
    action: { type: promote ? 'promote' : 'demote', userId, username }
  });
}

function confirmDelete(userId, username) {
  openModal({
    icon: 'fa-trash', iconClass: 'danger',
    title: 'Delete Account',
    message: `Permanently delete <strong>${escapeHTML(username)}</strong>? This cannot be undone.`,
    confirmClass: '', confirmLabel: 'Delete Permanently',
    banOptions: false,
    action: { type: 'delete', userId, username }
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  try {
    const res  = await fetch(`/${ADMIN_PATH}/logout`, { method: 'POST' });
    const data = await res.json();
    if (data.success) window.location.href = data.redirect;
  } catch {
    window.location.href = '/';
  }
}

// ── Notification ──────────────────────────────────────────────────────────────
function showNotification(message, type = 'success') {
  document.querySelectorAll('.notification').forEach(n => n.remove());
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i><span>${message}</span>`;
  document.body.appendChild(n);
  requestAnimationFrame(() => n.classList.add('show'));
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, 3500);
}