// "Alteraciones de tablero": cambios aleatorios que se sortean al arrancar
// cada partida (si el jugador las dejo habilitadas). "Casillas bloqueadas"
// juega sobre el chess.js normal (8x8). "Tablero 9x9" y "Fila extra" cambian
// el tamano del tablero, algo que chess.js no soporta (esta atado a 8x8:
// FEN, notacion a-h/1-8, representacion interna 0x88) - esas dos usan el
// motor propio y liviano de customEngine.js en vez de chess.js. Los poderes
// (powers.js) funcionan igual en los tres casos; lo que el motor propio no
// tiene es enroque ni captura al paso (simplificacion deliberada).

export const BOARD_VARIANTS = {
  blocked_squares: {
    id: 'blocked_squares',
    label: 'Casillas bloqueadas',
    icon: '\u{1F9F1}', // 🧱
    description: 'Dos casillas simetricas en el centro del tablero quedan bloqueadas toda la partida: ninguna pieza puede pisarlas ni atravesarlas.',
    implemented: true,
    engine: 'standard',
  },
  board_9x9: {
    id: 'board_9x9',
    label: 'Tablero 9x9',
    icon: '➕',
    description: 'El tablero crece a 9x9 (una columna y una fila mas). Motor propio: sin enroque ni captura al paso, pero con los mismos poderes.',
    implemented: true,
    engine: 'custom',
    files: 9,
    ranks: 9,
  },
  extra_row: {
    id: 'extra_row',
    label: 'Fila extra',
    icon: '\u{1F4CF}', // 📏
    description: 'Se agrega una fila mas al tablero (8x9), marcada en el tablero. Motor propio: sin enroque ni captura al paso, pero con los mismos poderes.',
    implemented: true,
    engine: 'custom',
    files: 8,
    ranks: 9,
  },
};

export function implementedVariants() {
  return Object.values(BOARD_VARIANTS).filter((v) => v.implemented);
}

// Sortea una variante entre las implementadas. Devuelve null si no hay
// ninguna disponible.
export function pickRandomVariant() {
  const pool = implementedVariants();
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

const FILES = 'abcdefgh';

function toSquare(file, rank) {
  return FILES[file] + (rank + 1);
}

function fileRank(square) {
  return [square.charCodeAt(0) - 97, parseInt(square[1], 10) - 1];
}

// Elige 1 casilla al azar entre las filas centrales (4 y 5) y calcula su
// reflejo por rotacion de 180 grados, que cae siempre en la otra fila
// central -> par simetrico, justo para ambos bandos.
export function generateBlockedSquares() {
  const file = Math.floor(Math.random() * 8);
  const rank = Math.random() < 0.5 ? 3 : 4; // indices 0-based: fila 4 y fila 5
  const a = toSquare(file, rank);
  const b = toSquare(7 - file, 7 - rank);
  return [a, b];
}

function squaresBetween(from, to) {
  const [f0, r0] = fileRank(from);
  const [f1, r1] = fileRank(to);
  const df = Math.sign(f1 - f0);
  const dr = Math.sign(r1 - r0);
  const squares = [];
  let f = f0 + df;
  let r = r0 + dr;
  while (f !== f1 || r !== r1) {
    squares.push(toSquare(f, r));
    f += df;
    r += dr;
  }
  return squares;
}

// chess.js no sabe nada de las casillas bloqueadas (para el, estan vacias),
// asi que cualquier lista de jugadas que devuelva hay que filtrarla: ni
// aterrizar en una casilla bloqueada, ni atravesarla en un deslizamiento.
export function filterBlockedMoves(moves, blockedSquares = []) {
  if (!blockedSquares || blockedSquares.length === 0) return moves;
  return moves.filter((move) => {
    if (blockedSquares.includes(move.to)) return false;
    if (move.piece === 'r' || move.piece === 'b' || move.piece === 'q') {
      const path = squaresBetween(move.from, move.to);
      if (path.some((sq) => blockedSquares.includes(sq))) return false;
    }
    return true;
  });
}

// Wrapper para usar en vez de game.moves() en cualquier lugar donde importe
// respetar las casillas bloqueadas y las piezas congeladas.
//
// `frozenSquares`: piezas congeladas por el poder "Congelar", no pueden
// moverse. Excepcion deliberada: si el congelamiento dejara al bando sin
// NINGUNA jugada (p.ej. en jaque y la unica salida es la pieza congelada),
// se suspende y la pieza puede moverse - evita partidas trabadas, ya que
// chess.js no sabe de congelamientos al detectar jaque mate/ahogado.
export function legalMoves(game, options = {}, blockedSquares = [], frozenSquares = []) {
  const all = filterBlockedMoves(game.moves({ ...options, verbose: true }), blockedSquares);
  if (!frozenSquares || frozenSquares.length === 0) return all;

  const unfrozen = all.filter((move) => !frozenSquares.includes(move.from));
  if (unfrozen.length > 0) return unfrozen;

  // Sin jugadas para este pedido: si es una consulta por una casilla puntual,
  // hay que mirar el tablero entero para saber si el bando tiene otras jugadas.
  const globalAll = options.square
    ? filterBlockedMoves(game.moves({ verbose: true }), blockedSquares)
    : all;
  const globalUnfrozen = globalAll.filter((move) => !frozenSquares.includes(move.from));
  return globalUnfrozen.length > 0 ? unfrozen : all;
}
