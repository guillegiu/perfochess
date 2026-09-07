// Registro de estilos de fichas disponibles. Cada estilo es una carpeta en
// public/pieces/<id>/ con 12 archivos: w_p.png, w_n.png, w_b.png, w_r.png,
// w_q.png, w_k.png y los mismos con prefijo b_ (piezas negras). Para agregar
// un estilo nuevo: recortar el set con scripts/crop-pieces.mjs (o a mano) y
// sumar una entrada aca.
export const PIECE_STYLES = [
  { id: 'realista', label: 'Realista 3D' },
  { id: 'gatitos', label: 'Gatitos' },
  { id: 'minimalista', label: 'Minimalista' },
  { id: 'robots', label: 'Robots' },
];

export const DEFAULT_PIECE_STYLE = PIECE_STYLES[0].id;

export function isValidPieceStyle(id) {
  return PIECE_STYLES.some((style) => style.id === id);
}
