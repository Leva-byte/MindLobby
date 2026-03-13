// ============================================================================
// MINDLOBBY ADMIN — DASHBOARD
// ADMIN_PATH is injected by Flask as a global constant in the HTML
// ============================================================================

// ── State ─────────────────────────────────────────────────────────────────────
let auditOffset   = 0;
const AUDIT_LIMIT = 30;
let pendingAction = null;   // { type, userId, username }
let usersCache    = [];

// ── Client-side pagination state ──────────────────────────────────────────────
const TABLE_PAGE_SIZE = 15;   // rows per page for data tables
const LOG_PAGE_SIZE   = 20;   // rows per page for log-style lists

let _pgState = {
  users:        { data: [], page: 1 },
  banned:       { data: [], page: 1 },
  content:      { data: [], page: 1 },
  lobbies:      { data: [], page: 1 },
  failedLogins: { data: [], page: 1 },
};

// ── Reusable pagination renderer ──────────────────────────────────────────────
function renderPaginationControls(paginationId, page, totalItems, pageSize) {
  const el = document.getElementById(paginationId);
  if (!el) return;
  const maxPage = Math.ceil(totalItems / pageSize);
  if (maxPage <= 1) { el.style.display = 'none'; return; }

  el.style.display = 'flex';
  const info = el.querySelector('.pg-info');
  const prev = el.querySelector('.pg-prev');
  const next = el.querySelector('.pg-next');
  if (info) info.textContent = `Page ${page} of ${maxPage} (${totalItems} items)`;
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= maxPage;
}

function changePage(key, dir, renderFn) {
  const s = _pgState[key];
  const maxPage = Math.ceil(s.data.length / (key === 'failedLogins' ? LOG_PAGE_SIZE : TABLE_PAGE_SIZE));
  s.page = Math.max(1, Math.min(maxPage, s.page + dir));
  renderFn();
}

function slicePage(key) {
  const s = _pgState[key];
  const size = key === 'failedLogins' ? LOG_PAGE_SIZE : TABLE_PAGE_SIZE;
  const start = (s.page - 1) * size;
  return s.data.slice(start, start + size);
}

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
  if (tabId === 'tab-security')     { loadSecurityStats(); loadBannedUsers(); }
  if (tabId === 'tab-auditlog')     loadAuditLog(true);
  if (tabId === 'tab-failedlogins') loadFailedLogins();
  if (tabId === 'tab-analytics')    loadAnalytics();
  if (tabId === 'tab-lobbies')      loadLobbies();
  if (tabId === 'tab-content')      loadContent();
  if (tabId === 'tab-useractivity') loadUserActivity(true);
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
    revoke_reset_token:  ['t-ban',    'fa-key'],
    delete_document:     ['t-delete', 'fa-file-circle-xmark'],
    close_lobby:         ['t-ban',    'fa-door-closed'],
    flag_document:       ['t-role',   'fa-flag'],
    review_report:       ['t-unban',  'fa-flag-checkered'],
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

    if (!usersCache.length) {
      setEmpty(container, 'fa-users-slash', 'No users found.');
      document.getElementById('usersPagination').style.display = 'none';
      return;
    }

    _pgState.users.data = usersCache;
    _pgState.users.page = 1;
    renderUsersPage();
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

    const tokensBtn = `<button class="action-btn action-btn-demote" onclick="viewResetTokens(${user.id},'${escapeHTML(user.username)}')" title="View reset tokens"><i class="fas fa-key"></i></button>`;

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
        <td><div class="actions-cell">${banBtn}${unbanBtn}${roleBtn}${tokensBtn}${delBtn}</div></td>
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

function renderUsersPage() {
  const container = document.getElementById('usersTableContainer');
  container.innerHTML = buildUsersTable(slicePage('users'));
  renderPaginationControls('usersPagination', _pgState.users.page, _pgState.users.data.length, TABLE_PAGE_SIZE);
}
function usersPage(dir) { changePage('users', dir, renderUsersPage); }

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

// ── Banned Users List ─────────────────────────────────────────────────────────
async function loadBannedUsers() {
  const container = document.getElementById('bannedUsersContainer');
  if (!container) return;

  setLoading(container, 'Loading banned users…');

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/banned-users`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (!data.banned_users.length) {
      setEmpty(container, 'fa-ban', 'No banned users at the moment.');
      document.getElementById('bannedPagination').style.display = 'none';
      return;
    }

    _pgState.banned.data = data.banned_users;
    _pgState.banned.page = 1;
    renderBannedPage();

  } catch (err) {
    console.error('loadBannedUsers:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load banned users.');
  }
}

function buildBannedUsersTable(users) {
  const rows = users.map(u => {
    const initials = getInitials(u.username);
    const permanent = u.permanent === 1;
    const expires = permanent ? '<span class="badge badge-unverified">Permanent</span>' : formatDateTime(u.expires_at);
    const banCount = u.ban_count > 1 ? ` <span class="badge badge-unverified" title="Banned ${u.ban_count} times">×${u.ban_count}</span>` : '';

    return `
      <tr>
        <td><span class="id-badge">#${u.user_id}</span></td>
        <td>
          <div class="user-cell">
            <div class="user-mini-avatar">${initials}</div>
            <span class="user-cell-name">${escapeHTML(u.username)}</span>
          </div>
        </td>
        <td>${escapeHTML(u.email)}</td>
        <td>${escapeHTML(u.reason ?? '—')}</td>
        <td>${formatDateTime(u.banned_at)}</td>
        <td>${expires}${banCount}</td>
        <td>
          <button class="action-btn action-btn-unban"
                  onclick="confirmUnban(${u.user_id}, '${escapeHTML(u.username)}')">
            <i class="fas fa-circle-check"></i> Unban
          </button>
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th><th>User</th><th>Email</th><th>Reason</th>
          <th>Banned At</th><th>Expires</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderBannedPage() {
  const container = document.getElementById('bannedUsersContainer');
  container.innerHTML = buildBannedUsersTable(slicePage('banned'));
  renderPaginationControls('bannedPagination', _pgState.banned.page, _pgState.banned.data.length, TABLE_PAGE_SIZE);
}
function bannedPage(dir) { changePage('banned', dir, renderBannedPage); }

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
      document.getElementById('failedLoginsPagination').style.display = 'none';
      return;
    }

    _pgState.failedLogins.data = data.entries;
    _pgState.failedLogins.page = 1;
    renderFailedLoginsPage();

  } catch (err) {
    console.error('loadFailedLogins:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load data.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function renderFailedLoginsPage() {
  const container = document.getElementById('failedLoginsContainer');
  const entries = slicePage('failedLogins');
  container.innerHTML = entries.map(e => `
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
  renderPaginationControls('failedLoginsPagination', _pgState.failedLogins.page, _pgState.failedLogins.data.length, LOG_PAGE_SIZE);
}
function failedLoginsPage(dir) { changePage('failedLogins', dir, renderFailedLoginsPage); }

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
    document.getElementById('banReason').placeholder = 'e.g. Spamming, abusive behaviour…';
    document.getElementById('banDuration').value = '168';
    const durationGroup = document.getElementById('banDuration')?.closest('.modal-input-group');
    if (durationGroup) durationGroup.style.display = '';
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
    } else if (type === 'close_lobby') {
      const { roomCode } = pendingAction;
      res = await fetch(`/${ADMIN_PATH}/api/lobbies/${encodeURIComponent(roomCode)}/close`, { method: 'POST' });
      data = await res.json();
      if (data?.success) { showNotification(data.message, 'success'); loadLobbies(); }
      else { showNotification(data?.message || 'Failed to close lobby.', 'error'); }
      return;
    } else if (type === 'delete_document') {
      const { docId } = pendingAction;
      res = await fetch(`/${ADMIN_PATH}/api/content/${docId}`, { method: 'DELETE' });
      data = await res.json();
      if (data?.success) { showNotification(data.message, 'success'); loadContent(); closeReportDetail(); }
      else { showNotification(data?.message || 'Delete failed.', 'error'); }
      return;
    } else if (type === 'flag_document') {
      const { docId } = pendingAction;
      const reason = document.getElementById('banReason')?.value.trim() || 'Flagged by admin';
      res = await fetch(`/${ADMIN_PATH}/api/content/${docId}/flag`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      data = await res.json();
      if (data?.success) { showNotification(data.message, 'success'); loadContent(); }
      else { showNotification(data?.message || 'Flag failed.', 'error'); }
      return;
    }

    data = await res.json();

    if (data?.success) {
      showNotification(data.message, 'success');
      loadUsers(true);
      loadSecurityStats();
      loadBannedUsers();
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

// ── Analytics ─────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  const grid = document.getElementById('analyticsStatsGrid');
  const btn  = document.getElementById('refreshAnalyticsBtn');

  if (grid) grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Loading analytics…</span></div>`;
  if (btn) btn.classList.add('spinning');

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/analytics`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    grid.innerHTML = buildAnalyticsCards(data.stats);
    updateTimestamp();

  } catch (err) {
    console.error('loadAnalytics:', err);
    if (grid) grid.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Failed to load analytics.</p></div>`;
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function buildAnalyticsCards(s) {
  const cards = [
    { label: 'Total Users',      value: s.total_users,      icon: 'fa-users',           cls: '' },
    { label: 'Total Documents',   value: s.total_documents,  icon: 'fa-file-alt',        cls: '' },
    { label: 'Total Flashcards',  value: s.total_flashcards, icon: 'fa-layer-group',     cls: 'stat-success' },
    { label: 'Quiz Attempts',     value: s.total_quizzes,    icon: 'fa-question-circle', cls: '' },
    { label: 'Games Played',      value: s.total_games,      icon: 'fa-gamepad',         cls: '' },
    { label: 'New (7 days)',      value: s.new_users_week,   icon: 'fa-user-plus',       cls: 'stat-success' },
    { label: 'New (30 days)',     value: s.new_users_month,  icon: 'fa-calendar',        cls: '' },
    { label: 'Pending Reports',   value: s.pending_reports,  icon: 'fa-flag',            cls: s.pending_reports > 0 ? 'stat-warning' : '' },
  ];

  return cards.map(c => `
    <div class="stat-card ${c.cls}">
      <div class="stat-top">
        <div class="stat-label">${c.label}</div>
        <div class="stat-icon"><i class="fas ${c.icon}"></i></div>
      </div>
      <div class="stat-value">${c.value ?? '—'}</div>
    </div>`).join('');
}

// ── Lobby Monitoring ──────────────────────────────────────────────────────────
async function loadLobbies() {
  const container = document.getElementById('lobbiesTableContainer');
  const btn       = document.getElementById('refreshLobbiesBtn');

  setLoading(container, 'Loading active lobbies…');
  if (btn) btn.classList.add('spinning');

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/lobbies`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (!data.lobbies.length) {
      setEmpty(container, 'fa-door-open', 'No active lobbies right now.');
      document.getElementById('lobbiesPagination').style.display = 'none';
      return;
    }

    _pgState.lobbies.data = data.lobbies;
    _pgState.lobbies.page = 1;
    renderLobbiesPage();
    updateTimestamp();

  } catch (err) {
    console.error('loadLobbies:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load lobbies.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function buildLobbiesTable(lobbies) {
  const rows = lobbies.map(lobby => {
    const visBadge = lobby.public
      ? `<span class="badge badge-user"><i class="fas fa-globe"></i> Public</span>`
      : `<span class="badge badge-unverified"><i class="fas fa-lock"></i> Private</span>`;

    const phaseMap = {
      lobby:           ['badge-user',       'Lobby'],
      playing:         ['badge-verified',   'Playing'],
      question_active: ['badge-verified',   'Question'],
      question_reveal: ['badge-admin',      'Reveal'],
      results:         ['badge-unverified', 'Results'],
    };
    const [phaseCls, phaseLabel] = phaseMap[lobby.game_phase] ?? ['badge-user', lobby.game_phase];

    const playerList = lobby.players.map(p => escapeHTML(p)).join(', ') || '—';
    const created = lobby.created_at ? formatDateTime(lobby.created_at) : '—';

    return `
      <tr>
        <td><span class="id-badge">${escapeHTML(lobby.room_code)}</span></td>
        <td>${escapeHTML(lobby.host_username ?? '—')}</td>
        <td>${lobby.player_count}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escapeHTML(playerList)}">${escapeHTML(playerList)}</td>
        <td>${visBadge}</td>
        <td><span class="badge ${phaseCls}">${phaseLabel}</span></td>
        <td>${created}</td>
        <td>
          <button class="action-btn action-btn-ban"
                  onclick="confirmCloseLobby('${escapeHTML(lobby.room_code)}')">
            <i class="fas fa-door-closed"></i> Close
          </button>
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Code</th><th>Host</th><th>Players</th><th>Player List</th>
          <th>Visibility</th><th>Phase</th><th>Created</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderLobbiesPage() {
  const container = document.getElementById('lobbiesTableContainer');
  container.innerHTML = buildLobbiesTable(slicePage('lobbies'));
  renderPaginationControls('lobbiesPagination', _pgState.lobbies.page, _pgState.lobbies.data.length, TABLE_PAGE_SIZE);
}
function lobbiesPage(dir) { changePage('lobbies', dir, renderLobbiesPage); }

function confirmCloseLobby(roomCode) {
  openModal({
    icon: 'fa-door-closed', iconClass: 'danger',
    title: 'Close Lobby',
    message: `Force-close room <strong>${escapeHTML(roomCode)}</strong>? All players will be disconnected immediately.`,
    confirmClass: '', confirmLabel: 'Close Room',
    banOptions: false,
    action: { type: 'close_lobby', roomCode }
  });
}

// ── Content Moderation ────────────────────────────────────────────────────────
let contentSearchTimer = null;

function debounceContentSearch() {
  clearTimeout(contentSearchTimer);
  contentSearchTimer = setTimeout(loadContent, 400);
}

async function loadContent(silent) {
  const container = document.getElementById('contentTableContainer');
  const btn       = document.getElementById('refreshContentBtn');
  const search    = document.getElementById('contentSearchInput')?.value.trim() || '';
  const fileType  = document.getElementById('contentFileTypeFilter')?.value || '';
  const uploader  = document.getElementById('contentUploaderFilter')?.value || '';

  if (!silent) setLoading(container, 'Loading documents…');
  if (btn) btn.classList.add('spinning');

  try {
    const params = new URLSearchParams();
    if (search)   params.set('search', search);
    if (fileType) params.set('file_type', fileType);
    if (uploader) params.set('uploader', uploader);
    const qs  = params.toString();
    const url = `/${ADMIN_PATH}/api/content` + (qs ? `?${qs}` : '');
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Populate uploader dropdown (preserving current selection)
    const uploaderSelect = document.getElementById('contentUploaderFilter');
    if (uploaderSelect && data.uploaders) {
      const current = uploaderSelect.value;
      uploaderSelect.innerHTML = '<option value="">All Uploaders</option>' +
        data.uploaders.map(function (u) {
          return '<option value="' + u + '"' + (u === current ? ' selected' : '') + '>' + u + '</option>';
        }).join('');
    }

    if (!data.documents.length) {
      const hasFilters = search || fileType || uploader;
      setEmpty(container, 'fa-file-alt', hasFilters ? 'No documents match your filters.' : 'No documents uploaded yet.');
      document.getElementById('contentPagination').style.display = 'none';
      return;
    }

    _pgState.content.data = data.documents;
    _pgState.content.page = 1;
    renderContentPage();
    updateTimestamp();

  } catch (err) {
    console.error('loadContent:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load documents.');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function buildContentTable(docs) {
  const rows = docs.map(doc => {
    const reportBadge = doc.report_count > 0
      ? `<span class="badge badge-unverified"><i class="fas fa-flag"></i> ${doc.report_count}</span>`
      : `<span style="color:var(--text-muted);font-size:0.75em">—</span>`;

    const viewReportsBtn = doc.report_count > 0
      ? `<button class="action-btn action-btn-promote"
               onclick="viewDocumentReports(${doc.id}, '${escapeHTML(doc.original_filename).replace(/'/g, "\\'")}')">
           <i class="fas fa-flag"></i> Reports
         </button>`
      : '';

    const nameEsc = escapeHTML(doc.original_filename).replace(/'/g, "\\'");

    return `
      <tr ${doc.report_count > 0 ? 'style="background:rgba(251,191,36,0.04)"' : ''}>
        <td><span class="id-badge">#${doc.id}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escapeHTML(doc.original_filename)}">${escapeHTML(doc.original_filename)}</td>
        <td>${escapeHTML(doc.uploader_username)}</td>
        <td><span class="badge badge-user">${escapeHTML(doc.file_type.toUpperCase())}</span></td>
        <td>${doc.flashcard_count}</td>
        <td>${formatDate(doc.upload_date)}</td>
        <td>${reportBadge}</td>
        <td>
          <div class="actions-cell">
            ${viewReportsBtn}
            <button class="action-btn action-btn-promote"
                    onclick="confirmFlagDocument(${doc.id}, '${nameEsc}')">
              <i class="fas fa-flag"></i> Flag
            </button>
            <button class="action-btn action-btn-delete"
                    onclick="confirmDeleteDocument(${doc.id}, '${nameEsc}')">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th><th>Filename</th><th>Uploader</th><th>Type</th>
          <th>Cards</th><th>Uploaded</th><th>Reports</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderContentPage() {
  const container = document.getElementById('contentTableContainer');
  container.innerHTML = buildContentTable(slicePage('content'));
  renderPaginationControls('contentPagination', _pgState.content.page, _pgState.content.data.length, TABLE_PAGE_SIZE);
}
function contentPage(dir) { changePage('content', dir, renderContentPage); }

function confirmDeleteDocument(docId, filename) {
  openModal({
    icon: 'fa-trash', iconClass: 'danger',
    title: 'Delete Document',
    message: `Permanently delete <strong>${escapeHTML(filename)}</strong>? This removes the file, all flashcards, and all reports. Cannot be undone.`,
    confirmClass: '', confirmLabel: 'Delete Document',
    banOptions: false,
    action: { type: 'delete_document', docId, filename }
  });
}

function confirmFlagDocument(docId, filename) {
  openModal({
    icon: 'fa-flag', iconClass: 'warning',
    title: 'Flag Document',
    message: `Flag <strong>${escapeHTML(filename)}</strong> for review. Provide a reason below.`,
    confirmClass: 'warn', confirmLabel: 'Flag Document',
    banOptions: true,
    action: { type: 'flag_document', docId, filename }
  });
  // Repurpose ban reason field for flag reason
  const reasonInput = document.getElementById('banReason');
  if (reasonInput) {
    reasonInput.placeholder = 'e.g. Inappropriate content, copyright issue…';
    reasonInput.value = '';
  }
  // Hide duration field (not relevant for flagging)
  const durationGroup = document.getElementById('banDuration')?.closest('.modal-input-group');
  if (durationGroup) durationGroup.style.display = 'none';
}

async function viewDocumentReports(docId, filename) {
  const panel     = document.getElementById('reportDetailPanel');
  const container = document.getElementById('reportDetailContainer');
  const title     = document.getElementById('reportDocTitle');

  if (!panel || !container) return;

  title.textContent = filename;
  panel.style.display = 'block';
  setLoading(container, 'Loading reports…');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/content/${docId}/reports`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (!data.reports.length) {
      setEmpty(container, 'fa-flag', 'No reports found for this document.');
      return;
    }

    container.innerHTML = data.reports.map(r => {
      const statusCls = r.status === 'pending'
        ? 'badge-unverified' : r.status === 'dismissed'
        ? 'badge-user' : 'badge-verified';

      const actions = r.status === 'pending' ? `
        <button class="action-btn action-btn-unban"
                onclick="reviewReport(${r.id}, 'reviewed')">
          <i class="fas fa-check"></i> Reviewed
        </button>
        <button class="action-btn action-btn-demote"
                onclick="reviewReport(${r.id}, 'dismissed')">
          <i class="fas fa-times"></i> Dismiss
        </button>` : '';

      return `
        <div class="log-entry">
          <div class="log-icon t-ban"><i class="fas fa-flag"></i></div>
          <div class="log-body">
            <div class="log-action">${escapeHTML(r.reason)}</div>
            <div class="log-detail">Flagged by ${escapeHTML(r.admin_username)}
              ${r.reviewer_username ? ` · Reviewed by ${escapeHTML(r.reviewer_username)}` : ''}
            </div>
          </div>
          <div class="log-meta" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div class="log-time">${formatDateTime(r.created_at)}</div>
            <span class="badge ${statusCls}">${r.status}</span>
            <div style="display:flex;gap:4px">${actions}</div>
          </div>
        </div>`;
    }).join('');

  } catch (err) {
    console.error('viewDocumentReports:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load reports.');
  }
}

async function reviewReport(reportId, status) {
  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/reports/${reportId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      showNotification(data.message, 'success');
      loadContent(true);
      closeReportDetail();
    } else {
      showNotification(data.message || 'Failed.', 'error');
    }
  } catch {
    showNotification('Connection error.', 'error');
  }
}

function closeReportDetail() {
  const panel = document.getElementById('reportDetailPanel');
  if (panel) panel.style.display = 'none';
}

// ── Password Reset Token Management ───────────────────────────────────────────
let _tokenViewUserId = null;

async function viewResetTokens(userId, username) {
  _tokenViewUserId = userId;
  const panel     = document.getElementById('tokenDetailPanel');
  const container = document.getElementById('tokenDetailContainer');
  const title     = document.getElementById('tokenUserTitle');

  if (!panel || !container) return;

  title.textContent = username;
  panel.style.display = 'block';
  setLoading(container, 'Loading reset tokens…');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/users/${userId}/reset-tokens`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (!data.tokens.length) {
      setEmpty(container, 'fa-key', 'No active reset tokens for this user.');
      return;
    }

    container.innerHTML = `<div style="margin-bottom:12px;text-align:right">
      <button class="action-btn action-btn-ban" onclick="revokeAllTokens(${userId})">
        <i class="fas fa-ban"></i> Revoke All (${data.tokens.length})
      </button>
    </div>` + data.tokens.map(t => `
      <div class="log-entry">
        <div class="log-icon t-role"><i class="fas fa-key"></i></div>
        <div class="log-body">
          <div class="log-action">Token #${t.id}</div>
          <div class="log-detail">
            IP: ${escapeHTML(t.request_ip ?? '—')} · Browser: ${escapeHTML((t.request_user_agent ?? '').substring(0, 60))}
          </div>
        </div>
        <div class="log-meta" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="log-time">Created: ${formatDateTime(t.created_at)}</div>
          <div class="log-time">Expires: ${formatDateTime(t.expires_at)}</div>
          <button class="action-btn action-btn-ban" onclick="revokeResetToken(${t.id})">
            <i class="fas fa-ban"></i> Revoke
          </button>
        </div>
      </div>`).join('');

  } catch (err) {
    console.error('viewResetTokens:', err);
    setEmpty(container, 'fa-exclamation-circle', 'Failed to load tokens.');
  }
}

async function revokeResetToken(tokenId) {
  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/reset-tokens/${tokenId}/revoke`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showNotification(data.message, 'success');
      if (_tokenViewUserId) {
        const username = document.getElementById('tokenUserTitle')?.textContent || '';
        viewResetTokens(_tokenViewUserId, username);
      }
    } else {
      showNotification(data.message || 'Failed.', 'error');
    }
  } catch {
    showNotification('Connection error.', 'error');
  }
}

async function revokeAllTokens(userId) {
  try {
    const res  = await fetch(`/${ADMIN_PATH}/api/users/${userId}/revoke-all-tokens`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showNotification(data.message, 'success');
      if (_tokenViewUserId) {
        const username = document.getElementById('tokenUserTitle')?.textContent || '';
        viewResetTokens(_tokenViewUserId, username);
      }
    } else {
      showNotification(data.message || 'Failed.', 'error');
    }
  } catch {
    showNotification('Connection error.', 'error');
  }
}

function closeTokenDetail() {
  const panel = document.getElementById('tokenDetailPanel');
  if (panel) panel.style.display = 'none';
  _tokenViewUserId = null;
}

// ============================================================================
// USER ACTIVITY LOG
// ============================================================================

let activityOffset = 0;
const ACTIVITY_LIMIT = 50;

const ACTIVITY_ICONS = {
  // Authentication
  login:                  { icon: 'fa-right-to-bracket',    cls: 'activity-login'    },
  logout:                 { icon: 'fa-right-from-bracket',  cls: 'activity-logout'   },
  signup:                 { icon: 'fa-user-plus',           cls: 'activity-signup'   },
  otp_verified:           { icon: 'fa-envelope-circle-check', cls: 'activity-otp'    },
  failed_login:           { icon: 'fa-triangle-exclamation', cls: 'activity-failed'  },
  // Documents
  document_upload:        { icon: 'fa-cloud-arrow-up',      cls: 'activity-upload'   },
  document_delete:        { icon: 'fa-trash-can',           cls: 'activity-delete'   },
  document_rename:        { icon: 'fa-pen',                 cls: 'activity-rename'   },
  youtube_import:         { icon: 'fa-youtube',             cls: 'activity-youtube'  },
  // Study tools
  flashcard_view:         { icon: 'fa-clone',               cls: 'activity-flashcard'},
  notes_view:             { icon: 'fa-book-open',           cls: 'activity-notesview'},
  notes_download:         { icon: 'fa-file-arrow-down',     cls: 'activity-notes'    },
  quiz_attempt:           { icon: 'fa-circle-question',     cls: 'activity-quiz'     },
  chat_message:           { icon: 'fa-robot',               cls: 'activity-chat'     },
  // Organization
  topic_create:           { icon: 'fa-folder-plus',         cls: 'activity-topic'    },
  topic_update:           { icon: 'fa-folder-open',         cls: 'activity-topic'    },
  topic_delete:           { icon: 'fa-folder-minus',        cls: 'activity-topicdel' },
  // Profile & Account
  username_change:        { icon: 'fa-id-badge',            cls: 'activity-profile'  },
  profile_picture_update: { icon: 'fa-camera',              cls: 'activity-profile'  },
  banner_update:          { icon: 'fa-image',               cls: 'activity-profile'  },
  password_reset_request: { icon: 'fa-key',                 cls: 'activity-reset'    },
  password_reset_complete:{ icon: 'fa-lock',                cls: 'activity-reset'    },
  account_delete:         { icon: 'fa-user-slash',          cls: 'activity-danger'   },
  // Multiplayer
  room_create:            { icon: 'fa-gamepad',             cls: 'activity-room'     },
  room_join:              { icon: 'fa-door-open',           cls: 'activity-room'     },
  // Fallback
  default:                { icon: 'fa-bolt',                cls: 'activity-default'  },
};

function loadUserActivity(reset = false) {
  if (reset) activityOffset = 0;

  const container = document.getElementById('userActivityContainer');
  const eventType = document.getElementById('activityFilter')?.value || '';
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>';

  const params = new URLSearchParams({
    limit:  ACTIVITY_LIMIT,
    offset: activityOffset,
  });
  if (eventType) params.append('event_type', eventType);

  fetch(`/${ADMIN_PATH}/api/user-activity?${params}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) { container.innerHTML = `<div class="empty-state">${data.message}</div>`; return; }

      if (!data.entries.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No activity recorded yet.</p></div>';
        document.getElementById('activityPagination').style.display = 'none';
        return;
      }

      const rows = data.entries.map(e => {
        const meta = ACTIVITY_ICONS[e.event_type] || ACTIVITY_ICONS.default;
        return `
          <div class="activity-row">
            <div class="activity-icon-wrap ${meta.cls}">
              <i class="fas ${meta.icon}"></i>
            </div>
            <div class="activity-body">
              <div class="activity-main">
                <span class="activity-username">${e.username || '<i>deleted</i>'}</span>
                <span class="activity-badge ${meta.cls}">${e.event_type.replace('_', ' ')}</span>
                ${e.detail ? `<span class="activity-detail">${e.detail}</span>` : ''}
              </div>
              <div class="activity-meta">
                <span><i class="fas fa-clock"></i> ${formatDateTime(e.created_at)}</span>
                ${e.ip_address ? `<span><i class="fas fa-location-dot"></i> ${e.ip_address}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');

      container.innerHTML = `<div class="activity-feed">${rows}</div>`;

      // Pagination
      const total   = data.total;
      const page    = Math.floor(activityOffset / ACTIVITY_LIMIT) + 1;
      const maxPage = Math.ceil(total / ACTIVITY_LIMIT);
      document.getElementById('activityPagination').style.display = total > ACTIVITY_LIMIT ? 'flex' : 'none';
      document.getElementById('activityPageInfo').textContent = `Page ${page} of ${maxPage} (${total} events)`;
      document.getElementById('activityPrevBtn').disabled = activityOffset === 0;
      document.getElementById('activityNextBtn').disabled = activityOffset + ACTIVITY_LIMIT >= total;
    })
    .catch(() => { container.innerHTML = '<div class="empty-state">Failed to load activity log.</div>'; });
}

function activityPage(dir) {
  activityOffset = Math.max(0, activityOffset + dir * ACTIVITY_LIMIT);
  loadUserActivity(false);
}