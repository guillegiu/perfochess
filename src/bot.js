import { getPowerTargets, applyPowerAction } from './powers.js';
import { legalMoves } from './boardVariants.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Tablas de posicion (desde la perspectiva de blancas, fila 0 = octava fila del tablero)
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
  const rank = parseInt(square[1], 10) - 1;
  return { file, rank };
}

function positionValue(piece, square) {
  const { file, rank } = squareIndex(square);
  const table = TABLES[piece.type];
  const row = piece.color === 'w' ? 7 - rank : rank;
  return table[row * 8 + file];
}

export function evaluateBoard(game) {
  const board = game.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const square = 'abcdefgh'[f] + (8 - r);
      const value = PIECE_VALUES[piece.type] + positionValue(piece, square);
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
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
      game.move(move.san);
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
      game.move(move.san);
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
  const board = game.board();
  let best = null;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece || piece.color === color || piece.type === 'k') continue;
      const square = 'abcdefgh'[f] + (8 - r);
      if (frozenSquares.includes(square)) continue;
      const value = PIECE_VALUES[piece.type];
      if (!best || value > best.value) best = { square, value };
    }
  }
  return best;
}

const POWER_ADVANTAGE_THRESHOLD = 150;

function evaluateBestPowerCandidate(game, color, availablePowers, blockedSquares, frozenSquares) {
  // "freeze" se evalua aparte (no se aplica sobre una pieza propia).
  const uniqueTypes = [...new Set(availablePowers)].filter((type) => type !== 'freeze');
  if (uniqueTypes.length === 0) return null;

  const board = game.board();
  let best = null;

  for (const type of uniqueTypes) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece || piece.color !== color) continue;
        const from = 'abcdefgh'[f] + (8 - r);

        const targets = getPowerTargets(game, type, from, blockedSquares, frozenSquares);

        for (const to of targets) {
          const originalFen = game.fen();
          applyPowerAction(game, { type, from, to });
          const isMate = game.isCheckmate();
          const rawScore = evaluateBoard(game);
          game.load(originalFen);

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
    game.move(bestNormal.san);
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

  if (bestPower && (bestPower.score === Infinity || normalScore === null || bestPower.score > normalScore + POWER_ADVANTAGE_THRESHOLD)) {
    return { kind: 'power', type: bestPower.type, from: bestPower.from, to: bestPower.to };
  }

  return { kind: 'move', move: bestNormal };
}
