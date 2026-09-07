const PIECE_FILES = {
  w: { p: 'w_p', n: 'w_n', b: 'w_b', r: 'w_r', q: 'w_q', k: 'w_k' },
  b: { p: 'b_p', n: 'b_n', b: 'b_b', r: 'b_r', q: 'b_q', k: 'b_k' },
};

const ALL_FILES = 'abcdefghi';

function loadPieceImages(style) {
  const images = { w: {}, b: {} };
  const promises = [];
  for (const color of ['w', 'b']) {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
      const img = new Image();
      img.src = `/pieces/${style}/${PIECE_FILES[color][type]}.png`;
      images[color][type] = img;
      promises.push(
        new Promise((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = resolve;
            img.onerror = resolve;
          }
        })
      );
    }
  }
  return { images, ready: Promise.all(promises) };
}

// Ajustes de tamano por estilo/tipo de pieza, relativos al tamano base
// (cell * 0.86). 1 = tamano normal, 0.6 = 40% mas chico, etc.
const SIZE_OVERRIDES = {
  minimalista: { p: 0.6 },
};

function pieceSizeFactor(style, type) {
  return SIZE_OVERRIDES[style]?.[type] ?? 1;
}

const LIGHT = '#f0d9b5';
const DARK = '#b58863';
const HIGHLIGHT_RING = 'rgba(255, 209, 102, 0.9)';
const HIGHLIGHT_FILL = 'rgba(255, 209, 102, 0.35)';
const TARGET_DOT = 'rgba(30, 26, 20, 0.38)';
const CAPTURE_RING = 'rgba(190, 60, 50, 0.75)';
const LAST_MOVE = 'rgba(155, 199, 108, 0.55)';
const CHECK_GLOW = 'rgba(214, 56, 44, 0.75)';

export class Board2D {
  constructor(canvas, { onSquareClick, pieceStyle = 'realista' }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSquareClick = onSquareClick;
    this.orientation = 'w';
    this.files = 8;
    this.ranks = 8;
    this.cell = 0;
    this.pieceStyle = pieceStyle;

    canvas.addEventListener('click', (event) => this.handleClick(event));
    this.lastRenderArgs = null;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (this.lastRenderArgs) this.render(...this.lastRenderArgs);
    });
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();

    this.loadPieceStyle(pieceStyle);
  }

  loadPieceStyle(style) {
    this.pieceStyle = style;
    const { images, ready } = loadPieceImages(style);
    this.pieceImages = images;
    ready.then(() => {
      if (this.lastRenderArgs) this.render(...this.lastRenderArgs);
    });
  }

  setPieceStyle(style) {
    if (style === this.pieceStyle) return;
    this.loadPieceStyle(style);
  }

  setBoardSize(files, ranks) {
    if (files === this.files && ranks === this.ranks) return;
    this.files = files;
    this.ranks = ranks;
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const slot = Math.min(rect.width, rect.height);
    this.cell = slot / Math.max(this.files, this.ranks);
    const width = this.cell * this.files;
    const height = this.cell * this.ranks;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setOrientation(orientation) {
    this.orientation = orientation;
  }

  squareToViewCoords(square) {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(square.slice(1), 10) - 1;
    const col = this.orientation === 'w' ? file : this.files - 1 - file;
    const row = this.orientation === 'w' ? this.ranks - 1 - rank : rank;
    return { col, row };
  }

  viewCoordsToSquare(col, row) {
    const file = this.orientation === 'w' ? col : this.files - 1 - col;
    const rank = this.orientation === 'w' ? this.ranks - 1 - row : row;
    return ALL_FILES[file] + (rank + 1);
  }

  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / this.cell);
    const row = Math.floor(y / this.cell);
    if (col < 0 || col >= this.files || row < 0 || row >= this.ranks) return;
    const square = this.viewCoordsToSquare(col, row);
    this.onSquareClick(square);
  }

  findCheckedKingSquare(game) {
    if (!game.isCheck()) return null;
    const board = game.board();
    const turn = game.turn();
    for (let r = 0; r < this.ranks; r++) {
      for (let f = 0; f < this.files; f++) {
        const piece = board[r][f];
        if (piece && piece.type === 'k' && piece.color === turn) {
          return ALL_FILES[f] + (this.ranks - r);
        }
      }
    }
    return null;
  }

  render(game, options = {}) {
    this.lastRenderArgs = [game, options];
    const { selectedSquare, legalTargets = [], lastMove, blockedSquares = [], frozen = [], extraRow = [] } = options;
    const ctx = this.ctx;
    const cell = this.cell;
    const board = game.board();
    const checkedKingSquare = this.findCheckedKingSquare(game);

    ctx.imageSmoothingEnabled = true;

    for (let row = 0; row < this.ranks; row++) {
      for (let col = 0; col < this.files; col++) {
        const isLight = (row + col) % 2 === 0;
        const x = col * cell;
        const y = row * cell;
        const gradient = ctx.createLinearGradient(x, y, x + cell, y + cell);
        if (isLight) {
          gradient.addColorStop(0, '#f5e2c2');
          gradient.addColorStop(1, LIGHT);
        } else {
          gradient.addColorStop(0, '#c19a6f');
          gradient.addColorStop(1, DARK);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, cell, cell);
      }
    }

    if (extraRow.length > 0) {
      const { row } = this.squareToViewCoords(extraRow[0]);
      ctx.save();
      ctx.fillStyle = 'rgba(94, 194, 106, 0.22)';
      ctx.fillRect(0, row * cell, this.files * cell, cell);
      ctx.strokeStyle = 'rgba(94, 194, 106, 0.75)';
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.strokeRect(0, row * cell + ctx.lineWidth / 2, this.files * cell, cell - ctx.lineWidth);
      ctx.font = `${cell * 0.15}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#eafbe8';
      ctx.fillText('\u{1F4CF} FILA EXTRA', cell * 0.08, row * cell + cell * 0.06);
      ctx.restore();
    }

    for (const square of blockedSquares) {
      const { col, row } = this.squareToViewCoords(square);
      const x = col * cell;
      const y = row * cell;
      ctx.save();
      ctx.fillStyle = 'rgba(20, 16, 12, 0.55)';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = Math.max(1, cell * 0.03);
      const step = cell * 0.22;
      ctx.beginPath();
      for (let offset = -cell; offset < cell * 2; offset += step) {
        ctx.moveTo(x + offset, y);
        ctx.lineTo(x + offset + cell, y + cell);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();
      ctx.stroke();
      ctx.restore();
      ctx.font = `${cell * 0.36}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillText('\u{1F9F1}', x + cell / 2, y + cell / 2);
      ctx.restore();
    }

    // Coordenadas sutiles en el borde del tablero
    ctx.font = `${cell * 0.16}px system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    for (let col = 0; col < this.files; col++) {
      const isLight = (col + this.ranks - 1) % 2 === 0;
      ctx.fillStyle = isLight ? DARK : LIGHT;
      ctx.globalAlpha = 0.75;
      const file = this.orientation === 'w' ? ALL_FILES[col] : ALL_FILES[this.files - 1 - col];
      ctx.fillText(file, col * cell + cell * 0.06, this.ranks * cell - cell * 0.06);
    }
    for (let row = 0; row < this.ranks; row++) {
      const isLight = row % 2 === 0;
      ctx.fillStyle = isLight ? DARK : LIGHT;
      ctx.globalAlpha = 0.75;
      const rank = this.orientation === 'w' ? this.ranks - row : row + 1;
      ctx.fillText(String(rank), cell * 0.06, row * cell + cell * 0.22);
    }
    ctx.globalAlpha = 1;

    const highlightFill = (square, color) => {
      const { col, row } = this.squareToViewCoords(square);
      ctx.fillStyle = color;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    };

    const highlightRing = (square, color, width) => {
      const { col, row } = this.squareToViewCoords(square);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(
        col * cell + width / 2,
        row * cell + width / 2,
        cell - width,
        cell - width
      );
    };

    if (lastMove) {
      highlightFill(lastMove.from, LAST_MOVE);
      highlightFill(lastMove.to, LAST_MOVE);
    }

    if (checkedKingSquare) {
      const { col, row } = this.squareToViewCoords(checkedKingSquare);
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      const glow = ctx.createRadialGradient(cx, cy, cell * 0.05, cx, cy, cell * 0.65);
      glow.addColorStop(0, CHECK_GLOW);
      glow.addColorStop(1, 'rgba(214, 56, 44, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }

    if (selectedSquare) {
      highlightFill(selectedSquare, HIGHLIGHT_FILL);
      highlightRing(selectedSquare, HIGHLIGHT_RING, Math.max(2, cell * 0.05));
    }

    for (let r = 0; r < this.ranks; r++) {
      for (let f = 0; f < this.files; f++) {
        const piece = board[r][f];
        if (!piece) continue;
        const square = ALL_FILES[f] + (this.ranks - r);
        const { col, row } = this.squareToViewCoords(square);
        const cx = col * cell + cell / 2;
        const baseline = row * cell + cell * 0.92;

        // sombra elipsoidal debajo de la pieza para dar sensacion de volumen
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, baseline - cell * 0.02, cell * 0.24, cell * 0.06, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();
        ctx.restore();

        const img = this.pieceImages[piece.color][piece.type];
        if (img.complete && img.naturalWidth) {
          const targetH = cell * 0.86 * pieceSizeFactor(this.pieceStyle, piece.type);
          const scale = targetH / img.naturalHeight;
          const targetW = img.naturalWidth * scale;
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = cell * 0.05;
          ctx.shadowOffsetY = cell * 0.015;
          ctx.drawImage(img, cx - targetW / 2, baseline - targetH, targetW, targetH);
          ctx.restore();
        }
      }
    }

    // Piezas congeladas: capa de escarcha + contador de turnos restantes
    for (const entry of frozen) {
      const { col, row } = this.squareToViewCoords(entry.square);
      const x = col * cell;
      const y = row * cell;
      ctx.save();
      ctx.fillStyle = 'rgba(120, 200, 240, 0.38)';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(150, 220, 255, 0.9)';
      ctx.lineWidth = Math.max(2, cell * 0.05);
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, cell - ctx.lineWidth, cell - ctx.lineWidth);
      const badgeR = cell * 0.17;
      const bx = x + cell - badgeR - cell * 0.06;
      const by = y + badgeR + cell * 0.06;
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#1e5b7a';
      ctx.fill();
      ctx.strokeStyle = '#bfe9ff';
      ctx.lineWidth = Math.max(1, cell * 0.02);
      ctx.stroke();
      ctx.font = `bold ${cell * 0.2}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#eaf7ff';
      ctx.fillText(`❄${entry.turns}`, bx, by + cell * 0.005);
      ctx.restore();
    }

    for (const target of legalTargets) {
      const { col, row } = this.squareToViewCoords(target);
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      const isCapture = Boolean(game.get(target));
      ctx.beginPath();
      if (isCapture) {
        ctx.strokeStyle = CAPTURE_RING;
        ctx.lineWidth = cell * 0.07;
        ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = TARGET_DOT;
        ctx.arc(cx, cy, cell * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
