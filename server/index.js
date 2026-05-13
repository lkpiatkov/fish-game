const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  SETS,
  getSetForCard,
  dealCards,
  validateAsk,
  checkDeclaration,
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  // --- Create room ---
  socket.on('createRoom', (playerName) => {
    let code = generateRoomCode();
    while (rooms[code]) code = generateRoomCode();

    rooms[code] = {
      players: [{ id: socket.id, name: playerName, team: null }],
      started: false,
      host: socket.id,
      hands: {},
      declaredSets: { 0: [], 1: [] },
      currentTurn: null,
    };

    socket.join(code);
    socket.emit('roomCreated', { code, players: rooms[code].players });
    console.log(`Room ${code} created by ${playerName}`);
  });

  // --- Join room ---
  socket.on('joinRoom', ({ code, playerName }) => {
    const room = rooms[code];
    if (!room) { socket.emit('joinError', 'Room not found. Check your code!'); return; }
    if (room.started) { socket.emit('joinError', 'That game has already started.'); return; }
    if (room.players.length >= 6) { socket.emit('joinError', 'That room is full (6 players max).'); return; }

    const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (nameExists) { socket.emit('joinError', `The name "${playerName}" is already taken!`); return; }

    room.players.push({ id: socket.id, name: playerName, team: null });
    socket.join(code);
    io.to(code).emit('lobbyUpdate', room.players);
    console.log(`${playerName} joined room ${code}`);
  });

  // --- Start game ---
  socket.on('startGame', (code) => {
    const room = rooms[code];
    if (!room) return;
    if (socket.id !== room.host) { socket.emit('joinError', 'Only the host can start the game.'); return; }
    if (room.players.length !== 6) { socket.emit('joinError', 'Need exactly 6 players to start.'); return; }

    // Assign teams: first 3 players = team 0, last 3 = team 1
    room.players.forEach((p, i) => { p.team = i < 3 ? 0 : 1; });

    // Deal cards
    room.hands = dealCards(room.players);

    // Randomly pick who goes first
    room.currentTurn = room.players[Math.floor(Math.random() * 6)].id;
    room.started = true;

    // Send each player only their own hand
    room.players.forEach(p => {
      io.to(p.id).emit('gameStarted', {
        hand: room.hands[p.id],
        players: room.players,
        currentTurn: room.currentTurn,
        sets: SETS,
      });
    });

    console.log(`Game started in room ${code}. First turn: ${room.players.find(p => p.id === room.currentTurn).name}`);
  });

  // --- Ask for a card ---
  socket.on('askCard', ({ code, targetId, card }) => {
    const room = rooms[code];
    if (!room || !room.started) return;
    if (socket.id !== room.currentTurn) {
      socket.emit('gameError', "It's not your turn!");
      return;
    }

    const askerHand = room.hands[socket.id];
    const validation = validateAsk(askerHand, card);

    if (!validation.valid) {
      if (validation.reason === 'burn_self') {
        // Asked for a card they already have — burn it to the target
        askerHand.splice(askerHand.indexOf(card), 1);
        room.hands[targetId].push(card);
        io.to(code).emit('cardBurned', {
          reason: 'Asked for a card they already had',
          card,
          from: socket.id,
          to: targetId,
        });
      } else if (validation.reason === 'burn_wrong_set') {
        // Asked outside their sets — burn a random card to the target
        const burnCard = askerHand.splice(Math.floor(Math.random() * askerHand.length), 1)[0];
        room.hands[targetId].push(burnCard);
        io.to(code).emit('cardBurned', {
          reason: 'Asked outside their sets',
          card: burnCard,
          from: socket.id,
          to: targetId,
        });
      }
      // Turn passes to the target after a burn
      room.currentTurn = targetId;
      io.to(code).emit('turnChanged', room.currentTurn);
      sendHandUpdates(room, code);
      return;
    }

    const targetHand = room.hands[targetId];
    if (targetHand.includes(card)) {
      // Target has the card — transfer it
      targetHand.splice(targetHand.indexOf(card), 1);
      askerHand.push(card);
      io.to(code).emit('cardTransferred', {
        card,
        from: targetId,
        to: socket.id,
      });
      // Asker keeps their turn
      sendHandUpdates(room, code);
    } else {
      // Target doesn't have it — turn passes to target
      io.to(code).emit('cardNotFound', { card, askerId: socket.id, targetId });
      room.currentTurn = targetId;
      io.to(code).emit('turnChanged', room.currentTurn);
    }
  });

  // --- Declaration ---
  socket.on('declare', ({ code, setKey, cardAssignments }) => {
    const room = rooms[code];
    if (!room || !room.started) return;

    const declarer = room.players.find(p => p.id === socket.id);
    const result = checkDeclaration(setKey, cardAssignments, room.hands);

    if (result.valid) {
      // Remove declared cards from hands
      const setCards = SETS[setKey].cards;
      setCards.forEach(card => {
        const ownerId = cardAssignments[card];
        room.hands[ownerId] = room.hands[ownerId].filter(c => c !== card);
      });

      // Award set to declarer's team
      room.declaredSets[declarer.team].push(setKey);

      io.to(code).emit('declarationSuccess', {
        setKey,
        setName: SETS[setKey].name,
        team: declarer.team,
        declaredSets: room.declaredSets,
      });

      // Check win condition — first team to 5 sets wins
      if (room.declaredSets[0].length >= 5 || room.declaredSets[1].length >= 5) {
        const winningTeam = room.declaredSets[0].length >= 5 ? 0 : 1;
        io.to(code).emit('gameOver', { winningTeam });
      }

      sendHandUpdates(room, code);
    } else {
      // Failed declaration — award set to opposing team
      const opposingTeam = declarer.team === 0 ? 1 : 0;
      room.declaredSets[opposingTeam].push(setKey);

      io.to(code).emit('declarationFailed', {
        setKey,
        setName: SETS[setKey].name,
        reason: result.reason,
        penaltyTeam: opposingTeam,
        declaredSets: room.declaredSets,
      });

      if (room.declaredSets[0].length >= 5 || room.declaredSets[1].length >= 5) {
        const winningTeam = room.declaredSets[0].length >= 5 ? 0 : 1;
        io.to(code).emit('gameOver', { winningTeam });
      }
    }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const name = room.players[idx].name;
        room.players.splice(idx, 1);
        console.log(`${name} left room ${code}`);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (room.host === socket.id) room.host = room.players[0].id;
          io.to(code).emit('lobbyUpdate', room.players);
        }
        break;
      }
    }
  });
});

// Send each player their updated hand privately
function sendHandUpdates(room, code) {
  room.players.forEach(p => {
    io.to(p.id).emit('handUpdate', room.hands[p.id]);
  });
}

server.listen(3000, () => {
  console.log('Fish game server running at http://localhost:3000');
});