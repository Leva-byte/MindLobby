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
  
  // Uncomment to load sample documents for testing
  // loadSampleDocuments();
  
  // Show welcome notification
  setTimeout(() => {
    showNotification('Welcome to your Studio! 🎉', 'success');
  }, 500);
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
    card.innerHTML = `
      <div class="doc-header">
        <div class="doc-icon"><i class="fas ${icon}"></i></div>
        <button class="doc-delete-btn" onclick="deleteDocument('${doc.id}', this)" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <span class="doc-type-badge doc-type-${ext}">${ext.toUpperCase()}</span>
      <h3 class="doc-title">${doc.filename}</h3>
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

async function deleteDocument(docId, btnEl) {
  if (!confirm('Delete this document and all its flashcards?')) return;

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

// ============================================================================
// FLASHCARD MODAL STATE
// ============================================================================

let fcCards   = [];
let fcIndex   = 0;
let fcFlipped = false;

function openFlashcardModal(cards, title, subtitle) {
  fcCards   = cards;
  fcIndex   = 0;
  fcFlipped = false;

  document.getElementById('fcModalTitle').textContent    = title    || 'Flashcards';
  document.getElementById('fcModalSubtitle').textContent = subtitle || `${cards.length} cards`;

  renderCurrentCard();

  document.getElementById('fcModalBackdrop').classList.add('open');
  // Small delay so CSS transition fires
  setTimeout(() => document.getElementById('fcModal').classList.add('open'), 10);
}

function closeFlashcardModal() {
  document.getElementById('fcModal').classList.remove('open');
  document.getElementById('fcModalBackdrop').classList.remove('open');
}

function renderCurrentCard() {
  const card = fcCards[fcIndex];
  if (!card) return;

  // Reset flip
  fcFlipped = false;
  document.getElementById('fcCardInner').classList.remove('flipped');

  document.getElementById('fcQuestion').textContent = card.question;
  document.getElementById('fcAnswer').textContent   = card.answer;

  // Progress
  const pct = ((fcIndex + 1) / fcCards.length) * 100;
  document.getElementById('fcProgressFill').style.width = pct + '%';
  document.getElementById('fcProgressLabel').textContent = `${fcIndex + 1} / ${fcCards.length}`;

  // Nav buttons
  document.getElementById('fcPrevBtn').disabled = fcIndex === 0;
  document.getElementById('fcNextBtn').disabled = fcIndex === fcCards.length - 1;
}

function flipCard() {
  fcFlipped = !fcFlipped;
  document.getElementById('fcCardInner').classList.toggle('flipped', fcFlipped);
}

function navigateCard(direction) {
  const next = fcIndex + direction;
  if (next < 0 || next >= fcCards.length) return;
  fcIndex = next;
  renderCurrentCard();
}

function shuffleCards() {
  for (let i = fcCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fcCards[i], fcCards[j]] = [fcCards[j], fcCards[i]];
  }
  fcIndex = 0;
  renderCurrentCard();
  showNotification('Cards shuffled!', 'info');
}

function restartCards() {
  fcIndex   = 0;
  fcFlipped = false;
  renderCurrentCard();
}

// Keyboard navigation
document.addEventListener('keydown', e => {
  const modal = document.getElementById('fcModal');
  if (!modal.classList.contains('open')) return;

  if (e.key === 'ArrowRight') navigateCard(1);
  if (e.key === 'ArrowLeft')  navigateCard(-1);
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
  if (e.key === 'Escape') closeFlashcardModal();
});

// ============================================================================
// OPEN FLASHCARDS FOR AN EXISTING DOCUMENT
// ============================================================================

async function openFlashcardsForDocument(docId, filename) {
  showLoadingOverlay(filename);
  try {
    const res  = await fetch(`/api/flashcards/${docId}`);
    const data = await res.json();
    hideLoadingOverlay();

    if (data.success && data.flashcards.length > 0) {
      openFlashcardModal(data.flashcards, filename, `${data.flashcards.length} flashcards`);
    } else {
      showNotification('No flashcards found for this document.', 'warning');
    }
  } catch (e) {
    hideLoadingOverlay();
    showNotification('Could not load flashcards.', 'error');
  }
}

// ============================================================================
// LOADING OVERLAY HELPERS
// ============================================================================

function showLoadingOverlay(filename) {
  document.getElementById('fcLoadingFile').textContent = filename ? `Processing: ${filename}` : '';
  document.getElementById('fcLoadingOverlay').classList.add('active');
}

function hideLoadingOverlay() {
  document.getElementById('fcLoadingOverlay').classList.remove('active');
}

// ============================================================================
// PATCH handleFileUpload TO SHOW LOADING + OPEN MODAL ON SUCCESS
// ============================================================================

// Override the uploadFile function to show the loading screen and open the
// flashcard modal automatically after a successful upload.
const _originalUploadFile = uploadFile;

window.uploadFile = async function(file) {
  showLoadingOverlay(file.name);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    hideLoadingOverlay();

    if (response.ok && data.success) {
      showNotification(`✅ ${data.flashcards_generated} flashcards created for "${file.name}"!`, 'success');
      loadDocuments();  // refresh document grid

      // Auto-open the flashcard modal
      if (data.flashcards && data.flashcards.length > 0) {
        setTimeout(() => {
          openFlashcardModal(data.flashcards, file.name, `${data.flashcards.length} flashcards generated`);
        }, 600);
      }
      return true;

    } else {
      const msg = data.message || 'Upload failed';
      showNotification(msg, 'error');
      return false;
    }

  } catch (err) {
    hideLoadingOverlay();
    showNotification(`Network error uploading ${file.name}`, 'error');
    return false;
  }
};

// ============================================================================
// LOAD DOCUMENTS ON PAGE READY
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadDocuments();
});

// Expose new globals needed by HTML onclick handlers
window.closeFlashcardModal      = closeFlashcardModal;
window.flipCard                 = flipCard;
window.navigateCard             = navigateCard;
window.shuffleCards             = shuffleCards;
window.restartCards             = restartCards;
window.openFlashcardsForDocument = openFlashcardsForDocument;
window.deleteDocument           = deleteDocument;