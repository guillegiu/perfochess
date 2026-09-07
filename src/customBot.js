// Bot simple (solo material, sin tablas de posicion) para partidas con el
// motor de tablero variable (CustomChess). Las partidas con "Tablero 9x9" o
// "Fila extra" no tienen poderes, asi que este bot no necesita saber nada
// de ellos.

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evaluateMaterial(game) {
  let score = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      score += piece.color === 'w' ? PIECE_VALUES[piece.type] : -PIECE_VALUES[piece.type];
    }
  }
  return score;
}

function orderMoves(moves) {
  return moves.slice().sort((a, b) => {
    const aCap = a.captured ? PIECE_VALUES[a.captured] : 0;
    const bCap = b.captured ? PIECE_VALUES[b.captured] : 0;
    return bCap - aCap;
  });
}

function minimax(game, depth, alpha, beta, maximizing) {
  if (depth === 0 || game.isGameOver()) {
    return { score: evaluateMaterial(game) };
  }

  const moves = orderMoves(game.moves());
  let bestMove = null;

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const result = minimax(game, depth - 1, alpha, beta, false);
      game.undo();
      if (result.score > maxEval) {
        maxEval = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, result.score);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };
  }

  let minEval = Infinity;
  for (const move of moves) {
    game.move(move);
    const result = minimax(game, depth - 1, alpha, beta, true);
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

// difficulty: 1 = mayormente al azar con sesgo a capturas, 2-3 = minimax
// (profundidad chica: el tablero es mas grande, mas jugadas por nodo).
export function pickCustomBotMove(game, difficulty = 2) {
  const moves = game.moves();
  if (moves.length === 0) return null;

  if (difficulty <= 1) {
    const captures = moves.filter((m) => m.captured);
    const pool = captures.length && Math.random() < 0.6 ? captures : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const depth = difficulty === 2 ? 1 : 2;
  const maximizing = game.turn() === 'w';
  const result = minimax(game, depth, -Infinity, Infinity, maximizing);
  return result.move || moves[Math.floor(Math.random() * moves.length)];
}
