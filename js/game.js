// Game Module for "أنا مين؟"
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
  copyToClipboard,
  showLoading,
  hideLoading,
  createModal,
  timeAgo
} from './theme.js';

// Game State
let gameState = {
  roomId: null,
  userId: null,
  username: null,
  isHost: false,
  phase: 'loading', // loading, selection, waiting, countdown, playing, gameover
  currentTurn: null,
  secretPlayer: null,
  secretLocked: false,
  opponentSecret: null,
  winner: null,
  questions: [],
  lastAnswer: null
};

let listeners = [];

// Initialize game
export function initGame() {
  // Get session
  const session = getSession();
  if (!session) {
    window.location.href = '/login';
    return;
  }
  
  gameState.userId = session.userId;
  gameState.username = session.username;
  
  // Get room from URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  
  if (!roomId) {
    window.location.href = '/lobby';
    return;
  }
  
  gameState.roomId = roomId;
  
  // Setup event listeners
  setupEventListeners();
  
  // Load game data
  loadGame();
  
  // Setup logout
  setupLogout();
  
  // Setup theme toggle
  setupThemeToggle();
}

// Setup event listeners
function setupEventListeners() {
  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const { toggleTheme } = import('./theme.js').then(m => {
        m.toggleTheme();
      });
    });
  }
  
  // Secret player input
  const secretInput = document.getElementById('secretInput');
  const confirmSecretBtn = document.getElementById('confirmSecretBtn');
  
  if (confirmSecretBtn) {
    confirmSecretBtn.addEventListener('click', confirmSecretPlayer);
  }
  
  if (secretInput) {
    secretInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmSecretPlayer();
      }
    });
  }
  
  // Question input
  const questionInput = document.getElementById('questionInput');
  const sendQuestionBtn = document.getElementById('sendQuestionBtn');
  
  if (sendQuestionBtn) {
    sendQuestionBtn.addEventListener('click', sendQuestion);
  }
  
  if (questionInput) {
    questionInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendQuestion();
      }
    });
  }
  
  // Guess button
  const guessBtn = document.getElementById('guessBtn');
  if (guessBtn) {
    guessBtn.addEventListener('click', openGuessModal);
  }
  
  // Leave game
  const leaveBtn = document.getElementById('leaveBtn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', leaveGame);
  }
  
  // Report button
  const reportBtn = document.getElementById('reportBtn');
  if (reportBtn) {
    reportBtn.addEventListener('click', openReportModal);
  }
  
  // Play again
  const playAgainBtn = document.getElementById('playAgainBtn');
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
      window.location.href = '/lobby';
    });
  }
  
  // Back to lobby
  const backToLobbyBtn = document.getElementById('backToLobbyBtn');
  if (backToLobbyBtn) {
    backToLobbyBtn.addEventListener('click', () => {
      window.location.href = '/lobby';
    });
  }
}

// Load game data
async function loadGame() {
  showLoading('جاري تحميل اللعبة...');
  
  try {
    const roomRef = ref(database, `rooms/${gameState.roomId}`);
    const gameRef = ref(database, `games/${gameState.roomId}`);
    
    // Get room data
    const roomSnapshot = await get(roomRef);
    
    if (!roomSnapshot.exists()) {
      hideLoading();
      showToast('الغرفة غير موجودة', 'error');
      setTimeout(() => {
        window.location.href = '/lobby';
      }, 2000);
      return;
    }
    
    const roomData = roomSnapshot.val();
    
    // Check if user is part of this game
    if (roomData.hostId !== gameState.userId && roomData.guestId !== gameState.userId) {
      hideLoading();
      showToast('ليس لديك صلاحية الدخول لهذه الغرفة', 'error');
      setTimeout(() => {
        window.location.href = '/lobby';
      }, 2000);
      return;
    }
    
    // Determine if user is host
    gameState.isHost = roomData.hostId === gameState.userId;
    
    // Update UI with player info
    updatePlayerCards(roomData);
    
    // Get game data
    const gameSnapshot = await get(gameRef);
    
    if (gameSnapshot.exists()) {
      const gameData = gameSnapshot.val();
      gameState.phase = gameData.status || 'selection';
      gameState.currentTurn = gameData.currentTurn;
      gameState.questions = gameData.questions || [];
      
      // Get secret player if exists
      const playerSecretRef = ref(database, `games/${gameState.roomId}/players/${gameState.userId}`);
      const playerSecretSnapshot = await get(playerSecretRef);
      
      if (playerSecretSnapshot.exists()) {
        const secretData = playerSecretSnapshot.val();
        gameState.secretPlayer = secretData.secretPlayer;
        gameState.secretLocked = secretData.locked;
      }
      
      // Get opponent's secret if game is over
      const opponentId = gameState.isHost ? roomData.guestId : roomData.hostId;
      if (opponentId) {
        const opponentSecretRef = ref(database, `games/${gameState.roomId}/players/${opponentId}`);
        const opponentSecretSnapshot = await get(opponentSecretRef);
        
        if (opponentSecretSnapshot.exists()) {
          gameState.opponentSecret = opponentSecretSnapshot.val().secretPlayer;
        }
      }
    }
    
    // Setup listeners
    setupGameListeners();
    
    hideLoading();
    
    // Update UI based on phase
    updateUI();
    
  } catch (error) {
    console.error('Error loading game:', error);
    hideLoading();
    showToast('حدث خطأ أثناء تحميل اللعبة', 'error');
  }
}

// Setup game listeners
function setupGameListeners() {
  const gameRef = ref(database, `games/${gameState.roomId}`);
  const roomRef = ref(database, `rooms/${gameState.roomId}`);
  
  // Listen for game updates
  const gameListener = onValue(gameRef, (snapshot) => {
    if (!snapshot.exists()) return;
    
    const gameData = snapshot.val();
    
    // Update game state
    gameState.phase = gameData.status || 'selection';
    gameState.currentTurn = gameData.currentTurn;
    gameState.questions = gameData.questions || [];
    gameState.winner = gameData.winner;
    
    // Check for opponent's secret
    const opponentId = gameState.isHost ? 
      snapshot.child('players').child(gameState.userId === getSession()?.userId ? 
        (ref(database, `rooms/${gameState.roomId}`), 'guestId') : 'hostId') : null;
    
    // Update UI
    updateUI();
    updateChat();
    
    // Handle phase changes
    if (gameState.phase === 'countdown') {
      startCountdown();
    }
    
    if (gameState.phase === 'gameover') {
      handleGameOver(gameData);
    }
  });
  
  // Listen for room updates
  const roomListener = onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      showToast('غادر الخصم اللعبة', 'warning');
      setTimeout(() => {
        window.location.href = '/lobby';
      }, 2000);
    }
  });
  
  listeners.push(gameListener, roomListener);
}

// Update player cards
function updatePlayerCards(roomData) {
  const bluePlayerName = document.getElementById('bluePlayerName');
  const redPlayerName = document.getElementById('redPlayerName');
  
  if (gameState.isHost) {
    bluePlayerName.textContent = roomData.hostName;
    redPlayerName.textContent = roomData.guestName || 'في انتظار اللاعب...';
  } else {
    bluePlayerName.textContent = roomData.hostName;
    redPlayerName.textContent = roomData.guestName || roomData.hostName;
  }
  
  // Update room badge
  const roomBadge = document.getElementById('roomBadge');
  if (roomBadge) {
    roomBadge.textContent = gameState.roomId;
  }
}

// Update UI based on game phase
function updateUI() {
  const selectionPhase = document.getElementById('selectionPhase');
  const waitingPhase = document.getElementById('waitingPhase');
  const countdownPhase = document.getElementById('countdownPhase');
  const gameBoard = document.getElementById('gameBoard');
  const gameOverPhase = document.getElementById('gameOverPhase');
  
  // Hide all phases
  [selectionPhase, waitingPhase, countdownPhase, gameBoard, gameOverPhase].forEach(el => {
    if (el) el.classList.add('hidden');
  });
  
  // Update current player indicator
  updateCurrentPlayerIndicator();
  
  // Show appropriate phase
  switch (gameState.phase) {
    case 'selection':
      if (gameState.secretLocked) {
        showWaitingPhase();
      } else {
        selectionPhase.classList.remove('hidden');
      }
      break;
      
    case 'waiting':
      showWaitingPhase();
      break;
      
    case 'countdown':
      countdownPhase.classList.remove('hidden');
      break;
      
    case 'playing':
      gameBoard.classList.remove('hidden');
      updateChat();
      break;
      
    case 'gameover':
      gameOverPhase.classList.remove('hidden');
      break;
  }
}

// Show waiting phase
function showWaitingPhase() {
  const waitingPhase = document.getElementById('waitingPhase');
  if (waitingPhase) {
    waitingPhase.classList.remove('hidden');
  }
}

// Update current player indicator
function updateCurrentPlayerIndicator() {
  const bluePlayerCard = document.querySelector('.player-card.blue');
  const redPlayerCard = document.querySelector('.player-card.red');
  
  if (bluePlayerCard && redPlayerCard) {
    bluePlayerCard.classList.remove('current');
    redPlayerCard.classList.remove('current');
    
    if (gameState.currentTurn === gameState.userId) {
      if (gameState.isHost) {
        bluePlayerCard.classList.add('current');
      } else {
        redPlayerCard.classList.add('current');
      }
    }
  }
  
  // Update turn indicator in chat
  const turnIndicator = document.getElementById('turnIndicator');
  if (turnIndicator) {
    if (gameState.currentTurn === gameState.userId) {
      turnIndicator.textContent = 'دورك';
      turnIndicator.classList.add('your-turn');
    } else {
      turnIndicator.textContent = 'دور الخصم';
      turnIndicator.classList.remove('your-turn');
    }
  }
  
  // Enable/disable input based on turn
  const questionInput = document.getElementById('questionInput');
  const sendQuestionBtn = document.getElementById('sendQuestionBtn');
  const guessBtn = document.getElementById('guessBtn');
  
  const isMyTurn = gameState.currentTurn === gameState.userId;
  
  if (questionInput) questionInput.disabled = !isMyTurn || gameState.phase !== 'playing';
  if (sendQuestionBtn) sendQuestionBtn.disabled = !isMyTurn || gameState.phase !== 'playing';
  if (guessBtn) guessBtn.disabled = !isMyTurn || gameState.phase !== 'playing';
}

// Confirm secret player
async function confirmSecretPlayer() {
  const secretInput = document.getElementById('secretInput');
  const secretPlayer = secretInput.value.trim();
  
  if (!secretPlayer) {
    showToast('يرجى كتابة اسم اللاعب', 'warning');
    return;
  }
  
  try {
    const playerRef = ref(database, `games/${gameState.roomId}/players/${gameState.userId}`);
    
    await set(playerRef, {
      secretPlayer,
      selectedAt: Date.now(),
      locked: true
    });
    
    gameState.secretPlayer = secretPlayer;
    gameState.secretLocked = true;
    
    showToast('تم اختيار اللاعب السري', 'success');
    
    // Check if both players are ready
    checkBothPlayersReady();
    
  } catch (error) {
    console.error('Error saving secret player:', error);
    showToast('حدث خطأ أثناء حفظ اللاعب السري', 'error');
  }
}

// Check if both players are ready
async function checkBothPlayersReady() {
  const gameRef = ref(database, `games/${gameState.roomId}`);
  const snapshot = await get(gameRef);
  
  if (!snapshot.exists()) {
    // Create game
    await set(gameRef, {
      status: 'waiting',
      createdAt: Date.now(),
      players: {
        [gameState.userId]: {
          secretPlayer: gameState.secretPlayer,
          selectedAt: Date.now(),
          locked: true
        }
      }
    });
  } else {
    // Update players
    await update(gameRef, {
      [`players/${gameState.userId}`]: {
        secretPlayer: gameState.secretPlayer,
        selectedAt: Date.now(),
        locked: true
      }
    });
    
    const gameData = snapshot.val();
    const players = gameData.players || {};
    const playerIds = Object.keys(players);
    
    if (playerIds.length === 2) {
      // Both players ready, start countdown
      const firstPlayer = gameState.isHost ? gameState.userId : playerIds.find(id => id !== gameState.userId);
      
      await update(gameRef, {
        status: 'countdown',
        currentTurn: firstPlayer,
        startedAt: Date.now()
      });
      
      gameState.phase = 'countdown';
      updateUI();
    }
  }
  
  showWaitingPhase();
}

// Start countdown
async function startCountdown() {
  const countdownNumber = document.getElementById('countdownNumber');
  const countdownText = document.getElementById('countdownText');
  
  const countdownRef = ref(database, `games/${gameState.roomId}`);
  
  // Countdown 3, 2, 1
  for (let i = 3; i >= 1; i--) {
    if (countdownNumber) {
      countdownNumber.textContent = i;
      countdownNumber.style.animation = 'none';
      countdownNumber.offsetHeight; // Trigger reflow
      countdownNumber.style.animation = 'countdownPop 1s ease-in-out';
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (countdownText) {
    countdownText.textContent = 'بدأت المباراة!';
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Start playing
  await update(countdownRef, {
    status: 'playing'
  });
  
  gameState.phase = 'playing';
  updateUI();
}

// Send question
async function sendQuestion() {
  const questionInput = document.getElementById('questionInput');
  const question = questionInput.value.trim();
  
  if (!question) {
    showToast('يرجى كتابة سؤال', 'warning');
    return;
  }
  
  if (gameState.currentTurn !== gameState.userId) {
    showToast('ليس دورك بعد', 'warning');
    return;
  }
  
  try {
    const questionsRef = ref(database, `games/${gameState.roomId}/questions`);
    const newQuestionRef = push(questionsRef);
    
    await set(newQuestionRef, {
      askedBy: gameState.userId,
      askedByName: gameState.username,
      question,
      answer: null,
      answeredAt: null,
      timestamp: Date.now(),
      turnNumber: gameState.questions.length + 1
    });
    
    questionInput.value = '';
    
    // Don't change turn yet, wait for answer
    updateChat();
    
  } catch (error) {
    console.error('Error sending question:', error);
    showToast('حدث خطأ أثناء إرسال السؤال', 'error');
  }
}

// Update chat with questions
function updateChat() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  chatMessages.innerHTML = '';
  
  gameState.questions.forEach((q, index) => {
    const isMyQuestion = q.askedBy === gameState.userId;
    
    if (q.question) {
      const questionDiv = document.createElement('div');
      questionDiv.className = `message ${isMyQuestion ? 'answer' : 'question'}`;
      
      if (!isMyQuestion) {
        questionDiv.innerHTML = `
          <div class="message-sender">${q.askedByName} يسأل:</div>
          <div class="message-text">${q.question}</div>
        `;
      } else {
        questionDiv.innerHTML = `
          <div class="message-text">${q.question}</div>
        `;
      }
      
      chatMessages.appendChild(questionDiv);
    }
    
    if (q.answer !== null) {
      const answerDiv = document.createElement('div');
      const isMyAnswer = q.answeredBy === gameState.userId;
      answerDiv.className = `message ${isMyAnswer ? 'question' : 'answer'}`;
      answerDiv.innerHTML = `
        <div class="message-text">${q.answer ? '✓ نعم' : '✕ لا'}</div>
      `;
      chatMessages.appendChild(answerDiv);
      
      // Handle turn change
      if (q.answer === false) {
        // Answer was "No", change turn
        handleTurnChange();
      }
    }
  });
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Add answer buttons if it's my turn to answer
  const lastQuestion = gameState.questions[gameState.questions.length - 1];
  if (lastQuestion && lastQuestion.answer === null && lastQuestion.askedBy !== gameState.userId) {
    showAnswerButtons(lastQuestion);
  } else {
    hideAnswerButtons();
  }
}

// Show answer buttons
function showAnswerButtons(question) {
  let answerButtons = document.getElementById('answerButtons');
  
  if (!answerButtons) {
    answerButtons = document.createElement('div');
    answerButtons.id = 'answerButtons';
    answerButtons.className = 'answer-buttons';
    answerButtons.innerHTML = `
      <button class="answer-btn yes" onclick="window.answerQuestion(true)">✓ نعم</button>
      <button class="answer-btn no" onclick="window.answerQuestion(false)">✕ لا</button>
    `;
    
    const chatArea = document.querySelector('.game-chat');
    if (chatArea) {
      chatArea.appendChild(answerButtons);
    }
  }
  
  answerButtons.classList.remove('hidden');
  window.currentQuestionKey = question.key || question;
}

// Hide answer buttons
function hideAnswerButtons() {
  const answerButtons = document.getElementById('answerButtons');
  if (answerButtons) {
    answerButtons.classList.add('hidden');
  }
}

// Answer question
window.answerQuestion = async function(answer) {
  const questions = gameState.questions;
  const lastQuestion = questions[questions.length - 1];
  
  if (!lastQuestion || lastQuestion.answer !== null) return;
  
  try {
    // Find the question key
    const questionsRef = ref(database, `games/${gameState.roomId}/questions`);
    const snapshot = await get(questionsRef);
    const questionsData = snapshot.val();
    
    let questionKey = null;
    for (const [key, q] of Object.entries(questionsData)) {
      if (q.question === lastQuestion.question && q.askedBy === lastQuestion.askedBy) {
        questionKey = key;
        break;
      }
    }
    
    if (questionKey) {
      await update(ref(database, `games/${gameState.roomId}/questions/${questionKey}`), {
        answer,
        answeredBy: gameState.userId,
        answeredAt: Date.now()
      });
      
      hideAnswerButtons();
      
      // If answer is no, change turn
      if (!answer) {
        const opponentId = gameState.isHost ? 
          (ref(database, `rooms/${gameState.roomId}/guestId`), 'guestId') : 'hostId';
        
        await update(ref(database, `games/${gameState.roomId}`), {
          currentTurn: lastQuestion.askedBy
        });
      }
      
      updateChat();
    }
    
  } catch (error) {
    console.error('Error answering question:', error);
    showToast('حدث خطأ أثناء إرسال الإجابة', 'error');
  }
};

// Handle turn change
async function handleTurnChange() {
  const roomData = await get(ref(database, `rooms/${gameState.roomId}`));
  const opponentId = gameState.isHost ? roomData.val().guestId : roomData.val().hostId;
  
  await update(ref(database, `games/${gameState.roomId}`), {
    currentTurn: opponentId
  });
}

// Open guess modal
function openGuessModal() {
  createModal({
    title: 'خمن اللاعب',
    content: `
      <p style="text-align: center; margin-bottom: 1.5rem; color: var(--text-secondary);">
        من اللاعب الذي تعتقد أن خصمك اختاره؟
      </p>
      <input type="text" id="guessInput" class="guess-input" placeholder="اكتب اسم اللاعب..." />
    `,
    actions: `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button class="btn btn-primary" onclick="submitGuess()">تأكيد التخمين</button>
    `
  });
}

// Submit guess
window.submitGuess = async function() {
  const guessInput = document.getElementById('guessInput');
  const guess = guessInput?.value.trim();
  
  if (!guess) {
    showToast('يرجى كتابة اسم اللاعب', 'warning');
    return;
  }
  
  try {
    // Get opponent's secret
    const roomSnapshot = await get(ref(database, `rooms/${gameState.roomId}`));
    const roomData = roomSnapshot.val();
    const opponentId = gameState.isHost ? roomData.guestId : roomData.hostId;
    
    const opponentSecretSnapshot = await get(ref(database, `games/${gameState.roomId}/players/${opponentId}`));
    const opponentSecret = opponentSecretSnapshot.val()?.secretPlayer;
    
    // Check if guess is correct
    const isCorrect = guess.toLowerCase() === opponentSecret?.toLowerCase();
    
    // Save guess
    const guessesRef = ref(database, `games/${gameState.roomId}/guesses`);
    const newGuessRef = push(guessesRef);
    
    await set(newGuessRef, {
      guessedBy: gameState.userId,
      guessedByName: gameState.username,
      guess,
      isCorrect,
      timestamp: Date.now()
    });
    
    // Close modal
    document.querySelector('.modal-overlay')?.remove();
    
    if (isCorrect) {
      // Winner!
      await endGame(gameState.userId);
      showToast('تخمين صحيح! فزت!', 'success');
    } else {
      // Wrong guess, lose turn
      showToast('تخمين خاطئ! فقدت الدور', 'error');
      
      await update(ref(database, `games/${gameState.roomId}`), {
        currentTurn: opponentId
      });
      
      updateChat();
    }
    
  } catch (error) {
    console.error('Error submitting guess:', error);
    showToast('حدث خطأ أثناء إرسال التخمين', 'error');
  }
};

// End game
async function endGame(winnerId) {
  try {
    const roomSnapshot = await get(ref(database, `rooms/${gameState.roomId}`));
    const roomData = roomSnapshot.val();
    
    const loserId = winnerId === roomData.hostId ? roomData.guestId : roomData.hostId;
    const winnerName = winnerId === roomData.hostId ? roomData.hostName : roomData.guestName;
    
    await update(ref(database, `games/${gameState.roomId}`), {
      status: 'gameover',
      winner: winnerId,
      winnerName,
      finishedAt: Date.now()
    });
    
    await update(ref(database, `rooms/${gameState.roomId}`), {
      status: 'finished'
    });
    
    // Update player stats
    await update(ref(database, `users/${winnerId}`), {
      gamesPlayed: (await get(ref(database, `users/${winnerId}/gamesPlayed`))).val() || 0 + 1,
      wins: (await get(ref(database, `users/${winnerId}/wins`))).val() || 0 + 1
    });
    
    await update(ref(database, `users/${loserId}/gamesPlayed`), {
      gamesPlayed: (await get(ref(database, `users/${loserId}/gamesPlayed`))).val() || 0 + 1
    });
    
    gameState.phase = 'gameover';
    gameState.winner = winnerId;
    updateUI();
    handleGameOver({ winner: winnerId, winnerName });
    
  } catch (error) {
    console.error('Error ending game:', error);
  }
}

// Handle game over
async function handleGameOver(gameData) {
  const gameOverIcon = document.getElementById('gameOverIcon');
  const gameOverTitle = document.getElementById('gameOverTitle');
  const gameOverSubtitle = document.getElementById('gameOverSubtitle');
  const winnerSecret = document.getElementById('winnerSecret');
  const loserSecret = document.getElementById('loserSecret');
  
  if (!gameOverIcon) return;
  
  const isWinner = gameData.winner === gameState.userId;
  
  if (isWinner) {
    gameOverIcon.textContent = '🏆';
    gameOverIcon.classList.remove('loser');
    gameOverTitle.textContent = 'فزت!';
    gameOverTitle.classList.remove('loser');
    gameOverSubtitle.textContent = 'لقد اكتشفت اللاعب السري';
  } else {
    gameOverIcon.textContent = '😢';
    gameOverIcon.classList.add('loser');
    gameOverTitle.textContent = 'خسرت';
    gameOverTitle.classList.add('loser');
    gameOverSubtitle.textContent = 'الخصم اكتشف لاعبك السري';
  }
  
  // Reveal secrets
  const roomSnapshot = await get(ref(database, `rooms/${gameState.roomId}`));
  const roomData = roomSnapshot.val();
  
  if (gameState.isHost) {
    winnerSecret.textContent = roomData.hostName + ' (أنت)';
    loserSecret.textContent = roomData.guestName;
  } else {
    winnerSecret.textContent = roomData.guestName + ' (أنت)';
    loserSecret.textContent = roomData.hostName;
  }
  
  // Show secrets
  const winnerSecretName = document.getElementById('winnerSecretName');
  const loserSecretName = document.getElementById('loserSecretName');
  
  const playersSnapshot = await get(ref(database, `games/${gameState.roomId}/players`));
  const playersData = playersSnapshot.val();
  
  if (gameState.isHost) {
    winnerSecretName.textContent = playersData[roomData.hostId]?.secretPlayer || '-';
    loserSecretName.textContent = playersData[roomData.guestId]?.secretPlayer || '-';
  } else {
    winnerSecretName.textContent = playersData[roomData.guestId]?.secretPlayer || '-';
    loserSecretName.textContent = playersData[roomData.hostId]?.secretPlayer || '-';
  }
}

// Leave game
async function leaveGame() {
  const { close } = createModal({
    title: 'مغادرة اللعبة',
    content: `
      <div class="confirm-message">
        <div class="confirm-icon danger">⚠</div>
        <p class="confirm-text">هل أنت متأكد من مغادرة اللعبة؟</p>
      </div>
    `,
    actions: `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button class="btn btn-danger" onclick="confirmLeaveGame()">مغادرة</button>
    `
  });
  
  window.confirmLeaveGame = async function() {
    try {
      // Remove user from room
      if (gameState.roomId) {
        await remove(ref(database, `rooms/${gameState.roomId}`));
        await remove(ref(database, `games/${gameState.roomId}`));
      }
      
      // Clean up listeners
      listeners.forEach(unsub => unsub());
      
      window.location.href = '/lobby';
    } catch (error) {
      console.error('Error leaving game:', error);
      showToast('حدث خطأ أثناء مغادرة اللعبة', 'error');
    }
  };
}

// Open report modal
function openReportModal() {
  createModal({
    title: 'الإبلاغ عن مشكلة',
    content: `
      <div class="report-options">
        <label class="report-option">
          <input type="radio" name="reportReason" value="cheating" />
          <span>اللاعب غش</span>
        </label>
        <label class="report-option">
          <input type="radio" name="reportReason" value="language" />
          <span>لغة غير لائقة</span>
        </label>
        <label class="report-option">
          <input type="radio" name="reportReason" value="name" />
          <span>اسم غير لائق</span>
        </label>
        <label class="report-option">
          <input type="radio" name="reportReason" value="other" />
          <span>أخرى</span>
        </label>
      </div>
      <textarea id="reportDescription" class="report-textarea" placeholder="اشرح المشكلة..."></textarea>
    `,
    actions: `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
      <button class="btn btn-danger" onclick="submitReport()">إرسال البلاغ</button>
    `
  });
}

// Submit report
window.submitReport = async function() {
  const reason = document.querySelector('input[name="reportReason"]:checked')?.value;
  const description = document.getElementById('reportDescription')?.value.trim();
  
  if (!reason) {
    showToast('يرجى اختيار سبب البلاغ', 'warning');
    return;
  }
  
  try {
    // Get opponent info
    const roomSnapshot = await get(ref(database, `rooms/${gameState.roomId}`));
    const roomData = roomSnapshot.val();
    const opponentId = gameState.isHost ? roomData.guestId : roomData.hostId;
    const opponentName = gameState.isHost ? roomData.guestName : roomData.hostName;
    
    // Create report
    const reportsRef = ref(database, 'reports');
    const newReportRef = push(reportsRef);
    
    await set(newReportRef, {
      reporterId: gameState.userId,
      reporterName: gameState.username,
      reportedPlayerId: opponentId,
      reportedPlayerName: opponentName,
      roomId: gameState.roomId,
      reason,
      description: description || '',
      createdAt: Date.now(),
      status: 'pending'
    });
    
    document.querySelector('.modal-overlay')?.remove();
    showToast('تم إرسال البلاغ بنجاح', 'success');
    
  } catch (error) {
    console.error('Error submitting report:', error);
    showToast('حدث خطأ أثناء إرسال البلاغ', 'error');
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
