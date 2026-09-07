// Nombre y descripcion de movimiento de cada pieza, para el tooltip al
// pasar el mouse sobre el tablero durante la partida.
export const PIECE_INFO = {
  p: { name: 'Peon', moves: 'Avanza una casilla al frente (dos en su primer movimiento) y captura en diagonal.' },
  n: { name: 'Caballo', moves: 'Se mueve en forma de L: dos casillas en una direccion y una perpendicular. Es la unica pieza que salta sobre otras.' },
  b: { name: 'Alfil', moves: 'Se desliza en diagonal, cualquier cantidad de casillas libres.' },
  r: { name: 'Torre', moves: 'Se desliza en linea recta (horizontal o vertical), cualquier cantidad de casillas libres.' },
  q: { name: 'Dama', moves: 'Se desliza en linea recta o en diagonal, cualquier cantidad de casillas libres.' },
  k: { name: 'Rey', moves: 'Se mueve una sola casilla, en cualquier direccion.' },
};

export function pieceLabel(piece) {
  const info = PIECE_INFO[piece.type];
  const color = piece.color === 'w' ? 'Blanca' : 'Negra';
  return `${info.name} ${color}`;
}
