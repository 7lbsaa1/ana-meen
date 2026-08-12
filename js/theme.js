// Theme Manager for "أنا مين؟"
export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Update toggle button icon
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  }
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      updateThemeIcon(newTheme);
    }
  });
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  updateThemeIcon(newTheme);
  
  return newTheme;
}

function updateThemeIcon(theme) {
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Utility: Show toast notification
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer') || createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${getToastIcon(type)}</span>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function getToastIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  return icons[type] || icons.info;
}

// Add animation for toast removal
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(-20px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Utility: Format time ago
export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  const intervals = [
    { label: 'سنة', seconds: 31536000 },
    { label: 'شهر', seconds: 2592000 },
    { label: 'أسبوع', seconds: 604800 },
    { label: 'يوم', seconds: 86400 },
    { label: 'ساعة', seconds: 3600 },
    { label: 'دقيقة', seconds: 60 },
    { label: 'ثانية', seconds: 1 }
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `منذ ${count} ${interval.label}${count > 1 ? '' : ''}`;
    }
  }
  
  return 'الآن';
}

// Utility: Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('تم النسخ إلى الحافظة', 'success');
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('تم النسخ إلى الحافظة', 'success');
      return true;
    } catch (e) {
      showToast('فشل النسخ', 'error');
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// Utility: Generate random ID
export function generateId(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Utility: Generate room code
export function generateRoomCode() {
  return `AMN-${generateId(5)}`;
}

// Utility: Validate username
export function validateUsername(username) {
  if (!username || username.trim().length < 2) {
    return { valid: false, error: 'الاسم يجب أن يكون حرفين على الأقل' };
  }
  
  if (username.trim().length > 20) {
    return { valid: false, error: 'الاسم يجب ألا يزيد عن 20 حرف' };
  }
  
  // Basic profanity filter
  const blockedWords = ['admin', 'باند', 'حظر', 'blocked'];
  const lowerUsername = username.toLowerCase();
  for (const word of blockedWords) {
    if (lowerUsername.includes(word)) {
      return { valid: false, error: 'هذا الاسم غير مسموح' };
    }
  }
  
  return { valid: true };
}

// Utility: Show loading
export function showLoading(text = 'جاري التحميل...') {
  let overlay = document.getElementById('loadingOverlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="spinner"></div>
      <p style="color: var(--text-secondary); margin-top: 1rem;">${text}</p>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('p').textContent = text;
    overlay.style.display = 'flex';
  }
}

export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Utility: Debounce
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Utility: Format date
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Utility: Get user initials
export function getInitials(name) {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Utility: Create modal
export function createModal(options) {
  const { title, content, actions, onClose } = options;
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modalClose">×</button>
      </div>
      <div class="modal-body">${content}</div>
      ${actions ? `<div class="modal-footer">${actions}</div>` : ''}
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const close = () => {
    overlay.remove();
    if (onClose) onClose();
  };
  
  overlay.querySelector('#modalClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  
  return { overlay, close };
}
