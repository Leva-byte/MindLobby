// ============================================================================
// MINDLOBBY STUDIO - COMPLETE DASHBOARD JAVASCRIPT
// ============================================================================

// ============================================================================
// GLOBAL CONSTANTS & CONFIGURATION
// ============================================================================

// Allowed file types - STRICTLY ENFORCED (PDF, DOC, DOCX, PPTX, TXT)
const ALLOWED_FILE_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt'
};

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.pptx', '.txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES_PER_UPLOAD = 5; // Maximum files in one batch

// ============================================================================
// SIDEBAR NAVIGATION
// ============================================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('active');
  
  // For mobile: close sidebar when clicking outside
  if (window.innerWidth <= 1024) {
    if (sidebar.classList.contains('active')) {
      document.body.classList.add('sidebar-open');
      document.addEventListener('click', closeSidebarOnClickOutside);
    } else {
      document.body.classList.remove('sidebar-open');
      document.removeEventListener('click', closeSidebarOnClickOutside);
    }
  }
}

function closeSidebarOnClickOutside(e) {
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.querySelector('.btn-menu-toggle');
  
  if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
    sidebar.classList.remove('active');
    document.body.classList.remove('sidebar-open');
    document.removeEventListener('click', closeSidebarOnClickOutside);
  }
}

// ============================================================================
// MOBILE BOTTOM NAV — DRAWER OPEN/CLOSE
// ============================================================================

function openMobileDrawer() {
  document.getElementById('mobileDrawer').classList.add('open');
  document.getElementById('mobileDrawerOverlay').classList.add('open');
  document.getElementById('mobileMoreBtn').classList.add('active');
}

function closeMobileDrawer() {
  document.getElementById('mobileDrawer').classList.remove('open');
  document.getElementById('mobileDrawerOverlay').classList.remove('open');
  document.getElementById('mobileMoreBtn').classList.remove('active');
}

/** Sync mobile bottom-nav active state to match current view */
function _syncMobileNav(viewName) {
  // Views accessible via the "More" drawer
  const drawerViews = ['notes', 'flashcards', 'quizzes', 'profile', 'settings'];

  const btns = document.querySelectorAll('.mobile-nav-btn[data-view]');
  btns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  // If the view came from the drawer, highlight "More" button
  const moreBtn = document.getElementById('mobileMoreBtn');
  if (moreBtn) {
    moreBtn.classList.toggle('active', drawerViews.includes(viewName));
  }
}

// Panel icon map for sidebar transitions (only these panels get the icon transition)
const _sidebarPanelIcons = {
  flashcards:  'fas fa-layer-group',
  notes:       'fas fa-sticky-note',
  quizzes:     'fas fa-question-circle'
};

function _sidebarTransition(viewName) {
  const content = document.querySelector('.main-content') || document.querySelector('.studio-content') || document.body;
  const iconClass = _sidebarPanelIcons[viewName] || 'fas fa-circle';
  const overlay = document.createElement('div');
  overlay.className = 'notes-transition-overlay';
  overlay.innerHTML = `
    <div class="notes-transition-inner">
      <i class="${iconClass} notes-transition-icon"></i>
    </div>`;
  content.appendChild(overlay);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('visible'));
  });

  setTimeout(() => {
    showView(viewName);
  }, 250);

  setTimeout(() => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 350);
  }, 600);
}

// Handle navigation item clicks
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item[data-view]');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();

      const view = item.getAttribute('data-view');

      // Skip transition if already on this view
      const currentActive = document.querySelector('.nav-item[data-view].active');
      if (currentActive && currentActive.getAttribute('data-view') === view) return;

      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      // Only Flashcards, Notes, Quizzes get the icon transition; others switch instantly
      if (_sidebarPanelIcons[view]) {
        _sidebarTransition(view);
      } else {
        showView(view);
      }

      // Close sidebar on mobile
      if (window.innerWidth <= 1024) {
        document.getElementById('sidebar').classList.remove('active');
      }
    });
  });
});

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================

function showView(viewName) {
  console.log(`Switching to view: ${viewName}`);

  // Update active nav item (sidebar)
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  navItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === viewName);
  });

  // Update active nav item (mobile bottom nav)
  _syncMobileNav(viewName);

  // Hide ALL view panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.style.display = 'none';
  });

  // Show the target panel (fall back to overview if not found)
  const target = document.getElementById(`panel-${viewName}`);
  if (target) {
    target.style.display = 'block';
  } else {
    const overview = document.getElementById('panel-overview');
    if (overview) overview.style.display = 'block';
  }

  // Clear any active sidebar doc selection when switching views
  document.querySelectorAll('.sidebar-doc-item').forEach(item => {
    item.classList.remove('active');
  });

  // Scroll to top — main-content is the scrollable container
  const mc = document.getElementById('mainContent');
  if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' });

  // Refresh sidebar docs (topic dot colors may have changed)
  loadDocuments();

  // Clean up listeners from panels we're leaving
  if (viewName !== 'flashcards' && window.Flashcards && Flashcards.cleanup) {
    Flashcards.cleanup();
  }
  if (viewName !== 'quizzes' && window.Quizzes && Quizzes.cleanup) {
    Quizzes.cleanup();
  }

  // Panel-specific hooks
  switch (viewName) {
    case 'overview':
      // Refresh welcome banner and header avatar
      _loadWelcomeBannerProfile();
      break;
    case 'topics':
      if (window.Topics) window.Topics.loadTopics();
      break;
    case 'flashcards':
      if (window.Flashcards && Flashcards.loadDocs) Flashcards.loadDocs();
      break;
    case 'notes':
      if (window.Notes && Notes.loadDocs) Notes.loadDocs();
      break;
    case 'quizzes':
      if (window.Quizzes) Quizzes.loadDocs();
      break;
    case 'profile':
      if (window.Profile) Profile.loadProfile();
      break;
    case 'settings':
      if (window.Settings) Settings.loadSettings();
      break;
    case 'upload':
      // Show overview panel and open Add Material choice modal
      const overview = document.getElementById('panel-overview');
      if (overview) overview.style.display = 'block';
      if (typeof openAddMaterialModal === 'function') openAddMaterialModal();
      break;
  }
}

// ============================================================================
// LOGOUT FUNCTIONALITY
// ============================================================================

async function handleLogout(e) {
  e.preventDefault();

  // Show a loading overlay so the user sees a clean transition
  _showLogoutOverlay();

  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  // Clear user preferences so they don't bleed to other users/guests.
  ['ml_theme','ml_sfxVolume','ml_musicVolume','ml_musicMuted','ml_defaultLobbyType']
    .forEach(function(k) { localStorage.removeItem(k); });

  // Brief pause so the overlay is visible, then redirect
  setTimeout(() => { window.location.replace('/'); }, 800);
}

function _showLogoutOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'ml-transition-overlay';
  overlay.innerHTML = `
    <div class="ml-transition-inner">
      <img src="/static/images/favicon.png" alt="MindLobby" class="ml-transition-logo">
      <div class="ml-transition-message">Logging out...</div>
      <div class="ml-transition-bar-track">
        <div class="ml-transition-bar"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.classList.add('visible'); });
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };
  
  notification.innerHTML = `
    <i class="fas ${iconMap[type] || 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  
  // Add styles (theme-aware)
  const isLight = document.body.classList.contains('light-mode');
  notification.style.cssText = `
    position: fixed;
    top: 90px;
    right: 20px;
    background: ${isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(26, 26, 62, 0.95)'};
    color: ${isLight ? '#1a1a2e' : 'white'};
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 10px 25px ${isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.3)'};
    backdrop-filter: blur(20px);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#7c77c6'};
    transform: translateX(120%);
    transition: transform 0.3s ease;
    font-family: 'Inter', sans-serif;
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.style.transform = 'translateX(120%)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================================================
// FILE UPLOAD SYSTEM - COMPREHENSIVE IMPLEMENTATION
// ============================================================================

/**
 * Initialize drag and drop upload area
 * This handles the main upload area in the UI
 */
function initUploadArea() {
  const uploadArea = document.querySelector('.upload-area');
  
  if (!uploadArea) return;
  
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });
  
  // Highlight drop area when item is dragged over
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.remove('dragover');
    }, false);
  });
  
  // Handle dropped files
  uploadArea.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    handleFileUpload(files);
  }, false);
  
  // Handle click to upload
  uploadArea.addEventListener('click', () => {
    triggerFileUpload();
  });
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Trigger file upload dialog
 * This is the MAIN function used by all three upload buttons:
 * 1. Quick Actions "Upload Document" card
 * 2. "Upload New" link in My Documents
 * 3. "Upload Document" button in empty state
 */
function triggerFileUpload() {
  console.log('📤 Opening file upload dialog...');
  
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_EXTENSIONS.join(',');
  input.multiple = true;
  
  input.onchange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
  };
  
  input.click();
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename) {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

/**
 * Validate file type by checking both extension and MIME type
 */
function isValidFileType(file) {
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ACCEPTED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  const hasValidMimeType = Object.keys(ALLOWED_FILE_TYPES).includes(file.type);
  
  // Accept if either extension or MIME type is valid
  // (Some systems may not provide accurate MIME types)
  return hasValidExtension || hasValidMimeType;
}

/**
 * Validate file size
 */
function isValidFileSize(file) {
  return file.size > 0 && file.size <= MAX_FILE_SIZE;
}

/**
 * Get user-friendly file type name
 */
function getFileTypeName(file) {
  const ext = getFileExtension(file.name);
  const typeMap = {
    '.pdf': 'PDF Document',
    '.doc': 'Word Document',
    '.docx': 'Word Document',
    '.pptx': 'PowerPoint Presentation',
    '.txt': 'Text File'
  };
  return typeMap[ext] || 'Unknown';
}

/**
 * Main file upload handler
 * Validates files and processes uploads
 */
async function handleFileUpload(files) {
  if (!files || files.length === 0) {
    showNotification('No files selected', 'warning');
    return;
  }
  
  console.log(`📁 Processing ${files.length} file(s)...`);
  
  // Check if too many files
  if (files.length > MAX_FILES_PER_UPLOAD) {
    showNotification(`Maximum ${MAX_FILES_PER_UPLOAD} files per upload. Please select fewer files.`, 'error');
    return;
  }
  
  const validFiles = [];
  const invalidFiles = [];
  
  // Validate each file
  Array.from(files).forEach(file => {
    const extension = getFileExtension(file.name);
    const fileType = getFileTypeName(file);
    
    console.log(`📄 Checking: ${file.name} (${formatFileSize(file.size)}, ${fileType})`);
    
    if (!isValidFileType(file)) {
      invalidFiles.push({ 
        name: file.name, 
        reason: `Invalid file type. Only ${ACCEPTED_EXTENSIONS.join(', ')} files are allowed` 
      });
    } else if (!isValidFileSize(file)) {
      if (file.size === 0) {
        invalidFiles.push({ 
          name: file.name, 
          reason: 'File is empty (0 bytes)' 
        });
      } else {
        invalidFiles.push({ 
          name: file.name, 
          reason: `File too large (${formatFileSize(file.size)}). Maximum size is 10MB` 
        });
      }
    } else {
      validFiles.push(file);
      console.log(`✅ Valid: ${file.name}`);
    }
  });
  
  // Show errors for invalid files
  if (invalidFiles.length > 0) {
    console.warn(`❌ ${invalidFiles.length} invalid file(s) detected`);
    invalidFiles.forEach(f => {
      showNotification(`${f.name}: ${f.reason}`, 'error');
    });
  }
  
  // Upload valid files
  if (validFiles.length > 0) {
    const pluralFiles = validFiles.length === 1 ? 'file' : 'files';
    showNotification(`📤 Uploading ${validFiles.length} ${pluralFiles}...`, 'info');
    
    let successCount = 0;
    let failCount = 0;
    
    // Upload files sequentially
    for (const file of validFiles) {
      const success = await window.uploadFile(file);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    // Show summary notification
    if (successCount > 0) {
      const pluralSuccess = successCount === 1 ? 'file' : 'files';
      showNotification(`✅ ${successCount} ${pluralSuccess} uploaded successfully!`, 'success');
      
      // Reload documents list if function exists
      if (typeof loadDocuments === 'function') {
        loadDocuments();
      }
      
      // Update stats
      updateDashboardStats();
    }
    
    if (failCount > 0) {
      const pluralFail = failCount === 1 ? 'file' : 'files';
      showNotification(`❌ ${failCount} ${pluralFail} failed to upload`, 'error');
    }
  } else if (invalidFiles.length === 0) {
    showNotification('No valid files to upload', 'warning');
  }
}

/**
 * Upload a single file to the server
 */
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  console.log(`⬆️ Uploading: ${file.name} (${formatFileSize(file.size)})...`);
  
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      // Note: Don't set Content-Type header - browser will set it with boundary
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log(`✅ Upload successful: ${file.name}`);
      console.log('Response:', data);
      
      // Log additional info if provided by server
      if (data.document_id) {
        console.log(`📝 Document ID: ${data.document_id}`);
      }
      if (data.flashcards_generated) {
        console.log(`🎴 Flashcards generated: ${data.flashcards_generated}`);
      }
      
      return true;
    } else {
      console.error(`❌ Upload failed: ${file.name}`, data);
      const errorMsg = data.message || data.error || 'Unknown error occurred';
      showNotification(`Failed to upload ${file.name}: ${errorMsg}`, 'error');
      return false;
    }
  } catch (error) {
    console.error(`❌ Network error uploading ${file.name}:`, error);
    showNotification(`Network error uploading ${file.name}. Please check your connection and try again.`, 'error');
    return false;
  }
}

/**
 * Fetch and render dashboard statistics + recent activity
 */
async function updateDashboardStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (!data.success) return;

    // --- Quick Stats ---
    const topicsEl = document.getElementById('statTopics');
    const flashcardsEl = document.getElementById('statFlashcards');
    const studyTimeEl = document.getElementById('statStudyTime');

    if (topicsEl) topicsEl.textContent = data.topics || 0;
    if (flashcardsEl) flashcardsEl.textContent = data.flashcards || 0;

    // Study time = elapsed since account creation
    if (studyTimeEl && data.created_at) {
      studyTimeEl.textContent = _formatElapsed(data.created_at);
    }

    // Update the topic count badge in sidebar + mobile bottom nav
    const topicBadge = document.querySelector('.nav-item[data-view="topics"] .nav-badge');
    if (topicBadge) topicBadge.textContent = data.topics || 0;
    const mobileBadge = document.getElementById('mobileTopicsBadge');
    if (mobileBadge) mobileBadge.textContent = data.topics || 0;

    // --- Load profile images for welcome banner ---
    _loadWelcomeBannerProfile();

    // --- Recent Activity ---
    const feed = document.getElementById('activityFeed');
    if (!feed) return;

    const activities = data.activities || [];
    if (activities.length === 0) {
      feed.innerHTML = `
        <div class="activity-item">
          <div class="activity-icon"><i class="fas fa-rocket"></i></div>
          <div class="activity-content">
            <p class="activity-text">Welcome to MindLobby Studio!</p>
            <p class="activity-time">Get started by uploading a document</p>
          </div>
        </div>`;
      return;
    }

    feed.innerHTML = activities.map(a => `
      <div class="activity-item">
        <div class="activity-icon"><i class="${_esc(a.icon)}"></i></div>
        <div class="activity-content">
          <p class="activity-text">${_esc(a.text)}</p>
          <p class="activity-time">${_relativeTime(a.time)}</p>
        </div>
      </div>`).join('');

  } catch (e) {
    console.error('Could not load dashboard stats:', e);
  }
}

/** Format an ISO timestamp into relative time (e.g. "3 days ago") */
function _relativeTime(isoStr) {
  if (!isoStr) return '';
  const then = new Date(isoStr);
  const now = new Date();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return then.toLocaleDateString();
}

/** Format elapsed time since account creation (e.g. "3d", "2mo", "1y") */
function _formatElapsed(isoStr) {
  if (!isoStr) return '0h';
  const then = new Date(isoStr);
  const now = new Date();
  const diffMs = now - then;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}


/** Return usable img src for a profile image value (data URI or legacy path). */
function _profileImgSrc(val, fallback) {
  if (!val) return fallback;
  return val.startsWith('data:') ? val : '/' + val;
}

/** Load profile picture and banner into the welcome banner */
async function _loadWelcomeBannerProfile() {
  try {
    const res = await fetch('/api/profile');
    const data = await res.json();
    if (!data.success) return;

    const p = data.profile;

    // Banner background
    const bannerBg = document.getElementById('welcomeBannerBg');
    if (bannerBg) {
      bannerBg.src = _profileImgSrc(p.banner, '/static/img/default-banner.png');
    }

    // Profile picture
    const pfpImg = document.getElementById('welcomePfpImg');
    if (pfpImg) {
      pfpImg.src = _profileImgSrc(p.profile_picture, '/static/img/default-pfp.png');
    }

    // Also update header avatar
    const headerAvatar = document.querySelector('.header-actions .user-avatar');
    if (headerAvatar && p.profile_picture) {
      const src = _profileImgSrc(p.profile_picture, null);
      const existingImg = headerAvatar.querySelector('img');
      if (existingImg) {
        existingImg.src = src;
      } else {
        headerAvatar.textContent = '';
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Profile';
        headerAvatar.appendChild(img);
      }
    }
  } catch (err) {
    // Silent fail — banner/pfp will use defaults
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format bytes to human-readable file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format date to relative time
 */
function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// RESPONSIVE HANDLING
// ============================================================================

window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  
  // Auto-collapse sidebar on mobile, auto-expand on desktop
  if (window.innerWidth > 1024) {
    sidebar.classList.remove('collapsed');
    sidebar.classList.remove('active');
  } else {
    sidebar.classList.remove('active');
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 MindLobby Studio initialized');
  console.log(`📋 Accepted file types: ${ACCEPTED_EXTENSIONS.join(', ')}`);
  console.log(`📏 Max file size: ${formatFileSize(MAX_FILE_SIZE)}`);
  
  // Initialize upload area if it exists
  initUploadArea();

  // Load saved documents from the server
  loadDocuments();

  // Load dashboard stats and recent activity
  updateDashboardStats();
  
  // Show welcome notification only once per login
  fetch('/check-auth')
    .then(res => res.json())
    .then(data => {
      // Restore server-saved settings into localStorage
      if (data.settings && window.Settings) {
        Settings.loadFromServer(data.settings);
      }
      if (data.show_welcome) {
        setTimeout(() => {
          showNotification('Welcome to your Studio! 🎉', 'success');
        }, 500);
      }
      // Auto-trigger tutorial only on first ever login (tutorial never completed/skipped)
      if (window.Tutorial && Tutorial.shouldShow(data.settings)) {
        setTimeout(() => Tutorial.start(), 800);
      }
    })
    .catch(() => {});
});

// Prevent stale page from showing via back-button after logout.
// 'pageshow' fires even when the page is restored from bfcache.
window.addEventListener('pageshow', function (e) {
  if (e.persisted) {
    fetch('/check-auth').then(r => r.json()).then(function (data) {
      if (!data.authenticated) window.location.replace('/');
    }).catch(function () {});
  }
});

// ============================================================================
// EXPORT FUNCTIONS FOR HTML USAGE
// ============================================================================

// Make functions available globally for onclick handlers in HTML
window.toggleSidebar = toggleSidebar;
window.showView = showView;
window.handleLogout = handleLogout;
window.triggerFileUpload = triggerFileUpload;
// ============================================================================
// DOCUMENT GRID — load from server and render cards
// ============================================================================

/** Escape HTML to prevent XSS in user-provided strings */
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function loadDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    if (data.success) renderSidebarDocList(data.documents);
  } catch (e) {
    console.error('Could not load documents:', e);
  }
}

function renderSidebarDocList(documents) {
  const list = document.getElementById('sidebarDocsList');
  const empty = document.getElementById('sidebarDocsEmpty');
  if (!list) return;

  if (!documents || documents.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.innerHTML = '';

  documents.forEach(doc => {
    // Determine circle color: first topic's color or grey
    let circleColor = '#6b6b8a';
    if (doc.topics && doc.topics.length > 0) {
      circleColor = doc.topics[0].color || circleColor;
    }

    const displayName = _esc(doc.original_filename || doc.filename);
    const escapedName = (doc.original_filename || doc.filename).replace(/'/g, "\\'").replace(/"/g, '&quot;');

    const item = document.createElement('div');
    item.className = 'sidebar-doc-item';
    item.dataset.docId = String(doc.id);
    item.setAttribute('title', doc.original_filename || doc.filename);
    item.onclick = () => {
      if (window.Flashcards) Flashcards.openForDocument(doc.id, doc.original_filename || doc.filename);
    };

    item.innerHTML = `
      <span class="sidebar-doc-circle" style="background: ${circleColor};"></span>
      <span class="sidebar-doc-name">${displayName}</span>
      <span class="sidebar-doc-actions">
        <button class="sidebar-doc-rename" onclick="event.stopPropagation(); openRenameModal('${doc.id}', '${escapedName}')" title="Rename">
          <i class="fas fa-pen"></i>
        </button>
        <button class="sidebar-doc-delete" onclick="event.stopPropagation(); deleteDocument('${doc.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </span>
    `;
    list.appendChild(item);
  });
}

function deleteDocument(docId, btnEl) {
  const backdrop = document.getElementById('confirmBackdrop');
  const modal = document.getElementById('confirmModal');
  const cancelBtn = document.getElementById('confirmCancel');
  const deleteBtn = document.getElementById('confirmDelete');

  if (!backdrop || !modal) return;

  backdrop.classList.add('open');
  modal.classList.add('open');

  function closeModal() {
    backdrop.classList.remove('open');
    modal.classList.remove('open');
    cancelBtn.removeEventListener('click', onCancel);
    deleteBtn.removeEventListener('click', onConfirm);
    backdrop.removeEventListener('click', onCancel);
  }

  function onCancel() {
    closeModal();
  }

  async function onConfirm() {
    closeModal();
    try {
      const res  = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showNotification('Document deleted', 'success');
        loadDocuments();
        if (window.Flashcards && Flashcards.loadDocs) Flashcards.loadDocs();
        if (window.Notes && Notes.loadDocs) Notes.loadDocs();
        if (window.Topics && window.Topics.refreshDetail) window.Topics.refreshDetail();
      } else {
        showNotification(data.message || 'Delete failed', 'error');
      }
    } catch (e) {
      showNotification('Network error deleting document', 'error');
    }
  }

  cancelBtn.addEventListener('click', onCancel);
  deleteBtn.addEventListener('click', onConfirm);
  backdrop.addEventListener('click', onCancel);
}

function openRenameModal(docId, currentName) {
  const backdrop = document.getElementById('renameBackdrop');
  const modal = document.getElementById('renameModal');
  const input = document.getElementById('renameInput');
  const cancelBtn = document.getElementById('renameCancel');
  const saveBtn = document.getElementById('renameSave');

  if (!backdrop || !modal || !input) return;

  // Strip extension for editing, keep it for saving
  const dotIdx = currentName.lastIndexOf('.');
  const nameOnly = dotIdx > 0 ? currentName.substring(0, dotIdx) : currentName;
  const ext = dotIdx > 0 ? currentName.substring(dotIdx) : '';

  input.value = nameOnly;
  backdrop.classList.add('open');
  modal.classList.add('open');
  setTimeout(() => { input.focus(); input.select(); }, 100);

  function closeModal() {
    backdrop.classList.remove('open');
    modal.classList.remove('open');
    cancelBtn.removeEventListener('click', onCancel);
    saveBtn.removeEventListener('click', onSave);
    backdrop.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKeydown);
  }

  function onCancel() { closeModal(); }

  function onKeydown(e) {
    if (e.key === 'Enter') onSave();
    if (e.key === 'Escape') onCancel();
  }

  async function onSave() {
    const newName = input.value.trim();
    if (!newName) {
      showNotification('Name cannot be empty', 'warning');
      return;
    }
    closeModal();
    try {
      const res = await fetch(`/api/documents/${docId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName + ext })
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Document renamed', 'success');
        loadDocuments();
        if (window.Flashcards && Flashcards.loadDocs) Flashcards.loadDocs();
        if (window.Notes && Notes.loadDocs) Notes.loadDocs();
        if (window.Topics && window.Topics.refreshDetail) window.Topics.refreshDetail();
      } else {
        showNotification(data.message || 'Rename failed', 'error');
      }
    } catch (e) {
      showNotification('Network error renaming document', 'error');
    }
  }

  cancelBtn.addEventListener('click', onCancel);
  saveBtn.addEventListener('click', onSave);
  backdrop.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKeydown);
}

window.openRenameModal = openRenameModal;

// ============================================================================
// FILE UPLOAD MODAL - Works with UploadLoading.js
// ============================================================================

let selectedFilesForUpload = [];

function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  const backdrop = document.getElementById('uploadModalBackdrop');
  
  if (modal && backdrop) {
    backdrop.classList.add('open');
    modal.classList.add('open');
    clearSelectedFiles();
  }
}


function closeUploadModal() {
  const modal = document.getElementById('uploadModal');
  const backdrop = document.getElementById('uploadModalBackdrop');

  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');

  // Revert nav active state back to Overview
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === 'overview');
  });

  // DON'T clear files here - let startUpload() handle it after uploading!
}

// Initialize upload modal
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('uploadDropZone');
  const fileInput = document.getElementById('modalFileInput');
  const browseButton = document.getElementById('browseButton');
  
  // Override triggerFileUpload to open Add Material choice modal
  window.triggerFileUpload = function() {
    openAddMaterialModal();
  };
  
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }
  
  if (browseButton) {
    browseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fileInput) fileInput.click();
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleModalFiles(Array.from(e.target.files));
    });
  }
  
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleModalFiles(Array.from(e.dataTransfer.files));
    });
  }
});

function handleModalFiles(files) {
  const validTypes = ['application/pdf', 'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                     'text/plain'];

  const validExtensions = ['.pdf', '.doc', '.docx', '.pptx', '.txt'];
  const maxSize = 10 * 1024 * 1024;
  
  const validFiles = files.filter(file => {
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    const isValidType = validTypes.includes(file.type) || validExtensions.includes(extension);
    const isValidSize = file.size <= maxSize;
    
    if (!isValidType) {
      if (typeof showNotification === 'function') {
        showNotification(`❌ ${file.name}: Invalid file type`, 'error');
      }
      return false;
    }
    
    if (!isValidSize) {
      if (typeof showNotification === 'function') {
        showNotification(`❌ ${file.name}: File too large (max 10MB)`, 'error');
      }
      return false;
    }
    
    return true;
  });
  
  validFiles.forEach(file => {
    const isDuplicate = selectedFilesForUpload.some(f => 
      f.name === file.name && f.size === file.size
    );
    
    if (!isDuplicate && selectedFilesForUpload.length < MAX_FILES_PER_UPLOAD) {
      selectedFilesForUpload.push(file);
    }
  });
  
  updateUploadFilesList();
}

function updateUploadFilesList() {
  const filesList = document.getElementById('uploadFilesList');
  const filesGrid = document.getElementById('uploadFilesGrid');
  const fileCount = document.getElementById('fileCount');
  const uploadButton = document.getElementById('uploadButton');
  const uploadCount = document.getElementById('uploadCount');
  
  if (!selectedFilesForUpload.length) {
    if (filesList) filesList.style.display = 'none';
    if (uploadButton) uploadButton.disabled = true;
    if (uploadCount) uploadCount.textContent = '';
    return;
  }
  
  if (filesList) filesList.style.display = 'block';
  if (fileCount) fileCount.textContent = selectedFilesForUpload.length;
  if (uploadButton) uploadButton.disabled = false;
  if (uploadCount) uploadCount.textContent = `(${selectedFilesForUpload.length})`;
  
  if (filesGrid) {
    filesGrid.innerHTML = selectedFilesForUpload.map((file, index) => {
      const icon = getFileIcon(file.name);
      const size = formatFileSize(file.size);
      
      return `
        <div class="upload-file-item">
          <div class="upload-file-icon">
            <i class="${icon}"></i>
          </div>
          <div class="upload-file-info">
            <div class="upload-file-name">${file.name}</div>
            <div class="upload-file-size">${size}</div>
          </div>
          <button class="upload-file-remove" onclick="removeFileFromUpload(${index})">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }).join('');
  }
}

function removeFileFromUpload(index) {
  selectedFilesForUpload.splice(index, 1);
  updateUploadFilesList();
}

function clearSelectedFiles() {
  selectedFilesForUpload = [];
  updateUploadFilesList();
  
  const fileInput = document.getElementById('modalFileInput');
  if (fileInput) fileInput.value = '';
}


async function startUpload() {
  if (!selectedFilesForUpload.length) return;

  // Close modal
  const modal = document.getElementById('uploadModal');
  const backdrop = document.getElementById('uploadModalBackdrop');
  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');

  // Copy files and clear selection
  const filesToUpload = [...selectedFilesForUpload];
  clearSelectedFiles();

  // Delegate to batch upload queue in UploadLoading.js
  if (typeof window.startBatchUpload === 'function') {
    await window.startBatchUpload(filesToUpload);
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  
  switch(ext) {
    case 'pdf': return 'fas fa-file-pdf';
    case 'doc':
    case 'docx': return 'fas fa-file-word';
    case 'ppt':
    case 'pptx': return 'fas fa-file-powerpoint';
    case 'txt': return 'fas fa-file-alt';
    default: return 'fas fa-file';
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.removeFileFromUpload = removeFileFromUpload;
window.clearSelectedFiles = clearSelectedFiles;
window.startUpload = startUpload;

// ============================================================================
// ADD MATERIAL MODAL
// ============================================================================

function openAddMaterialModal(e) {
  if (e) e.preventDefault();
  const modal    = document.getElementById('amModal');
  const backdrop = document.getElementById('amBackdrop');
  if (modal && backdrop) {
    backdrop.classList.add('open');
    modal.classList.add('open');
  }
}

function closeAddMaterialModal() {
  const modal    = document.getElementById('amModal');
  const backdrop = document.getElementById('amBackdrop');
  if (backdrop) backdrop.classList.remove('open');
  if (modal)    modal.classList.remove('open');
}

// ============================================================================
// YOUTUBE MODAL (placeholder — implementation handed to Claude Code)
// ============================================================================

function openYoutubeModal() {
  const modal    = document.getElementById('ytModal');
  const backdrop = document.getElementById('ytModalBackdrop');
  if (modal && backdrop) {
    backdrop.classList.add('open');
    modal.classList.add('open');
    const input = document.getElementById('ytUrlInput');
    if (input) { input.value = ''; input.focus(); }
    var errEl = document.getElementById('ytErrorMsg');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    // Reset thumbnail preview
    var thumb = document.getElementById('ytThumbnail');
    var title = document.getElementById('ytPreviewTitle');
    if (thumb) thumb.src = '/static/img/no-output.gif';
    if (title) title.textContent = 'Paste a link to preview';
    // Reset slider
    var slider = document.getElementById('ytMaxCards');
    var sliderVal = document.getElementById('ytMaxCardsVal');
    if (slider) slider.value = 30;
    if (sliderVal) sliderVal.textContent = '30';
  }
}

function updateYtPreview(url) {
  var thumb = document.getElementById('ytThumbnail');
  var title = document.getElementById('ytPreviewTitle');
  if (!thumb || !title) return;

  // Try to extract video ID
  var match = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (match && match[1]) {
    var videoId = match[1];
    thumb.src = 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg';
    thumb.onerror = function() { this.src = '/static/img/no-output.gif'; };
    title.textContent = 'Video ID: ' + videoId;
  } else {
    thumb.src = '/static/img/no-output.gif';
    title.textContent = url ? 'Invalid YouTube URL' : 'Paste a link to preview';
  }
}

function closeYoutubeModal() {
  const modal    = document.getElementById('ytModal');
  const backdrop = document.getElementById('ytModalBackdrop');
  if (backdrop) backdrop.classList.remove('open');
  if (modal)    modal.classList.remove('open');
}

async function submitYoutubeUrl() {
  var urlInput = document.getElementById('ytUrlInput');
  var btn = document.getElementById('ytImportBtn');
  var errEl = document.getElementById('ytErrorMsg');
  var url = (urlInput ? urlInput.value : '').trim();
  var maxCards = parseInt(document.getElementById('ytMaxCards')?.value || '30', 10);

  // Hide previous error
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  // Basic client-side validation
  if (!url) {
    if (errEl) { errEl.textContent = 'Please enter a YouTube URL.'; errEl.style.display = 'block'; }
    return;
  }
  if (!/youtube\.com|youtu\.be/i.test(url)) {
    if (errEl) { errEl.textContent = 'Please enter a valid YouTube URL.'; errEl.style.display = 'block'; }
    return;
  }

  // Disable button and show loading
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';

  // Close modal and show YouTube-specific loading overlay
  closeYoutubeModal();

  if (typeof window.showYtLoadingOverlay === 'function') {
    window.showYtLoadingOverlay(url);
  }

  try {
    window._ytAbortController = new AbortController();
    var response = await fetch('/api/youtube/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, max_flashcards: maxCards }),
      signal: window._ytAbortController.signal
    });

    var data = await response.json();

    // Track document_id for cancel cleanup (UploadLoading.js reads this)
    if (data.document_id) window._lastYtDocId = data.document_id;

    if (data.success) {
      if (typeof window.completeYtLoading === 'function') {
        window.completeYtLoading(data);
      }

      // Small delay so completion animation plays
      await new Promise(function(r) { setTimeout(r, 1800); });

      window._lastYtDocId = null; // Upload succeeded, no cleanup needed

      if (typeof window.hideYtLoadingOverlay === 'function') {
        window.hideYtLoadingOverlay();
      }

      // Reload sidebar documents
      if (typeof loadDocuments === 'function') loadDocuments();
      if (typeof updateDashboardStats === 'function') updateDashboardStats();
      if (window.Flashcards && Flashcards.loadDocs) Flashcards.loadDocs();
      if (window.Notes && Notes.loadDocs) Notes.loadDocs();

      // Show topic picker, then auto-open notes
      var _ytDocId = data.document_id;
      var _ytDocName = data.filename || 'YouTube Video';

      if (_ytDocId && typeof window.showTopicPicker === 'function') {
        window.showTopicPicker(_ytDocId, _ytDocName, function () {
          if (window.Notes && Notes.openForDocument) {
            setTimeout(function () {
              if (typeof showView === 'function') showView('notes');
              Notes.openForDocument(_ytDocId, _ytDocName);
            }, 300);
          }
        });
      } else if (_ytDocId && window.Notes && Notes.openForDocument) {
        setTimeout(function () {
          if (typeof showView === 'function') showView('notes');
          Notes.openForDocument(_ytDocId, _ytDocName);
        }, 300);
      }
    } else {
      if (typeof window.hideYtLoadingOverlay === 'function') {
        window.hideYtLoadingOverlay();
      }

      // Reopen modal and show error
      openYoutubeModal();
      if (urlInput) urlInput.value = url; // Restore URL
      updateYtPreview(url);
      if (errEl) { errEl.textContent = data.message || 'Import failed.'; errEl.style.display = 'block'; }
    }
  } catch (error) {
    if (typeof window.hideYtLoadingOverlay === 'function') {
      window.hideYtLoadingOverlay();
    }

    // Don't show error if cancelled by user
    if (error.name !== 'AbortError') {
      openYoutubeModal();
      if (urlInput) urlInput.value = url;
      updateYtPreview(url);
      if (errEl) { errEl.textContent = 'Network error. Please check your connection.'; errEl.style.display = 'block'; }
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-brands fa-youtube"></i> Import Video';
  }
}

window.openAddMaterialModal  = openAddMaterialModal;
window.closeAddMaterialModal = closeAddMaterialModal;
window.openYoutubeModal      = openYoutubeModal;
window.closeYoutubeModal     = closeYoutubeModal;
window.submitYoutubeUrl      = submitYoutubeUrl;
window.updateYtPreview       = updateYtPreview;