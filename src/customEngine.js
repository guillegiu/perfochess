// Motor de ajedrez minimo y autocontenido para tableros de tamano variable
// (9x9, o 8x9 con una fila extra). chess.js esta atado a un tablero fijo de
// 8x8 (FEN, notacion a-h/1-8, representacion 0x88), asi que no sirve para
// estas alteraciones. Este motor implementa las reglas basicas: movimiento
// de las 6 piezas, jaque, jaque mate, ahogado y coronacion. Deliberadamente
// NO incluye enroque ni "al paso" (simplificacion aceptada para una
// variante casual), y no tiene integracion con el sistema de poderes -
// las partidas con estas alteraciones juegan sin poderes.

const FILES = 'abcdefghi';

function squareOf(f, r) {
  return FILES[f] + (r + 1);
}

function parseSquare(square) {
  return [FILES.indexOf(square[0]), parseInt(square.slice(1), 10) - 1];
}

function inBounds(files, ranks, f, r) {
  return f >= 0 && f < files && r >= 0 && r < ranks;
}

const SLIDE_DIRS = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};
const KING_OFFSETS = SLIDE_DIRS.q;
const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

export class CustomChess {
  constructor(files, ranks) {
    this.files = files;
    this.ranks = ranks;
    this.reset();
  }

  buildBackRank() {
    if (this.files === 8) return ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    if (this.files === 9) return ['r', 'n', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const base = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    while (base.length < this.files) base.splice(Math.floor(base.length / 2), 0, 'n');
    return base;
  }

  reset() {
    const board = Array.from({ length: this.ranks }, () => Array(this.files).fill(null));
    const backRank = this.buildBackRank();
    for (let f = 0; f < this.files; f++) {
      board[0][f] = { type: backRank[f], color: 'w' };
      board[1][f] = { type: 'p', color: 'w' };
      board[this.ranks - 2][f] = { type: 'p', color: 'b' };
      board[this.ranks - 1][f] = { type: backRank[f], color: 'b' };
    }
    this._board = board;
    this._turn = 'w';
    this._history = [];
  }

  turn() {
    return this._turn;
  }

  get(square) {
    const [f, r] = parseSquare(square);
    return this._board[r]?.[f] || null;
  }

  // Igual que chess.js: filas de arriba (rank mas alto) hacia abajo.
  board() {
    const rows = [];
    for (let r = this.ranks - 1; r >= 0; r--) rows.push(this._board[r].slice());
    return rows;
  }

  _pieceMoves(f, r) {
    const piece = this._board[r][f];
    if (!piece) return [];
    const moves = [];
    const consider = (tf, tr, { mustCapture = false, mustBeEmpty = false } = {}) => {
      if (!inBounds(this.files, this.ranks, tf, tr)) return false;
      const occupant = this._board[tr][tf];
      if (occupant && occupant.color === piece.color) return false;
      if (mustCapture && !occupant) return false;
      if (mustBeEmpty && occupant) return false;
      moves.push({
        from: squareOf(f, r),
        to: squareOf(tf, tr),
        piece: piece.type,
        color: piece.color,
        captured: occupant ? occupant.type : null,
      });
      return !occupant;
    };

    if (piece.type === 'p') {
      const dir = piece.color === 'w' ? 1 : -1;
      const startRank = piece.color === 'w' ? 1 : this.ranks - 2;
      const oneAhead = inBounds(this.files, this.ranks, f, r + dir) && !this._board[r + dir][f];
      if (oneAhead) consider(f, r + dir, { mustBeEmpty: true });
      if (oneAhead && r === startRank) consider(f, r + 2 * dir, { mustBeEmpty: true });
      consider(f - 1, r + dir, { mustCapture: true });
      consider(f + 1, r + dir, { mustCapture: true });
    } else if (piece.type === 'n') {
      for (const [df, dr] of KNIGHT_OFFSETS) consider(f + df, r + dr);
    } else if (piece.type === 'k') {
      for (const [df, dr] of KING_OFFSETS) consider(f + df, r + dr);
    } else {
      for (const [df, dr] of SLIDE_DIRS[piece.type]) {
        let tf = f + df;
        let tr = r + dr;
        while (consider(tf, tr)) {
          tf += df;
          tr += dr;
        }
      }
    }
    return moves;
  }

  _findKing(color) {
    for (let r = 0; r < this.ranks; r++) {
      for (let f = 0; f < this.files; f++) {
        const p = this._board[r][f];
        if (p && p.type === 'k' && p.color === color) return [f, r];
      }
    }
    return null;
  }

  _isSquareAttacked(f, r, byColor) {
    for (let rr = 0; rr < this.ranks; rr++) {
      for (let ff = 0; ff < this.files; ff++) {
        const p = this._board[rr][ff];
        if (!p || p.color !== byColor) continue;
        if (this._pieceMoves(ff, rr).some((m) => m.to === squareOf(f, r))) return true;
      }
    }
    return false;
  }

  isCheck(color = this._turn) {
    const king = this._findKing(color);
    if (!king) return false;
    return this._isSquareAttacked(king[0], king[1], color === 'w' ? 'b' : 'w');
  }

  _applyRaw(move) {
    const [ff, fr] = parseSquare(move.from);
    const [tf, tr] = parseSquare(move.to);
    const movingPiece = this._board[fr][ff];
    const capturedPiece = this._board[tr][tf];
    this._board[fr][ff] = null;
    this._board[tr][tf] = movingPiece;
    return { from: [ff, fr], to: [tf, tr], movingPiece, capturedPiece };
  }

  _undoRaw(undo) {
    const [ff, fr] = undo.from;
    const [tf, tr] = undo.to;
    this._board[fr][ff] = undo.movingPiece;
    this._board[tr][tf] = undo.capturedPiece;
  }

  moves({ square, verbose = true } = {}) {
    const color = this._turn;
    const candidates = [];
    if (square) {
      const [f, r] = parseSquare(square);
      const piece = this._board[r]?.[f];
      if (piece && piece.color === color) candidates.push(...this._pieceMoves(f, r));
    } else {
      for (let r = 0; r < this.ranks; r++) {
        for (let f = 0; f < this.files; f++) {
          const p = this._board[r][f];
          if (p && p.color === color) candidates.push(...this._pieceMoves(f, r));
        }
      }
    }

    const legal = candidates.filter((m) => {
      const undo = this._applyRaw(m);
      const inCheck = this.isCheck(color);
      this._undoRaw(undo);
      return !inCheck;
    });

    const expanded = [];
    for (const m of legal) {
      const [, tr] = parseSquare(m.to);
      const promotionRank = m.color === 'w' ? this.ranks - 1 : 0;
      if (m.piece === 'p' && tr === promotionRank) {
        for (const promo of ['q', 'r', 'b', 'n']) expanded.push({ ...m, promotion: promo });
      } else {
        expanded.push(m);
      }
    }
    return expanded;
  }

  move({ from, to, promotion }) {
    const candidates = this.moves({ square: from });
    const match = candidates.find((m) => m.to === to && (!m.promotion || m.promotion === (promotion || 'q')));
    if (!match) return null;

    const [ff, fr] = parseSquare(from);
    const [tf, tr] = parseSquare(to);
    const movingPiece = this._board[fr][ff];
    const capturedPiece = this._board[tr][tf];
    this._board[fr][ff] = null;
    this._board[tr][tf] = match.promotion ? { type: match.promotion, color: movingPiece.color } : movingPiece;

    const record = {
      from,
      to,
      color: movingPiece.color,
      piece: movingPiece.type,
      captured: capturedPiece?.type || null,
      promotion: match.promotion || null,
      san: `${movingPiece.type}${from}-${to}${match.promotion ? `=${match.promotion.toUpperCase()}` : ''}`,
      _capturedPiece: capturedPiece,
      _originalPiece: movingPiece,
    };
    this._history.push(record);
    this._turn = this._turn === 'w' ? 'b' : 'w';
    return record;
  }

  undo() {
    const last = this._history.pop();
    if (!last) return null;
    const [ff, fr] = parseSquare(last.from);
    const [tf, tr] = parseSquare(last.to);
    this._board[fr][ff] = last._originalPiece;
    this._board[tr][tf] = last._capturedPiece;
    this._turn = this._turn === 'w' ? 'b' : 'w';
    return last;
  }

  history() {
    return this._history.map((h) => h.san);
  }

  isCheckmate() {
    return this.isCheck() && this.moves().length === 0;
  }

  isStalemate() {
    return !this.isCheck() && this.moves().length === 0;
  }

  isGameOver() {
    return this.isCheckmate() || this.isStalemate();
  }

  isDraw() {
    return this.isStalemate();
  }

  // No implementadas en este motor simplificado (siempre false).
  isThreefoldRepetition() {
    return false;
  }

  isInsufficientMaterial() {
    return false;
  }
}
