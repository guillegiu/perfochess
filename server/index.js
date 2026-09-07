// Servidor de relay para el multiplayer de majedrez. No conoce las reglas
// del ajedrez ni de los poderes: cada cliente valida y aplica las jugadas
// localmente, este servidor solo empareja salas por codigo y reenvia los
// mensajes entre los dos jugadores de una sala.
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8787;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)

const rooms = new Map(); // code -> { host: ws|null, guest: ws|null }

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function peerOf(ws) {
  const room = rooms.get(ws.room);
  if (!room) return null;
  return ws.role === 'host' ? room.guest : room.host;
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'create') {
      const code = generateCode();
      rooms.set(code, { host: ws, guest: null });
      ws.room = code;
      ws.role = 'host';
      send(ws, { type: 'created', code });
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room || room.guest) {
        send(ws, { type: 'error', message: 'Codigo invalido o la sala ya esta llena.' });
        return;
      }
      room.guest = ws;
      ws.room = code;
      ws.role = 'guest';
      send(ws, { type: 'joined', code });
      send(room.host, { type: 'opponent-joined' });
      return;
    }

    // Cualquier otro mensaje (init, move, power, ...) se reenvia tal cual
    // al otro jugador de la sala.
    if (ws.room) {
      send(peerOf(ws), msg);
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    send(peerOf(ws), { type: 'opponent-left' });
    rooms.delete(ws.room);
  });
});

console.log(`Servidor de salas majedrez escuchando en ws://0.0.0.0:${PORT}`);
