// Recorta una grilla 4x3 de piezas (una imagen con fondo transparente) en 12
// archivos individuales prolijos (trim automatico del padding transparente)
// listos para public/pieces/<estilo>/. Trabaja sobre el buffer RGBA crudo en
// vez de sharp.extract() para evitar un bug de sharp con extract areas que
// tocan el borde exacto de la imagen.
//
// Convencion de carpetas (ver piezas_png/README.md):
//   piezas_png/<estilo>/fuente.png  ->  public/pieces/<estilo>/*.png
//
// Uso: node scripts/crop-pieces.mjs [nombre-de-estilo] [archivo-fuente]
// Por defecto: piezas_png/realista/fuente.png -> public/pieces/realista/
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const styleArg = process.argv[2] || 'realista';
const sourceArg = process.argv[3] || 'fuente.png';
const src = path.isAbsolute(sourceArg) ? sourceArg : path.join(root, 'piezas_png', styleArg, sourceArg);
const outDir = path.join(root, 'public', 'pieces', styleArg);
mkdirSync(outDir, { recursive: true });

const COLS = 4;
const ROWS = 3;

const GRID = [
  ['w_k', 'w_q', 'w_r', 'w_b'],
  ['w_n', 'w_p', 'b_k', 'b_q'],
  ['b_r', 'b_b', 'b_n', 'b_p'],
];

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;

// Algunas fuentes traen "fringing": pixeles casi transparentes (alpha muy
// bajo) que igual guardan un color saturado de fondo (rojo, amarillo, etc).
// Al escalar la pieza para el tablero ese color se filtra como un halo
// visible. Limpiamos: por debajo de este umbral de alpha, el pixel pasa a
// ser 100% transparente y sin color.
const ALPHA_CLEAN_THRESHOLD = 24;
for (let i = 0; i < data.length; i += channels) {
  if (data[i + 3] < ALPHA_CLEAN_THRESHOLD) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 0;
  }
}

const cellW = Math.floor(width / COLS);
const cellH = Math.floor(height / ROWS);

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const name = GRID[row][col];
    const outPath = path.join(outDir, `${name}.png`);
    const left = col * cellW;
    const top = row * cellH;

    const cellBuffer = Buffer.alloc(cellW * cellH * channels);
    for (let y = 0; y < cellH; y++) {
      const srcStart = ((top + y) * width + left) * channels;
      const destStart = y * cellW * channels;
      data.copy(cellBuffer, destStart, srcStart, srcStart + cellW * channels);
    }

    await sharp(cellBuffer, { raw: { width: cellW, height: cellH, channels } })
      .trim({ threshold: 10 })
      .png()
      .toFile(outPath);
    console.log(`${name}.png listo`);
  }
}
