const socket = io();

let myRoomCode = null;
let isHost = false;
let myId = null;
let myHand = [];
let players = [];
let currentTurn = null;
let sets = {};

// --- Screen switching ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
  document.getElementById(id).classList.add('active');
}

// --- Home screen ---
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { showError('home-error', 'Please enter your name first!'); return; }
  socket.emit('createRoom', name);
});

document.getElementById('btn-join').addEventListener('click', () => {
  document.getElementById('join-code-row').classList.remove('hidden');
  const btn = document.getElementById('btn-join-confirm');
  btn.replaceWith(btn.cloneNode(true));
  document.getElementById('btn-join-confirm').addEventListener('click', joinRoom);
});

function joinRoom() {
  const name = document.getElementById('input-name').value.trim();
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  if (!name) { showError('home-error', 'Please enter your name first!'); return; }
  if (code.length !== 6) { showError('home-error', 'Room code must be 6 characters.'); return; }
  socket.emit('joinRoom', { code, playerName: name });
}

// --- Socket: room created ---
socket.on('roomCreated', ({ code, players: p }) => {
  myRoomCode = code;
  isHost = true;
  myId = socket.id;
  document.getElementById('lobby-code').textContent = code;
  updateLobbyPlayers(p);
  showScreen('screen-lobby');
});

// --- Socket: lobby update ---
socket.on('lobbyUpdate', (p) => {
  if (!document.getElementById('screen-lobby').classList.contains('active')) {
    const code = document.getElementById('input-code').value.trim().toUpperCase();
    myRoomCode = code;
    myId = socket.id;
    document.getElementById('lobby-code').textContent = code;
    showScreen('screen-lobby');
  }
  updateLobbyPlayers(p);
});

// --- Socket: game started ---
socket.on('gameStarted', ({ hand, players: p, currentTurn: ct, sets: s }) => {
  myHand = hand;
  players = p;
  currentTurn = ct;
  sets = s;
  myId = socket.id;
  renderGame();
  showScreen('screen-game');
  document.getElementById('btn-declare-open').addEventListener('click', openDeclareModal);
});

// --- Socket: hand update ---
socket.on('handUpdate', (hand) => {
  myHand = hand;
  renderHand();
});

// --- Socket: turn changed ---
socket.on('turnChanged', (playerId) => {
  currentTurn = playerId;
  renderTurnIndicator();
  renderAskUI();
});

// --- Socket: card transferred ---
socket.on('cardTransferred', ({ card, from, to }) => {
  const fromName = getPlayerName(from);
  const toName = getPlayerName(to);
  addLog(`${toName} got ${formatCard(card)} from ${fromName}`);
});

// --- Socket: card not found ---
socket.on('cardNotFound', ({ card, askerId, targetId }) => {
  const askerName = getPlayerName(askerId);
  const targetName = getPlayerName(targetId);
  addLog(`${askerName} asked ${targetName} for ${formatCard(card)} — not found! ${targetName}'s turn.`);
});

// --- Socket: card burned ---
socket.on('cardBurned', ({ reason, card, from, to }) => {
  const fromName = getPlayerName(from);
  const toName = getPlayerName(to);
  addLog(`🔥 ${fromName} burned ${formatCard(card)} to ${toName} — ${reason}`);
});

// --- Socket: declaration success ---
socket.on('declarationSuccess', ({ setName, team, declaredSets }) => {
  addLog(`✅ Team ${team + 1} declared ${setName} successfully!`);
  renderScore(declaredSets);
});

// --- Socket: declaration failed ---
socket.on('declarationFailed', ({ setName, reason, penaltyTeam }) => {
  addLog(`❌ Declaration of ${setName} failed! (${reason}) — Team ${penaltyTeam + 1} gets the set.`);
});

// --- Socket: game over ---
socket.on('gameOver', ({ winningTeam }) => {
  document.getElementById('game-over-msg').textContent =
    `Team ${winningTeam + 1} wins the game!`;
  document.getElementById('screen-game-over').classList.remove('hidden');
});

// --- Socket: errors ---
socket.on('joinError', (msg) => { showError('home-error', msg); });
socket.on('gameError', (msg) => { addLog(`⚠️ ${msg}`); });

// --- Start button ---
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame', myRoomCode);
});

// --- Render everything ---
function renderGame() {
  const me = players.find(p => p.id === myId);
  document.getElementById('player-name-header').textContent = me ? me.name : '';
  renderHand();
  renderTurnIndicator();
  renderAskUI();
  renderScore({ 0: [], 1: [] });
  renderPlayers();
}

function renderHand() {
  const container = document.getElementById('my-hand');
  container.innerHTML = '';

  // Define set order for sorting
  const SET_ORDER = [
    'lowSpades', 'lowHearts', 'lowDiamonds', 'lowClubs',
  'highSpades', 'highHearts', 'highDiamonds', 'highClubs',
  'eightsJokers'
  ];

  const sorted = [...myHand].sort((a, b) => {
    const setA = SET_ORDER.indexOf(getCardSet(a));
    const setB = SET_ORDER.indexOf(getCardSet(b));
    if (setA !== setB) return setA - setB;
    // Within a set, sort by card order
    const setCards = getSetCards(getCardSet(a));
    return setCards.indexOf(a) - setCards.indexOf(b);
  });

  sorted.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card';
    if (isRedCard(card)) div.classList.add('red-card');
    div.textContent = formatCard(card);
    container.appendChild(div);
  });
}

function getCardSet(card) {
  for (const [key, val] of Object.entries(sets)) {
    if (val.cards.includes(card)) return key;
  }
  return null;
}

function getSetCards(setKey) {
  return sets[setKey] ? sets[setKey].cards : [];
}

function isRedCard(card) {
  return card.endsWith('H') || card.endsWith('D');
}


function renderTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (currentTurn === myId) {
    el.textContent = "It's your turn!";
    el.className = 'my-turn';
  } else {
    el.textContent = `Waiting for ${getPlayerName(currentTurn)}...`;
    el.className = 'other-turn';
  }
}

function renderPlayers() {
  const container = document.getElementById('player-list');
  container.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = `player-tag team-${p.team}`;
    div.textContent = `${p.name} (Team ${p.team + 1})`;
    container.appendChild(div);
  });
}

function renderAskUI() {
  const container = document.getElementById('ask-ui');
  container.innerHTML = '';
  if (currentTurn !== myId) return;

  // Pick a player to ask (opposing team only)
  const me = players.find(p => p.id === myId);
  const opponents = players.filter(p => p.team !== me.team);

  const targetLabel = document.createElement('label');
  targetLabel.textContent = 'Ask player:';
  const targetSelect = document.createElement('select');
  targetSelect.id = 'select-target';
  opponents.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    targetSelect.appendChild(opt);
  });

  // Pick a card to ask for
  const cardLabel = document.createElement('label');
  cardLabel.textContent = 'Ask for card:';
  const cardInput = document.createElement('input');
  cardInput.id = 'input-card';
  cardInput.placeholder = 'e.g. 8 of hearts, AS, ten spades';
  cardInput.type = 'text';

  const askBtn = document.createElement('button');
  askBtn.textContent = 'Ask';
  askBtn.addEventListener('click', () => {
    const targetId = targetSelect.value;
    const raw = cardInput.value.trim();
    const card = parseCard(raw);
    if (!card) {
      addLog(`⚠️ Couldn't understand "${raw}". Try "8H", "8 of hearts", or "eight hearts".`);
      return;
    }
    socket.emit('askCard', { code: myRoomCode, targetId, card });
    cardInput.value = '';
  });

  container.appendChild(targetLabel);
  container.appendChild(targetSelect);
  container.appendChild(cardLabel);
  container.appendChild(cardInput);
  container.appendChild(askBtn);

}

function openDeclareModal() {
  const modal = document.getElementById('declare-modal');
  const form = document.getElementById('declare-form');
  form.innerHTML = '';

  // Set picker
  const setLabel = document.createElement('label');
  setLabel.textContent = 'Which set?';
  const setSelect = document.createElement('select');
  setSelect.id = 'select-set';
  Object.entries(sets).forEach(([key, val]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = val.name;
    setSelect.appendChild(opt);
  });
  form.appendChild(setLabel);
  form.appendChild(setSelect);

  // Card assignments
  const me = players.find(p => p.id === myId);
  const teammates = players.filter(p => p.team === me.team);

  const assignLabel = document.createElement('p');
  assignLabel.textContent = 'Assign each card to a teammate:';
  form.appendChild(assignLabel);

  function renderCardAssignments() {
    document.querySelectorAll('.card-assign').forEach(el => el.remove());
    const selectedSet = sets[setSelect.value];
    selectedSet.cards.forEach(card => {
      const row = document.createElement('div');
      row.className = 'card-assign';
      const lbl = document.createElement('label');
      lbl.textContent = formatCard(card);
      const sel = document.createElement('select');
      sel.dataset.card = card;
      teammates.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
      row.appendChild(lbl);
      row.appendChild(sel);
      form.appendChild(row);
    });
  }

  setSelect.addEventListener('change', renderCardAssignments);
  renderCardAssignments();

  modal.classList.remove('hidden');
}

document.getElementById('btn-declare-confirm').addEventListener('click', () => {
  const setKey = document.getElementById('select-set').value;
  const cardAssignments = {};
  document.querySelectorAll('.card-assign select').forEach(sel => {
    cardAssignments[sel.dataset.card] = sel.value;
  });
  socket.emit('declare', { code: myRoomCode, setKey, cardAssignments });
  document.getElementById('declare-modal').classList.add('hidden');
});

document.getElementById('btn-declare-cancel').addEventListener('click', () => {
  document.getElementById('declare-modal').classList.add('hidden');
});

function renderScore(declaredSets) {
  document.getElementById('score').textContent =
    `Team 1: ${declaredSets[0].length} sets | Team 2: ${declaredSets[1].length} sets`;
}

// --- Helpers ---
function getPlayerName(id) {
  const p = players.find(p => p.id === id);
  return p ? p.name : 'Unknown';
}

function formatCard(card) {
  if (card === 'JOKERG') return '🃏 Goth Joker';
  if (card === 'JOKERQ') return '🃏 Gay Joker';
  const suits = { S: '♠', H: '♥', C: '♣', D: '♦' };
  const suit = suits[card[card.length - 1]];
  const rank = card.slice(0, -1);
  return `${rank}${suit}`;
}
function parseCard(input) {
  if (!input) return null;
  const raw = input.trim().toLowerCase()
    .replace(/of/g, '')
    .replace(/\s+/g, '');

  // Jokers
  if (raw.includes('goth') || raw.includes('jokerg') || raw === 'gj') return 'JOKERG';
  if (raw.includes('gay') || raw.includes('jokerq') || raw === 'qj') return 'JOKERQ';
  if (raw.includes('joker')) return null; // ambiguous joker

  // Ranks
  const rankMap = {
    'a': 'A', 'ace': 'A',
    'k': 'K', 'king': 'K',
    'q': 'Q', 'queen': 'Q',
    'j': 'J', 'jack': 'J',
    '10': '10', 'ten': '10',
    '9': '9', 'nine': '9',
    '8': '8', 'eight': '8',
    '7': '7', 'seven': '7',
    '6': '6', 'six': '6',
    '5': '5', 'five': '5',
    '4': '4', 'four': '4',
    '3': '3', 'three': '3',
    '2': '2', 'two': '2',
  };

  // Suits
  const suitMap = {
    's': 'S', 'spade': 'S', 'spades': 'S',
    'h': 'H', 'heart': 'H', 'hearts': 'H',
    'c': 'C', 'club': 'C', 'clubs': 'C',
    'd': 'D', 'diamond': 'D', 'diamonds': 'D',
  };

  // Try to extract rank and suit from the raw string
  let rank = null;
  let suit = null;

  // Check for rank first (longest match wins)
  const rankKeys = Object.keys(rankMap).sort((a, b) => b.length - a.length);
  for (const key of rankKeys) {
    if (raw.startsWith(key)) {
      rank = rankMap[key];
      const rest = raw.slice(key.length);
      // Now find suit in remainder
      const suitKeys = Object.keys(suitMap).sort((a, b) => b.length - a.length);
      for (const sk of suitKeys) {
        if (rest.includes(sk)) {
          suit = suitMap[sk];
          break;
        }
      }
      break;
    }
  }

  // If rank-first didn't work, try suit-first
  if (!rank || !suit) {
    const suitKeys = Object.keys(suitMap).sort((a, b) => b.length - a.length);
    for (const sk of suitKeys) {
      if (raw.endsWith(sk)) {
        suit = suitMap[sk];
        const rest = raw.slice(0, raw.length - sk.length);
        const rankKeys2 = Object.keys(rankMap).sort((a, b) => b.length - a.length);
        for (const rk of rankKeys2) {
          if (rest.includes(rk)) {
            rank = rankMap[rk];
            break;
          }
        }
        break;
      }
    }
  }

  if (!rank || !suit) return null;
  return `${rank}${suit}`;
}

function addLog(message) {
  const log = document.getElementById('game-log');
  log.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = message;
  log.appendChild(p);
}


function updateLobbyPlayers(p) {
  players = p;
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  p.forEach(player => {
    const li = document.createElement('li');
    li.textContent = player.name;
    list.appendChild(li);
  });
  document.getElementById('lobby-count').textContent = p.length;
  if (isHost && p.length === 6) {
    document.getElementById('btn-start').classList.remove('hidden');
  }
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
}