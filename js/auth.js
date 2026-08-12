// Authentication Module for "أنا مين؟"
import {
  database,
  ref,
  set,
  get,
  update,
  onValue,
  onDisconnect,
  serverTimestamp
} from './firebase-config.js';

const SESSION_KEY = 'ana_min_session';

// Get current session
export function getSession() {
  const sessionData = localStorage.getItem(SESSION_KEY);
  return sessionData ? JSON.parse(sessionData) : null;
}

// Save session
export function saveSession(userData) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
}

// Clear session
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Check if user is logged in
export function isLoggedIn() {
  return getSession() !== null;
}

// Get current user data
export async function getCurrentUser() {
  const session = getSession();
  if (!session) return null;
  
  try {
    const userRef = ref(database, `users/${session.userId}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      return { userId: session.userId, ...snapshot.val() };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Check if user is banned
export async function checkBanStatus(userId) {
  try {
    const userRef = ref(database, `users/${userId}/blocked`);
    const snapshot = await get(userRef);
    return snapshot.val() === true;
  } catch (error) {
    console.error('Error checking ban status:', error);
    return false;
  }
}

// Register or login user
export async function loginUser(username) {
  try {
    // Check if username is taken
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    
    if (snapshot.exists()) {
      const users = snapshot.val();
      for (const [userId, userData] of Object.entries(users)) {
        if (userData.username.toLowerCase() === username.toLowerCase()) {
          // Check if user is banned
          if (userData.blocked) {
            return { success: false, error: 'banned', userId };
          }
          
          // Update last seen and online status
          const updates = {
            lastSeen: Date.now(),
            online: true
          };
          
          await update(ref(database, `users/${userId}`), updates);
          
          // Set online status with disconnect handler
          const userStatusRef = ref(database, `users/${userId}`);
          onDisconnect(userStatusRef).update({
            online: false,
            lastSeen: Date.now()
          });
          
          const sessionData = {
            userId,
            username: userData.username
          };
          saveSession(sessionData);
          
          return { success: true, userId, username: userData.username };
        }
      }
    }
    
    // Create new user
    const newUserId = generateUserId();
    const newUser = {
      username,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      online: true,
      blocked: false,
      gamesPlayed: 0,
      wins: 0
    };
    
    await set(ref(database, `users/${newUserId}`), newUser);
    
    // Set online status with disconnect handler
    const userStatusRef = ref(database, `users/${newUserId}`);
    onDisconnect(userStatusRef).update({
      online: false,
      lastSeen: Date.now()
    });
    
    const sessionData = {
      userId: newUserId,
      username
    };
    saveSession(sessionData);
    
    return { success: true, userId: newUserId, username };
    
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'حدث خطأ أثناء تسجيل الدخول' };
  }
}

// Logout user
export async function logoutUser() {
  const session = getSession();
  if (session) {
    try {
      // Update online status
      await update(ref(database, `users/${session.userId}`), {
        online: false,
        lastSeen: Date.now()
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  clearSession();
}

// Generate unique user ID
function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Protect route - redirect if not logged in
export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

// Get admin ID (set this to a specific user ID for admin access)
export function getAdminId() {
  return localStorage.getItem('adminId') || null;
}

// Set admin ID
export function setAdminId(userId) {
  localStorage.setItem('adminId', userId);
}

// Check if user is admin
export function isAdmin(userId) {
  const adminId = getAdminId();
  return adminId && userId === adminId;
}
