const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the public directory
app.use(express.static('public'));

// Game state management
const rooms = new Map();

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'create_room':
                handleCreateRoom(ws, data);
                break;
            case 'join_room':
                handleJoinRoom(ws, data);
                break;
            case 'move':
                handleMove(ws, data);
                break;
            case 'get_rooms':
                handleGetRooms(ws);
                break;
        }
    });
    
    ws.on('close', () => {
        // Clean up disconnected players
        rooms.forEach((room, code) => {
            if (room.players.white === ws) {
                notifyPlayer(room.players.black, { type: 'opponent_disconnected' });
                rooms.delete(code);
            } else if (room.players.black === ws) {
                notifyPlayer(room.players.white, { type: 'opponent_disconnected' });
                rooms.delete(code);
            }
        });
    });
});

function handleCreateRoom(ws, data) {
    const roomCode = generateRoomCode();
    const room = {
        code: roomCode,
        players: { white: ws, black: null },
        gameState: initializeGame(),
        isPrivate: data.isPrivate || false
    };
    
    rooms.set(roomCode, room);
    
    ws.send(JSON.stringify({
        type: 'room_created',
        roomCode,
        isPrivate: room.isPrivate
    }));
}

function handleJoinRoom(ws, data) {
    const room = rooms.get(data.roomCode);
    
    if (!room || room.players.black) {
        ws.send(JSON.stringify({
            type: 'join_error',
            message: room ? 'Room is full' : 'Room not found'
        }));
        return;
    }
    
    room.players.black = ws;
    
    // Notify both players
    notifyPlayer(room.players.white, {
        type: 'player_joined',
        opponentName: data.playerName,
        playerColor: 'black'
    });
    
    ws.send(JSON.stringify({
        type: 'room_joined',
        roomCode: data.roomCode,
        playerName: data.playerName,
        playerColor: 'black',
        opponentName: data.playerName,
        opponentColor: 'white',
        gameState: room.gameState
    }));
}

function handleMove(ws, data) {
    const room = rooms.get(data.roomCode);
    if (!room) return;
    
    // Validate move (simplified - in a real app you'd want proper validation)
    const fromPiece = room.gameState.board[data.from.row][data.from.col];
    const isWhiteMove = fromPiece === fromPiece.toUpperCase();
    const currentPlayer = isWhiteMove ? room.players.white : room.players.black;
    
    if (currentPlayer !== ws) return; // Not this player's turn
    
    // Apply move (simplified)
    const piece = room.gameState.board[data.from.row][data.from.col];
    room.gameState.board[data.to.row][data.to.col] = piece;
    room.gameState.board[data.from.row][data.from.col] = '';
    
    // Switch turns
    room.gameState.turn = room.gameState.turn === 'white' ? 'black' : 'white';
    
    // Notify both players
    const moveMessage = {
        type: 'move_made',
        from: data.from,
        to: data.to,
        promotion: data.promotion,
        gameState: room.gameState
    };
    
    notifyPlayer(room.players.white, moveMessage);
    notifyPlayer(room.players.black, moveMessage);
}

function handleGetRooms(ws) {
    const availableRooms = Array.from(rooms.values())
        .filter(room => !room.isPrivate && !room.players.black)
        .map(room => ({
            code: room.code,
            players: room.players.black ? 2 : 1,
            isPrivate: room.isPrivate
        }));
    
    ws.send(JSON.stringify({
        type: 'room_list',
        rooms: availableRooms
    }));
}

function notifyPlayer(player, message) {
    if (player && player.readyState === WebSocket.OPEN) {
        player.send(JSON.stringify(message));
    }
}

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function initializeGame() {
    return {
        board: [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['', '', '', '', '', '', '', ''],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ],
        turn: 'white',
        gameOver: false
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});