// Cliente WebSocket para el modo online. Se conecta al servidor de relay
// (server/index.js) que solo empareja salas por codigo y reenvia mensajes;
// toda la logica de ajedrez y poderes se sigue validando/aplicando en cada
// cliente, igual que en el modo vs bot.

export function multiplayerServerUrl() {
  return `ws://${window.location.hostname}:8787`;
}

export class MultiplayerClient {
  constructor({ onMessage, onClose }) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws = null;
    this.role = null; // 'host' | 'guest'
    this.code = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(multiplayerServerUrl());
      this.ws = ws;

      ws.addEventListener('open', () => {
        settled = true;
        resolve();
      });

      ws.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          reject(new Error('No se pudo conectar al servidor de salas.'));
        }
      });

      ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'created' || msg.type === 'joined') {
          this.code = msg.code;
        }
        this.onMessage(msg);
      });

      ws.addEventListener('close', () => {
        this.onClose?.();
      });
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  createRoom() {
    this.role = 'host';
    this.send({ type: 'create' });
  }

  joinRoom(code) {
    this.role = 'guest';
    this.send({ type: 'join', code: code.toUpperCase() });
  }

  disconnect() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
  }
}
