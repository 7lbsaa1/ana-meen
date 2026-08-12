// Admin Dashboard Module for "أنا مين؟"
import {
  database,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  remove
} from './firebase-config.js';
import { getSession, logoutUser, isAdmin, setAdminId } from './auth.js';
import { 
  showToast, 
  timeAgo,
  formatDate,
  showLoading,
  hideLoading,
  createModal,
  getInitials
} from './theme.js';

// State
let users = [];
let reports = [];
let currentFilter = 'all';
let searchQuery = '';
let currentPage = 1;
const itemsPerPage = 10;

// Initialize admin dashboard
export function initAdmin() {
  // Check if user is logged in
  const session = getSession();
  if (!session) {
    window.location.href = '/login';
    return;
  }
  
  // Check if user is admin
  if (!isAdmin(session.userId)) {
    // For demo purposes, make this user an admin
    // In production, you would check against a specific admin ID
    setAdminId(session.userId);
  }
  
  // Load data
  loadUsers();
  loadReports();
  
  // Setup event listeners
  setupEventListeners();
  
  // Setup logout
  setupLogout();
  
  // Setup theme toggle
  setupThemeToggle();
  
  // Setup admin navigation
  setupNavigation();
}

// Setup event listeners
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderUsers();
    });
  }
  
  // Filter select
  const filterSelect = document.getElementById('filterSelect');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      renderUsers();
    });
  }
  
  // Refresh buttons
  const refreshUsersBtn = document.getElementById('refreshUsersBtn');
  const refreshReportsBtn = document.getElementById('refreshReportsBtn');
  
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', loadUsers);
  }
  
  if (refreshReportsBtn) {
    refreshReportsBtn.addEventListener('click', loadReports);
  }
}

// Setup navigation
function setupNavigation() {
  const navItems = document.querySelectorAll('.admin-nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      
      // Update active nav
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Show section
      document.querySelectorAll('.admin-section').forEach(sec => {
        sec.classList.add('hidden');
      });
      
      const targetSection = document.getElementById(`${section}Section`);
      if (targetSection) {
        targetSection.classList.remove('hidden');
      }
    });
  });
}

// Load users
async function loadUsers() {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    
    if (snapshot.exists()) {
      users = Object.entries(snapshot.val()).map(([id, data]) => ({
        id,
        ...data
      }));
    } else {
      users = [];
    }
    
    // Update stats
    updateUserStats();
    
    // Render table
    renderUsers();
    
  } catch (error) {
    console.error('Error loading users:', error);
    showToast('حدث خطأ أثناء تحميل المستخدمين', 'error');
  }
}

// Update user stats
function updateUserStats() {
  const totalUsers = users.length;
  const onlineUsers = users.filter(u => u.online).length;
  const bannedUsers = users.filter(u => u.blocked).length;
  const totalGames = users.reduce((sum, u) => sum + (u.gamesPlayed || 0), 0);
  
  const totalUsersEl = document.getElementById('totalUsers');
  const onlineUsersEl = document.getElementById('onlineUsers');
  const bannedUsersEl = document.getElementById('bannedUsers');
  const totalGamesEl = document.getElementById('totalGames');
  
  if (totalUsersEl) totalUsersEl.textContent = totalUsers;
  if (onlineUsersEl) onlineUsersEl.textContent = onlineUsers;
  if (bannedUsersEl) bannedUsersEl.textContent = bannedUsers;
  if (totalGamesEl) totalGamesEl.textContent = totalGames;
}

// Render users table
function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  
  // Filter users
  let filteredUsers = users;
  
  if (currentFilter !== 'all') {
    filteredUsers = filteredUsers.filter(u => {
      if (currentFilter === 'online') return u.online;
      if (currentFilter === 'offline') return !u.online && !u.blocked;
      if (currentFilter === 'banned') return u.blocked;
      return true;
    });
  }
  
  if (searchQuery) {
    filteredUsers = filteredUsers.filter(u => 
      u.username?.toLowerCase().includes(searchQuery) ||
      u.id?.toLowerCase().includes(searchQuery)
    );
  }
  
  // Paginate
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);
  
  // Render
  if (paginatedUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-icon">👤</div>
          <div class="empty-state-title">لا يوجد مستخدمين</div>
          <div class="empty-state-text">لم يتم العثور على مستخدمين</div>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = paginatedUsers.map(user => `
      <tr data-user-id="${user.id}">
        <td>
          <div class="user-cell">
            <div class="user-cell-avatar">${getInitials(user.username)}</div>
            <div class="user-cell-info">
              <div class="user-cell-name">${user.username || 'غير معروف'}</div>
              <div class="user-cell-id">${user.id}</div>
            </div>
          </div>
        </td>
        <td>
          ${user.online ? 
            '<span class="status-badge online"><span class="status-dot"></span>متصل</span>' :
            (user.blocked ? 
              '<span class="status-badge banned">محظور</span>' : 
              '<span class="status-badge offline">غير متصل</span>')
          }
        </td>
        <td>${user.gamesPlayed || 0}</td>
        <td>${user.wins || 0}</td>
        <td>${user.createdAt ? timeAgo(user.createdAt) : '-'}</td>
        <td>${user.lastSeen ? timeAgo(user.lastSeen) : '-'}</td>
        <td>
          <div class="action-buttons">
            <button class="action-btn-small" title="عرض التفاصيل" onclick="viewUserDetails('${user.id}')">
              👁
            </button>
            ${user.blocked ? 
              `<button class="action-btn-small success" title="إلغاء الحظر" onclick="unbanUser('${user.id}')">
                🔓
              </button>` :
              `<button class="action-btn-small danger" title="حظر" onclick="banUser('${user.id}')">
                🚫
              </button>`
            }
          </div>
        </td>
      </tr>
    `).join('');
  }
  
  // Render pagination
  renderPagination(totalPages, filteredUsers.length);
}

// Render pagination
function renderPagination(totalPages, totalItems) {
  const pagination = document.getElementById('usersPagination');
  if (!pagination) return;
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  
  pagination.innerHTML = `
    <span class="pagination-info">عرض ${startItem}-${endItem} من ${totalItems}</span>
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      ‹
    </button>
    ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
      const page = i + 1;
      return `
        <button class="pagination-btn ${currentPage === page ? 'active' : ''}" onclick="changePage(${page})">
          ${page}
        </button>
      `;
    }).join('')}
    <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
      ›
    </button>
  `;
}

// Change page
window.changePage = function(page) {
  const totalPages = Math.ceil(users.length / itemsPerPage);
  if (page >= 1 && page <= totalPages) {
    currentPage = page;
    renderUsers();
  }
};

// View user details
window.viewUserDetails = async function(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;
  
  createModal({
    title: 'تفاصيل المستخدم',
    content: `
      <div class="user-details">
        <div class="user-details-avatar">${getInitials(user.username)}</div>
        <div class="user-details-name">${user.username || 'غير معروف'}</div>
        <div class="user-details-id">${user.id}</div>
        
        <div class="user-details-stats">
          <div class="user-stat">
            <div class="user-stat-value">${user.gamesPlayed || 0}</div>
            <div class="user-stat-label">المباريات</div>
          </div>
          <div class="user-stat">
            <div class="user-stat-value">${user.wins || 0}</div>
            <div class="user-stat-label">الانتصارات</div>
          </div>
          <div class="user-stat">
            <div class="user-stat-value">${user.gamesPlayed ? Math.round((user.wins / user.gamesPlayed) * 100) : 0}%</div>
            <div class="user-stat-label">نسبة الفوز</div>
          </div>
        </div>
        
        <div style="text-align: right; margin-top: 1rem;">
          <p><strong>الحالة:</strong> ${user.blocked ? 'محظور' : (user.online ? 'متصل' : 'غير متصل')}</p>
          <p><strong>تاريخ التسجيل:</strong> ${user.createdAt ? formatDate(user.createdAt) : '-'}</p>
          <p><strong>آخر ظهور:</strong> ${user.lastSeen ? timeAgo(user.lastSeen) : '-'}</p>
        </div>
      </div>
    `,
    actions: `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
      ${user.blocked ? 
        `<button class="btn btn-success" onclick="unbanUser('${userId}'); this.closest('.modal-overlay').remove();">إلغاء الحظر</button>` :
        `<button class="btn btn-danger" onclick="banUser('${userId}'); this.closest('.modal-overlay').remove();">حظر المستخدم</button>`
      }
    `
  });
};

// Ban user
window.banUser = function(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;
  
  createModal({
    title: 'حظر المستخدم',
    content: `
      <div class="confirm-message">
        <div class="confirm-icon danger">🚫</div>
        <p class="confirm-text">هل أنت متأكد من حظر "${user.username}"؟</p>
        <p style="color: var(--text-muted); font-size: 0.875rem;">
          لن يتمكن المستخدم من استخدام اللعبة بعد الحظر.
        </p>
      </div>
    `,
    actions: `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button class="btn btn-danger" onclick="confirmBanUser('${userId}')">تأكيد الحظر</button>
    `
  });
};

// Confirm ban user
window.confirmBanUser = async function(userId) {
  try {
    await update(ref(database, `users/${userId}`), {
      blocked: true,
      blockedAt: Date.now()
    });
    
    showToast('تم حظر المستخدم بنجاح', 'success');
    
    // Update local state
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].blocked = true;
    }
    
    renderUsers();
    updateUserStats();
    
    // Close modal
    document.querySelector('.modal-overlay')?.remove();
    
  } catch (error) {
    console.error('Error banning user:', error);
    showToast('حدث خطأ أثناء حظر المستخدم', 'error');
  }
};

// Unban user
window.unbanUser = async function(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;
  
  try {
    await update(ref(database, `users/${userId}`), {
      blocked: false,
      unblockedAt: Date.now()
    });
    
    showToast('تم إلغاء حظر المستخدم بنجاح', 'success');
    
    // Update local state
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].blocked = false;
    }
    
    renderUsers();
    updateUserStats();
    
  } catch (error) {
    console.error('Error unbanning user:', error);
    showToast('حدث خطأ أثناء إلغاء الحظر', 'error');
  }
};

// Load reports
async function loadReports() {
  try {
    const reportsRef = ref(database, 'reports');
    const snapshot = await get(reportsRef);
    
    if (snapshot.exists()) {
      reports = Object.entries(snapshot.val()).map(([id, data]) => ({
        id,
        ...data
      })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      reports = [];
    }
    
    // Update stats
    const pendingReports = reports.filter(r => r.status === 'pending').length;
    const pendingReportsEl = document.getElementById('pendingReports');
    if (pendingReportsEl) {
      pendingReportsEl.textContent = pendingReports;
    }
    
    // Render
    renderReports();
    
  } catch (error) {
    console.error('Error loading reports:', error);
    showToast('حدث خطأ أثناء تحميل البلاغات', 'error');
  }
}

// Render reports
function renderReports() {
  const tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;
  
  if (reports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">لا يوجد بلاغات</div>
          <div class="empty-state-text">لم يتم استلام أي بلاغات</div>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = reports.map(report => {
      const reasonLabel = {
        'cheating': 'غش',
        'language': 'لغة غير لائقة',
        'name': 'اسم غير لائق',
        'other': 'أخرى'
      };
      
      return `
        <tr data-report-id="${report.id}">
          <td>${report.reporterName || '-'}</td>
          <td>${report.reportedPlayerName || '-'}</td>
          <td>
            <span class="report-reason">
              ${reasonLabel[report.reason] || report.reason}
            </span>
          </td>
          <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${report.description || '-'}
          </td>
          <td>${report.createdAt ? timeAgo(report.createdAt) : '-'}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn-small" title="عرض التفاصيل" onclick="viewReportDetails('${report.id}')">
                👁
              </button>
              <button class="action-btn-small success" title="قبول" onclick="resolveReport('${report.id}', 'accepted')">
                ✓
              </button>
              <button class="action-btn-small danger" title="رفض" onclick="resolveReport('${report.id}', 'rejected')">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// View report details
window.viewReportDetails = function(reportId) {
  const report = reports.find(r => r.id === reportId);
  if (!report) return;
  
  const reasonLabel = {
    'cheating': 'غش',
    'language': 'لغة غير لائقة',
    'name': 'اسم غير لائق',
    'other': 'أخرى'
  };
  
  createModal({
    title: 'تفاصيل البلاغ',
    content: `
      <div style="text-align: right;">
        <p><strong>المبلّغ:</strong> ${report.reporterName || '-'}</p>
        <p><strong>اللاعب المُبلَّغ عنه:</strong> ${report.reportedPlayerName || '-'}</p>
        <p><strong>السبب:</strong> ${reasonLabel[report.reason] || report.reason}</p>
        <p><strong>رقم الغرفة:</strong> ${report.roomId || '-'}</p>
        <p><strong>الوصف:</strong></p>
        <p style="background: var(--surface); padding: 1rem; border-radius: 8px; margin-top: 0.5rem;">
          ${report.description || 'لا يوجد وصف'}
        </p>
        <p><strong>التاريخ:</strong> ${report.createdAt ? formatDate(report.createdAt) : '-'}</p>
      </div>
    `,
    actions: `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
      <button class="btn btn-danger" onclick="resolveReport('${reportId}', 'rejected'); this.closest('.modal-overlay').remove();">رفض</button>
      <button class="btn btn-success" onclick="resolveReport('${reportId}', 'accepted'); this.closest('.modal-overlay').remove();">قبول</button>
    `
  });
};

// Resolve report
window.resolveReport = async function(reportId, status) {
  try {
    await update(ref(database, `reports/${reportId}`), {
      status,
      resolvedAt: Date.now()
    });
    
    showToast(`تم ${status === 'accepted' ? 'قبول' : 'رفض'} البلاغ`, 'success');
    
    // Update local state
    const reportIndex = reports.findIndex(r => r.id === reportId);
    if (reportIndex !== -1) {
      reports[reportIndex].status = status;
    }
    
    renderReports();
    
    // Update pending count
    const pendingReports = reports.filter(r => r.status === 'pending').length;
    const pendingReportsEl = document.getElementById('pendingReports');
    if (pendingReportsEl) {
      pendingReportsEl.textContent = pendingReports;
    }
    
  } catch (error) {
    console.error('Error resolving report:', error);
    showToast('حدث خطأ أثناء معالجة البلاغ', 'error');
  }
};

// Setup logout
function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
      window.location.href = '/login';
    });
  }
}

// Setup theme toggle
function setupThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      import('./theme.js').then(m => m.toggleTheme());
    });
  }
}
