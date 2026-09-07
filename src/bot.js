import { getPowerTargets, getLockableSquares, applyPowerAction } from './powers.js';
import { legalMoves } from './boardVariants.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const ALL_FILES = 'abcdefghi';

// Tablas de posicion (desde la perspectiva de blancas, fila 0 = octava fila del tablero).
// Solo aplican al tablero estandar 8x8: en 9x9/fila extra no calzan con la
// geometria del tablero, asi que ahi se evalua solo material (ver evaluateBoard).
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];

const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const TABLES = { p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE, r: ROOK_TABLE, q: QUEEN_TABLE, k: KING_TABLE };

function squareIndex(square) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square.slice(1), 10) - 1;
  return { file, rank };
}

function positionValue(piece, square) {
  const { file, rank } = squareIndex(square);
  const table = TABLES[piece.type];
  const row = piece.color === 'w' ? 7 - rank : rank;
  return table[row * 8 + file];
}

export function evaluateBoard(game) {
  const files = game.files || 8;
  const ranks = game.ranks || 8;
  const useTables = files === 8 && ranks === 8;
  const board = game.board();
  let score = 0;
  for (let r = 0; r < ranks; r++) {
    for (let f = 0; f < files; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const square = ALL_FILES[f] + (ranks - r);
      const value = PIECE_VALUES[piece.type] + (useTables ? positionValue(piece, square) : 0);
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
}

// chess.js se snapshotea/restaura por FEN; CustomChess no tiene FEN.
function snapshotBoard(game) {
  return typeof game.fen === 'function' ? game.fen() : game.cloneBoard();
}

function restoreBoard(game, snapshot) {
  if (typeof snapshot === 'string') game.load(snapshot);
  else game.restoreBoard(snapshot);
}

function orderMoves(moves) {
  return moves.slice().sort((a, b) => {
    const aCapture = a.captured ? PIECE_VALUES[a.captured] : 0;
    const bCapture = b.captured ? PIECE_VALUES[b.captured] : 0;
    return bCapture - aCapture;
  });
}

function minimax(game, depth, alpha, beta, maximizing, blockedSquares, frozenSquares) {
  if (depth === 0 || game.isGameOver()) {
    return { score: evaluateBoard(game) };
  }

  const moves = orderMoves(legalMoves(game, {}, blockedSquares, frozenSquares));
  let bestMove = null;

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const result = minimax(game, depth - 1, alpha, beta, false, blockedSquares, frozenSquares);
      game.undo();
      if (result.score > maxEval) {
        maxEval = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, result.score);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move(move);
      const result = minimax(game, depth - 1, alpha, beta, true, blockedSquares, frozenSquares);
      game.undo();
      if (result.score < minEval) {
        minEval = result.score;
        bestMove = move;
      }
      beta = Math.min(beta, result.score);
      if (beta <= alpha) break;
    }
    return { score: minEval, move: bestMove };
  }
}

// difficulty: 1 = movimiento mayormente al azar con algo de captura, 2 = profundidad 2, 3 = profundidad 3
export function pickBotMove(game, difficulty = 2, blockedSquares = [], frozenSquares = []) {
  const moves = legalMoves(game, {}, blockedSquares, frozenSquares);
  if (moves.length === 0) return null;

  if (difficulty <= 1) {
    const captures = moves.filter((m) => m.captured);
    const pool = captures.length && Math.random() < 0.6 ? captures : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const depth = difficulty === 2 ? 2 : 3;
  const maximizing = game.turn() === 'w';
  const result = minimax(game, depth, -Infinity, Infinity, maximizing, blockedSquares, frozenSquares);
  return result.move || moves[Math.floor(Math.random() * moves.length)];
}

// Candidato para "Congelar": la pieza rival mas valiosa (no el rey) que no
// este ya congelada. El valor del congelamiento se estima como una fraccion
// del valor de la pieza (no es una captura, es inmovilizarla 3 turnos).
const FREEZE_VALUE_FACTOR = 0.25;

function evaluateFreezeCandidate(game, color, frozenSquares) {
  const files = game.files || 8;
  const ranks = game.ranks || 8;
  const board = game.board();
  let best = null;
  for (let r = 0; r < ranks; r++) {
    for (let f = 0; f < files; f++) {
      const piece = board[r][f];
      if (!piece || piece.color === color || piece.type === 'k') continue;
      const square = ALL_FILES[f] + (ranks - r);
      if (frozenSquares.includes(square)) continue;
      const value = PIECE_VALUES[piece.type];
      if (!best || value > best.value) best = { square, value };
    }
  }
  return best;
}

// Candidato para "Bloquear casilla": una casilla vacia adyacente al rey
// rival (para restarle movilidad) si hay alguna disponible, si no cualquier
// casilla vacia al azar. Valor fijo modesto (no es una ganancia material
// directa, es un estorbo).
const LOCK_SQUARE_VALUE = 60;

function evaluateLockCandidate(game, color, blockedSquares) {
  const lockable = getLockableSquares(game, blockedSquares);
  if (lockable.length === 0) return null;

  const files = game.files || 8;
  const ranks = game.ranks || 8;
  const board = game.board();
  const enemyColor = color === 'w' ? 'b' : 'w';
  let kingSquare = null;
  for (let r = 0; r < ranks && !kingSquare; r++) {
    for (let f = 0; f < files; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === enemyColor) {
        kingSquare = ALL_FILES[f] + (ranks - r);
        break;
      }
    }
  }

  if (kingSquare) {
    const [kf, kr] = [kingSquare.charCodeAt(0) - 97, parseInt(kingSquare.slice(1), 10) - 1];
    const nearKing = lockable.filter((sq) => {
      const f = sq.charCodeAt(0) - 97;
      const r = parseInt(sq.slice(1), 10) - 1;
      return Math.abs(f - kf) <= 1 && Math.abs(r - kr) <= 1;
    });
    if (nearKing.length > 0) {
      return { square: nearKing[Math.floor(Math.random() * nearKing.length)], value: LOCK_SQUARE_VALUE * 1.5 };
    }
  }

  return { square: lockable[Math.floor(Math.random() * lockable.length)], value: LOCK_SQUARE_VALUE };
}

const POWER_ADVANTAGE_THRESHOLD = 150;

function evaluateBestPowerCandidate(game, color, availablePowers, blockedSquares, frozenSquares) {
  // "freeze" y "lock_square" se evaluan aparte (no dependen de una pieza propia).
  const uniqueTypes = [...new Set(availablePowers)].filter((type) => type !== 'freeze' && type !== 'lock_square');
  if (uniqueTypes.length === 0) return null;

  const files = game.files || 8;
  const ranks = game.ranks || 8;
  const board = game.board();
  let best = null;

  for (const type of uniqueTypes) {
    for (let r = 0; r < ranks; r++) {
      for (let f = 0; f < files; f++) {
        const piece = board[r][f];
        if (!piece || piece.color !== color) continue;
        const from = ALL_FILES[f] + (ranks - r);

        const targets = getPowerTargets(game, type, from, blockedSquares, frozenSquares);

        for (const to of targets) {
          const snapshot = snapshotBoard(game);
          applyPowerAction(game, { type, from, to });
          const isMate = game.isCheckmate();
          const rawScore = evaluateBoard(game);
          restoreBoard(game, snapshot);

          const score = color === 'w' ? rawScore : -rawScore;
          if (isMate || !best || score > best.score) {
            best = { type, from, to, score: isMate ? Infinity : score };
          }
        }
      }
    }
  }

  return best;
}

// Decide si el bot juega una jugada normal o usa uno de sus poderes
// disponibles. Compara el resultado de la mejor jugada normal (a 1 ply)
// contra la mejor jugada de poder posible, y usa el poder solo si mejora
// claramente la posicion o entrega jaque mate.
export function pickBotAction(game, difficulty, color, availablePowers = [], blockedSquares = [], frozenSquares = []) {
  const bestNormal = pickBotMove(game, difficulty, blockedSquares, frozenSquares);

  let normalScore = null;
  if (bestNormal) {
    game.move(bestNormal);
    const rawScore = evaluateBoard(game);
    game.undo();
    normalScore = color === 'w' ? rawScore : -rawScore;
  }

  let bestPower = evaluateBestPowerCandidate(game, color, availablePowers, blockedSquares, frozenSquares);

  if (availablePowers.includes('freeze') && normalScore !== null) {
    const freeze = evaluateFreezeCandidate(game, color, frozenSquares);
    if (freeze) {
      const score = normalScore + freeze.value * FREEZE_VALUE_FACTOR;
      if (!bestPower || score > bestPower.score) {
        bestPower = { type: 'freeze', from: freeze.square, to: freeze.square, score };
      }
    }
  }

  if (availablePowers.includes('lock_square') && normalScore !== null) {
    const lock = evaluateLockCandidate(game, color, blockedSquares);
    if (lock) {
      const score = normalScore + lock.value;
      if (!bestPower || score > bestPower.score) {
        bestPower = { type: 'lock_square', from: lock.square, to: lock.square, score };
      }
    }
  }

  if (bestPower && (bestPower.score === Infinity || normalScore === null || bestPower.score > normalScore + POWER_ADVANTAGE_THRESHOLD)) {
    return { kind: 'power', type: bestPower.type, from: bestPower.from, to: bestPower.to };
  }

  return { kind: 'move', move: bestNormal };
}
