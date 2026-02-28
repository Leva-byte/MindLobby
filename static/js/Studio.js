// ============================================================================
// MINDLOBBY STUDIO - COMPLETE DASHBOARD JAVASCRIPT
// ============================================================================

// ============================================================================
// GLOBAL CONSTANTS & CONFIGURATION
// ============================================================================

// Allowed file types - STRICTLY ENFORCED (PDF, DOC, DOCX, PPT, PPTX, TXT)
const ALLOWED_FILE_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt'
};

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES_PER_UPLOAD = 10; // Maximum files in one batch

// ============================================================================
// SIDEBAR NAVIGATION
// ============================================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('active');
  
  // For mobile: close sidebar when clicking outside
  if (window.innerWidth <= 1024) {
    if (sidebar.classList.contains('active')) {
      document.addEventListener('click', closeSidebarOnClickOutside);
    } else {
      document.removeEventListener('click', closeSidebarOnClickOutside);
    }
  }
}

function closeSidebarOnClickOutside(e) {
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.querySelector('.btn-menu-toggle');
  
  if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
    sidebar.classList.remove('active');
    document.removeEventListener('click', closeSidebarOnClickOutside);
  }
}

// Handle navigation item clicks
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Get view name
      const view = item.getAttribute('data-view');
      showView(view);
      
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
  
  // Update active nav item
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Handle specific views
  switch(viewName) {
    case 'upload':
      // Scroll to My Documents section
      scrollToMyDocuments();
      break;
    
    case 'overview':
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
  }
}

/**
 * Scroll to the My Documents section
 */
function scrollToMyDocuments() {
  // Find the My Documents section by its title
  const sections = document.querySelectorAll('.section');
  let documentsSection = null;
  
  sections.forEach(section => {
    const title = section.querySelector('.section-title');
    if (title && title.textContent.trim() === 'My Documents') {
      documentsSection = section;
    }
  });
  
  if (documentsSection) {
    // Scroll to the section with smooth animation
    documentsSection.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
    
    // Add a subtle highlight animation
    documentsSection.style.transition = 'background-color 0.5s ease';
    documentsSection.style.backgroundColor = 'rgba(124, 119, 198, 0.1)';
    
    setTimeout(() => {
      documentsSection.style.backgroundColor = 'transparent';
    }, 1500);
    
  }
}

// ============================================================================
// LOGOUT FUNCTIONALITY
// ============================================================================

async function handleLogout(e) {
  e.preventDefault();
  
  try {
    const response = await fetch('/api/logout', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showNotification('Logging out...', 'success');
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    }
  } catch (error) {
    console.error('Logout error:', error);
    showNotification('Error logging out', 'error');
  }
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
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 90px;
    right: 20px;
    background: rgba(26, 26, 62, 0.95);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
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
    '.ppt': 'PowerPoint Presentation',
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
 * Update dashboard statistics after upload
 */
function updateDashboardStats() {
  // This function would fetch and update the stats displayed on the dashboard
  // For now, it's a placeholder for future implementation
  console.log('📊 Updating dashboard statistics...');
  
  // TODO: Fetch updated stats from server
  // fetch('/api/stats')
  //   .then(res => res.json())
  //   .then(data => {
  //     Update stat values in the UI
  //   });
}

// ============================================================================
// MY DOCUMENTS SECTION — DRAG & DROP
// ============================================================================

/**
 * Initialises drag-and-drop directly on the My Documents section.
 * Dropping files here behaves exactly like using the upload button.
 */
function initDocumentsDropZone() {
  const dropZone = document.getElementById('documentsDropZone');
  if (!dropZone) return;

  // Track drag-enter depth so leaving a child element doesn't kill the highlight
  let dragDepth = 0;

  // Stop browser default for all drag events on the zone
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  // Show overlay when something is dragged into the zone
  dropZone.addEventListener('dragenter', () => {
    dragDepth++;
    dropZone.classList.add('drag-active');
  });

  // Keep overlay visible while hovering over children
  dropZone.addEventListener('dragover', e => {
    e.dataTransfer.dropEffect = 'copy';
  });

  // Only remove overlay when cursor truly leaves the zone
  dropZone.addEventListener('dragleave', () => {
    dragDepth--;
    if (dragDepth === 0) {
      dropZone.classList.remove('drag-active');
    }
  });

  // Handle the actual drop
  dropZone.addEventListener('drop', e => {
    dragDepth = 0;
    dropZone.classList.remove('drag-active');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  });
}

// ============================================================================
// SAMPLE DOCUMENT DATA (for testing UI)
// ============================================================================

function loadSampleDocuments() {
  const documentsGrid = document.getElementById('documentsGrid');
  
  if (!documentsGrid) return;
  
  // Sample data
  const documents = [
    {
      id: 1,
      title: 'Introduction to Python',
      type: 'pdf',
      size: '2.4 MB',
      date: '2 days ago',
      flashcards: 24
    },
    {
      id: 2,
      title: 'Data Structures Notes',
      type: 'docx',
      size: '1.8 MB',
      date: '1 week ago',
      flashcards: 18
    },
    {
      id: 3,
      title: 'Algorithm Analysis',
      type: 'pdf',
      size: '3.1 MB',
      date: '2 weeks ago',
      flashcards: 32
    }
  ];
  
  // Clear existing content
  documentsGrid.innerHTML = '';
  
  // Create document cards
  documents.forEach(doc => {
    const card = createDocumentCard(doc);
    documentsGrid.appendChild(card);
  });
}

function createDocumentCard(doc) {
  const card = document.createElement('div');
  card.className = 'document-card';
  
  const iconMap = {
    pdf: 'fa-file-pdf',
    doc: 'fa-file-word',
    docx: 'fa-file-word',
    ppt: 'fa-file-powerpoint',
    pptx: 'fa-file-powerpoint',
    txt: 'fa-file-alt'
  };
  
  card.innerHTML = `
    <div class="doc-header">
      <div class="doc-icon">
        <i class="fas ${iconMap[doc.type] || 'fa-file'}"></i>
      </div>
      <button class="doc-menu">
        <i class="fas fa-ellipsis-v"></i>
      </button>
    </div>
    <h3 class="doc-title">${doc.title}</h3>
    <div class="doc-meta">
      <span class="doc-meta-item">
        <i class="fas fa-layer-group"></i>
        ${doc.flashcards} cards
      </span>
      <span class="doc-meta-item">
        <i class="fas fa-clock"></i>
        ${doc.date}
      </span>
    </div>
  `;
  
  return card;
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
  
  // Initialize drag-and-drop on My Documents section
  initDocumentsDropZone();

  // Load saved documents from the server
  loadDocuments();
  
  // Show welcome notification only once per login
  fetch('/check-auth')
    .then(res => res.json())
    .then(data => {
      if (data.show_welcome) {
        setTimeout(() => {
          showNotification('Welcome to your Studio! 🎉', 'success');
        }, 500);
      }
    })
    .catch(() => {});
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

async function loadDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    if (data.success) renderDocumentGrid(data.documents);
  } catch (e) {
    console.error('Could not load documents:', e);
  }
}

function renderDocumentGrid(documents) {
  const grid      = document.getElementById('documentsGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  if (!documents || documents.length === 0) {
    grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = '';

  const iconMap = {
    pdf:  'fa-file-pdf',
    doc:  'fa-file-word',
    docx: 'fa-file-word',
    ppt:  'fa-file-powerpoint',
    pptx: 'fa-file-powerpoint',
    txt:  'fa-file-alt'
  };

  documents.forEach(doc => {
    const ext  = doc.file_type || 'txt';
    const icon = iconMap[ext] || 'fa-file';
    const date = new Date(doc.upload_date).toLocaleDateString();

    const card = document.createElement('div');
    card.className = 'document-card';
    const escapedName = (doc.original_filename || doc.filename).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    card.innerHTML = `
      <div class="doc-header">
        <div class="doc-icon"><i class="fas ${icon}"></i></div>
        <div class="doc-actions">
          <button class="doc-rename-btn" onclick="openRenameModal('${doc.id}', '${escapedName}')" title="Rename">
            <i class="fas fa-pen"></i>
          </button>
          <button class="doc-delete-btn" onclick="deleteDocument('${doc.id}', this)" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <span class="doc-type-badge doc-type-${ext}">${ext.toUpperCase()}</span>
      <h3 class="doc-title">${doc.original_filename || doc.filename}</h3>
      <div class="doc-meta">
        <span class="doc-meta-item"><i class="fas fa-layer-group"></i> ${doc.flashcard_count} cards</span>
        <span class="doc-meta-item"><i class="fas fa-calendar"></i> ${date}</span>
      </div>
      <button class="doc-study-btn" onclick="openFlashcardsForDocument('${doc.id}', '${doc.filename}')">
        <i class="fas fa-layer-group"></i> Study Flashcards
      </button>
    `;
    grid.appendChild(card);
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
// FILE UPLOAD MODAL - Works with FINAL_FIXED_LOADING.js
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
  
  // DON'T clear files here - let startUpload() handle it after uploading!
}

// Initialize upload modal
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('uploadDropZone');
  const fileInput = document.getElementById('modalFileInput');
  const browseButton = document.getElementById('browseButton');
  
  // Override triggerFileUpload to open modal
  window.triggerFileUpload = function() {
    openUploadModal();
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
                     'application/vnd.ms-powerpoint',
                     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                     'text/plain'];
  
  const validExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'];
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
    
    if (!isDuplicate && selectedFilesForUpload.length < 10) {
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
  console.log('🔵 startUpload() called');
  console.log('🔵 selectedFilesForUpload:', selectedFilesForUpload);
  
  if (!selectedFilesForUpload.length) {
    console.log('⚠️ No files selected!');
    return;
  }
  
  console.log('🔵 Files count:', selectedFilesForUpload.length);
  
  // Close modal FIRST (but don't clear files yet)
  const modal = document.getElementById('uploadModal');
  const backdrop = document.getElementById('uploadModalBackdrop');
  if (backdrop) backdrop.classList.remove('open');
  if (modal) modal.classList.remove('open');
  
  console.log('🔵 Checking window.uploadFile:', typeof window.uploadFile);
  
  // Now upload the files
  for (const file of selectedFilesForUpload) {
    console.log('🔵 Processing file:', file.name);
    
    if (typeof window.uploadFile === 'function') {
      console.log('✅ Calling window.uploadFile for:', file.name);
      await window.uploadFile(file);
      console.log('✅ Completed for:', file.name);
    } else {
      console.error('❌ window.uploadFile is NOT a function!', typeof window.uploadFile);
    }
  }
  
  // AFTER uploading, clear the files
  console.log('🔵 Clearing selected files...');
  clearSelectedFiles();
  console.log('✅ startUpload() completed');
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