const socket = io();

let myRoomCode = null;
let isHost = false;

// --- Screen switching ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
  document.getElementById(id).classList.add('active');
}

// --- Home screen buttons ---
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) {
    showError('home-error', 'Please enter your name first!');
    return;
  }
  socket.emit('createRoom', name);
});

document.getElementById('btn-join').addEventListener('click', () => {
  document.getElementById('join-code-row').classList.remove('hidden');
});

// Fix 1: use { once: true } so this listener only fires one time ever
document.getElementById('btn-join-confirm').addEventListener('click', joinRoom);

function joinRoom() {
  const name = document.getElementById('input-name').value.trim();
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  if (!name) {
    showError('home-error', 'Please enter your name first!');
    return;
  }
  if (code.length !== 6) {
    showError('home-error', 'Room code must be 6 characters.');
    return;
  }
  socket.emit('joinRoom', { code, playerName: name });
}

// --- Socket events ---
socket.on('roomCreated', ({ code, players }) => {
  myRoomCode = code;
  isHost = true;
  document.getElementById('lobby-code').textContent = code;
  updateLobbyPlayers(players);
  showScreen('screen-lobby');
});

// Fix 2: host also listens to lobbyUpdate so they see new players arrive
socket.on('lobbyUpdate', (players) => {
  // If we're not on the lobby screen yet, switch to it
  if (!document.getElementById('screen-lobby').classList.contains('active')) {
    const code = document.getElementById('input-code').value.trim().toUpperCase();
    myRoomCode = code;
    document.getElementById('lobby-code').textContent = code;
    showScreen('screen-lobby');
  }
  updateLobbyPlayers(players);
});

socket.on('joinError', (message) => {
  showError('home-error', message);
  showError('lobby-error', message);
});

socket.on('gameStarting', () => {
  showScreen('screen-game');
});

// --- Start button (host only) ---
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame', myRoomCode);
});

// --- Helpers ---
function updateLobbyPlayers(players) {
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    list.appendChild(li);
  });
  document.getElementById('lobby-count').textContent = players.length;
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}