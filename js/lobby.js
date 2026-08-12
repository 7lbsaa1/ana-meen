// Lobby Module for "أنا مين؟"
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
import { getSession, logoutUser } from './auth.js';
import { 
  showToast, 
  generateRoomCode, 
  copyToClipboard,
  showLoading,
  hideLoading,
  createModal
} from './theme.js';

// DOM Elements
let createRoomBtn, joinRoomInput, joinRoomBtn, backToMenuBtn;
let roomCodeDisplay, roomLinkDisplay, copyCodeBtn, copyLinkBtn, shareBtn;
let waitingSection, menuSection, createSection, joinSection;
let currentRoomId = null;
let roomListener = null;

// Initialize lobby
export function initLobby() {
  // Get DOM elements
  menuSection = document.getElementById('menuSection');
  createSection = document.getElementById('createSection');
  joinSection = document.getElementById('joinSection');
  waitingSection = document.getElementById('waitingSection');
  
  createRoomBtn = document.getElementById('createRoomBtn');
  joinRoomInput = document.getElementById('joinRoomInput');
  joinRoomBtn = document.getElementById('joinRoomBtn');
  backToMenuBtn = document.getElementById('backToMenuBtn');
  
  roomCodeDisplay = document.getElementById('roomCodeDisplay');
  roomLinkDisplay = document.getElementById('roomLinkDisplay');
  copyCodeBtn = document.getElementById('copyCodeBtn');
  copyLinkBtn = document.getElementById('copyLinkBtn');
  shareBtn = document.getElementById('shareBtn');
  
  // Event listeners
  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', handleCreateRoom);
  }
  
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', handleJoinRoom);
  }
  
  if (backToMenuBtn) {
    backToMenuBtn.addEventListener('click', showMenu);
  }
  
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      copyToClipboard(roomCodeDisplay.textContent);
    });
  }
  
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      copyToClipboard(roomLinkDisplay.textContent);
    });
  }
  
  if (shareBtn) {
    shareBtn.addEventListener('click', handleShare);
  }
  
  // Check URL for room code
  checkUrlForRoom();
  
  // Setup logout
  setupLogout();
}

// Check URL for room parameter
function checkUrlForRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  
  if (roomCode) {
    joinRoomInput.value = roomCode;
    showJoinSection();
  }
}

// Setup logout button
function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
      window.location.href = '/login';
    });
  }
}

// Show sections
function showMenu() {
  menuSection.classList.add('active');
  createSection.classList.remove('active');
  joinSection.classList.remove('active');
  waitingSection.classList.remove('active');
  currentRoomId = null;
  
  if (roomListener) {
    roomListener();
    roomListener = null;
  }
  
  // Clean up URL
  window.history.replaceState({}, '', '/lobby');
}

function showCreateSection() {
  menuSection.classList.remove('active');
  createSection.classList.add('active');
  joinSection.classList.remove('active');
  waitingSection.classList.remove('active');
}

function showJoinSection() {
  menuSection.classList.remove('active');
  createSection.classList.remove('active');
  joinSection.classList.add('active');
  waitingSection.classList.remove('active');
}

function showWaitingSection() {
  menuSection.classList.remove('active');
  createSection.classList.remove('active');
  joinSection.classList.remove('active');
  waitingSection.classList.add('active');
}

// Handle create room
async function handleCreateRoom() {
  const session = getSession();
  if (!session) {
    window.location.href = '/login';
    return;
  }
  
  showLoading('جاري إنشاء الغرفة...');
  
  try {
    const roomCode = generateRoomCode();
    const roomRef = ref(database, `rooms/${roomCode}`);
    
    // Check if room code already exists
    const snapshot = await get(roomRef);
    if (snapshot.exists()) {
      // Try again with different code
      hideLoading();
      handleCreateRoom();
      return;
    }
    
    const roomData = {
      hostId: session.userId,
      hostName: session.username,
      guestId: null,
      guestName: null,
      status: 'waiting',
      createdAt: Date.now()
    };
    
    await set(roomRef, roomData);
    
    currentRoomId = roomCode;
    
    // Update UI
    roomCodeDisplay.textContent = roomCode;
    roomLinkDisplay.textContent = `${window.location.origin}/game?room=${roomCode}`;
    
    showCreateSection();
    hideLoading();
    showToast('تم إنشاء الغرفة بنجاح', 'success');
    
    // Listen for guest joining
    listenForGuest(roomCode);
    
  } catch (error) {
    console.error('Error creating room:', error);
    hideLoading();
    showToast('حدث خطأ أثناء إنشاء الغرفة', 'error');
  }
}

// Listen for guest joining
function listenForGuest(roomCode) {
  const roomRef = ref(database, `rooms/${roomCode}`);
  
  roomListener = onValue(roomRef, async (snapshot) => {
    if (!snapshot.exists()) {
      showMenu();
      showToast('تم إلغاء الغرفة', 'warning');
      return;
    }
    
    const roomData = snapshot.val();
    
    if (roomData.guestId && roomData.status === 'ready') {
      // Guest joined, start game
      window.location.href = `/game?room=${roomCode}`;
    }
  });
}

// Handle join room
async function handleJoinRoom() {
  const session = getSession();
  if (!session) {
    window.location.href = '/login';
    return;
  }
  
  const roomCode = joinRoomInput.value.trim().toUpperCase();
  
  if (!roomCode) {
    showToast('يرجى إدخال كود الغرفة', 'warning');
    return;
  }
  
  showLoading('جاري الانضمام للغرفة...');
  
  try {
    const roomRef = ref(database, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) {
      hideLoading();
      showToast('الغرفة غير موجودة', 'error');
      return;
    }
    
    const roomData = snapshot.val();
    
    // Check if room is full
    if (roomData.guestId) {
      hideLoading();
      showToast('الغرفة ممتلئة', 'error');
      return;
    }
    
    // Check if user is already in the room
    if (roomData.hostId === session.userId) {
      // User is host, go to game directly
      window.location.href = `/game?room=${roomCode}`;
      return;
    }
    
    // Join the room
    const updates = {
      guestId: session.userId,
      guestName: session.username,
      status: 'ready'
    };
    
    await update(roomRef, updates);
    
    // Go to game
    window.location.href = `/game?room=${roomCode}`;
    
  } catch (error) {
    console.error('Error joining room:', error);
    hideLoading();
    showToast('حدث خطأ أثناء الانضمام للغرفة', 'error');
  }
}

// Handle share
async function handleShare() {
  const roomCode = roomCodeDisplay.textContent;
  const shareData = {
    title: 'لعبة أنا مين؟',
    text: `انضم إلى لعبتي في "أنا مين؟"! كود الغرفة: ${roomCode}`,
    url: roomLinkDisplay.textContent
  };
  
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error.name !== 'AbortError') {
        copyToClipboard(roomLinkDisplay.textContent);
      }
    }
  } else {
    copyToClipboard(roomLinkDisplay.textContent);
  }
}

// Export for use
export { showMenu, showCreateSection, showJoinSection };
