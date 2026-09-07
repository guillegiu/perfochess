// Sistema de poderes especiales. Cada partida asigna 3 poderes al azar
// (con repeticion posible) a cada bando, tomados de este listado. Se
// consumen al usarlos. Todas las jugadas de poder respetan que el bando que
// mueve no puede quedar en jaque (igual que una jugada normal).

export const POWER_DEFS = {
  exchange: {
    id: 'exchange',
    label: 'Intercambio',
    icon: '\u{1F504}',
    description: 'Intercambia la posicion de una pieza propia (no peon ni rey) con un peon propio.',
    color: '#4d9de0',
  },
  extended_advance: {
    id: 'extended_advance',
    label: 'Avance extendido',
    icon: '\u{1F680}',
    description: 'Una pieza (menos el caballo) se desliza en su direccion natural de movimiento hasta el limite del tablero.',
    color: '#e0724d',
  },
  cross_move: {
    id: 'cross_move',
    label: 'Movimiento cruzado',
    icon: '✖️',
    description: 'Por unica vez, una torre se mueve como alfil o un alfil se mueve como torre.',
    color: '#a25de0',
  },
  long_knight: {
    id: 'long_knight',
    label: 'Caballo largo',
    icon: '♞',
    description: 'Un caballo salta en L larga (3+1) en vez del salto clasico (2+1).',
    color: '#5ec26a',
  },
  freeze: {
    id: 'freeze',
    label: 'Congelar',
    icon: '❄️',
    description: 'Elegi una pieza rival (no el rey): no puede moverse durante sus proximos 3 turnos. Usarlo consume tu turno.',
    color: '#5bc8e8',
  },
};

export const FREEZE_TURNS = 3;

// Poderes cuyo primer (y unico) paso es elegir una pieza RIVAL en vez de una propia.
export function powerTargetsEnemy(type) {
  return type === 'freeze';
}

export const POWER_IDS = Object.keys(POWER_DEFS);

export function randomPowerSet(count = 3) {
  const set = [];
  for (let i = 0; i < count; i++) {
    set.push(POWER_IDS[Math.floor(Math.random() * POWER_IDS.length)]);
  }
  return set;
}

const FILES = 'abcdefgh';

function fileRank(square) {
  return [square.charCodeAt(0) - 97, parseInt(square[1], 10) - 1];
}

function toSquare(file, rank) {
  return FILES[file] + (rank + 1);
}

function inBounds(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function slideTargets(game, from, directions, { allowCapture = true, maxSteps = 7, blockedSquares = [] } = {}) {
  const [f0, r0] = fileRank(from);
  const piece = game.get(from);
  const targets = [];
  for (const [df, dr] of directions) {
    for (let step = 1; step <= maxSteps; step++) {
      const f = f0 + df * step;
      const r = r0 + dr * step;
      if (!inBounds(f, r)) break;
      const square = toSquare(f, r);
      if (blockedSquares.includes(square)) break;
      const occupant = game.get(square);
      if (!occupant) {
        targets.push(square);
        continue;
      }
      if (occupant.color !== piece.color && allowCapture) {
        targets.push(square);
      }
      break;
    }
  }
  return targets;
}

function applyEdits(game, edits) {
  for (const edit of edits) {
    if (edit.remove) game.remove(edit.square);
  }
  for (const edit of edits) {
    if (edit.put) game.put(edit.put, edit.square);
  }
}

function wouldExposeOwnKing(game, edits) {
  const originalFen = game.fen();
  applyEdits(game, edits);
  const exposed = game.isCheck();
  game.load(originalFen);
  return exposed;
}

// Un peon corona solo al llegar a la fila mas lejana (la del rival), igual
// que en ajedrez normal. Nunca corona por quedar parado en su propia fila
// base (eso se evita filtrando esos objetivos en getExchangeTargets, ya que
// chess.js no permite de todos modos un peon parado en la fila 1 u 8).
function withAutoPromotion(piece, square) {
  if (piece.type !== 'p') return piece;
  const [, rank] = fileRank(square);
  const promotionRank = piece.color === 'w' ? 7 : 0;
  return rank === promotionRank ? { type: 'q', color: piece.color } : piece;
}

function buildMoveEdits(game, from, to) {
  const piece = game.get(from);
  return [
    { square: from, remove: true },
    { square: to, remove: true },
    { square: to, put: withAutoPromotion(piece, to) },
  ];
}

function buildExchangeEdits(game, from, to) {
  const pieceA = game.get(from);
  const pieceB = game.get(to);
  return [
    { square: from, remove: true },
    { square: to, remove: true },
    { square: from, put: withAutoPromotion(pieceB, from) },
    { square: to, put: withAutoPromotion(pieceA, to) },
  ];
}

export function getExchangeTargets(game, from, blockedSquares = []) {
  const piece = game.get(from);
  if (!piece || piece.type === 'p' || piece.type === 'k') return [];
  // El peon terminaria parado en `from`: si esa fila es la base propia (no
  // la de coronacion), el intercambio no es valido - un peon nunca puede
  // quedar en su propia fila trasera.
  const [, fromRank] = fileRank(from);
  const ownBackRank = piece.color === 'w' ? 0 : 7;
  if (fromRank === ownBackRank) return [];
  const board = game.board();
  const targets = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'p' && p.color === piece.color) {
        targets.push(FILES[f] + (8 - r));
      }
    }
  }
  return targets.filter((to) => !wouldExposeOwnKing(game, buildExchangeEdits(game, from, to)));
}

export function getExtendedAdvanceTargets(game, from, blockedSquares = []) {
  const piece = game.get(from);
  if (!piece || piece.type === 'n') return [];

  let directions;
  let allowCapture = true;
  if (piece.type === 'p') {
    directions = [[0, piece.color === 'w' ? 1 : -1]];
    allowCapture = false;
  } else if (piece.type === 'r') {
    directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  } else if (piece.type === 'b') {
    directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  } else {
    directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  }

  const raw = slideTargets(game, from, directions, { allowCapture, blockedSquares });
  return raw.filter((to) => !wouldExposeOwnKing(game, buildMoveEdits(game, from, to)));
}

export function getCrossMoveTargets(game, from, blockedSquares = []) {
  const piece = game.get(from);
  if (!piece) return [];
  let directions;
  if (piece.type === 'r') directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  else if (piece.type === 'b') directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  else return [];

  const raw = slideTargets(game, from, directions, { blockedSquares });
  return raw.filter((to) => !wouldExposeOwnKing(game, buildMoveEdits(game, from, to)));
}

export function getLongKnightTargets(game, from, blockedSquares = []) {
  const piece = game.get(from);
  if (!piece || piece.type !== 'n') return [];
  const [f0, r0] = fileRank(from);
  const offsets = [
    [3, 1], [3, -1], [-3, 1], [-3, -1],
    [1, 3], [1, -3], [-1, 3], [-1, -3],
  ];
  const targets = [];
  for (const [df, dr] of offsets) {
    const f = f0 + df;
    const r = r0 + dr;
    if (!inBounds(f, r)) continue;
    const square = toSquare(f, r);
    if (blockedSquares.includes(square)) continue;
    const occupant = game.get(square);
    if (occupant && occupant.color === piece.color) continue;
    targets.push(square);
  }
  return targets.filter((to) => !wouldExposeOwnKing(game, buildMoveEdits(game, from, to)));
}

// `frozenSquares`: casillas con piezas congeladas (poder "Congelar"). Una
// pieza congelada no puede ser usada por ningun poder, ni ser el peon con el
// que se intercambia.
export function getPowerTargets(game, type, from, blockedSquares = [], frozenSquares = []) {
  if (frozenSquares.includes(from)) return [];
  if (type === 'exchange') {
    return getExchangeTargets(game, from, blockedSquares).filter((to) => !frozenSquares.includes(to));
  }
  if (type === 'extended_advance') return getExtendedAdvanceTargets(game, from, blockedSquares);
  if (type === 'cross_move') return getCrossMoveTargets(game, from, blockedSquares);
  if (type === 'long_knight') return getLongKnightTargets(game, from, blockedSquares);
  return [];
}

export function isEligiblePiece(type, piece) {
  if (!piece) return false;
  if (type === 'exchange') return piece.type !== 'p' && piece.type !== 'k';
  if (type === 'cross_move') return piece.type === 'r' || piece.type === 'b';
  if (type === 'long_knight') return piece.type === 'n';
  if (type === 'extended_advance') return piece.type !== 'n';
  if (type === 'freeze') return piece.type !== 'k';
  return false;
}

function flipTurnAndCommit(game) {
  const parts = game.fen().split(' ');
  const wasWhite = parts[1] === 'w';
  parts[1] = wasWhite ? 'b' : 'w';
  parts[3] = '-';
  parts[4] = String(parseInt(parts[4], 10) + 1);
  if (!wasWhite) parts[5] = String(parseInt(parts[5], 10) + 1);
  game.load(parts.join(' '));
}

// Aplica una jugada de poder ya validada (from/to deben venir de las
// funciones getXTargets de arriba) y pasa el turno. Devuelve un descriptor
// para el historial de jugadas y los resaltados de tablero.
export function applyPowerAction(game, { type, from, to }) {
  const actor = game.turn();

  if (type === 'freeze') {
    // No toca el tablero: solo consume el turno. El estado de congelamiento
    // lo lleva quien orquesta la partida (main.js), que es quien conoce los
    // turnos restantes de cada pieza congelada.
    const target = game.get(to);
    flipTurnAndCommit(game);
    return { type, from: to, to, piece: target, captured: null, color: actor };
  }

  const piece = game.get(from);
  const captured = type !== 'exchange' ? game.get(to) : null;
  const edits = type === 'exchange' ? buildExchangeEdits(game, from, to) : buildMoveEdits(game, from, to);
  applyEdits(game, edits);
  flipTurnAndCommit(game);
  return { type, from, to, piece, captured, color: actor };
}
