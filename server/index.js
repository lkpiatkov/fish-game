const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// All active rooms live here
const rooms = {};

// Generates a random 6-character room code like "AB12CD"
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

  // Player creates a new room
  socket.on('createRoom', (playerName) => {
    let code = generateRoomCode();
    // Make sure the code isn't already in use
    while (rooms[code]) code = generateRoomCode();

    rooms[code] = {
      players: [{ id: socket.id, name: playerName, team: null }],
      started: false,
      host: socket.id
    };

    socket.join(code);
    socket.emit('roomCreated', { code, players: rooms[code].players });
    console.log(`Room ${code} created by ${playerName}`);
  });

  // Player joins an existing room
  socket.on('joinRoom', ({ code, playerName }) => {
    const room = rooms[code];

    if (!room) {
      socket.emit('joinError', 'Room not found. Check your code!');
      return;
    }
    if (room.started) {
      socket.emit('joinError', 'That game has already started.');
      return;
    }
    if (room.players.length >= 6) {
      socket.emit('joinError', 'That room is full (6 players max).');
      return;
    }
    const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (nameExists) {
      socket.emit('joinError', `The name "${playerName}" is already taken in this room!`);
      return;
    }

    room.players.push({ id: socket.id, name: playerName, team: null });
    socket.join(code);

    // Tell everyone in the room the updated player list
    io.to(code).emit('lobbyUpdate', room.players);
    console.log(`${playerName} joined room ${code}`);
  });

  // Host starts the game
  socket.on('startGame', (code) => {
    const room = rooms[code];
    if (!room) return;
    if (socket.id !== room.host) {
      socket.emit('joinError', 'Only the host can start the game.');
      return;
    }
    if (room.players.length !== 6) {
      socket.emit('joinError', 'Need exactly 6 players to start.');
      return;
    }

    room.started = true;
    io.to(code).emit('gameStarting');
  });

  // Player disconnects
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const name = room.players[idx].name;
        room.players.splice(idx, 1);
        console.log(`${name} left room ${code}`);

        // If room is empty, delete it
        if (room.players.length === 0) {
          delete rooms[code];
          console.log(`Room ${code} deleted (empty)`);
        } else {
          // If host left, assign a new host
          if (room.host === socket.id) {
            room.host = room.players[0].id;
          }
          io.to(code).emit('lobbyUpdate', room.players);
        }
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Fish game server running at http://localhost:3000');
});