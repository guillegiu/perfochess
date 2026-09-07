// Procesa las piezas "robots" (archivos individuales, no una grilla) desde
// piezas_robots_png/ a public/pieces/robots/. Cada fuente trae un halo de
// sombra suave (color con alpha muy bajo) que se limpia igual que en
// crop-pieces.mjs para evitar bleed al escalar, y se recorta el padding
// transparente sobrante.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'piezas_robots_png');
const outDir = path.join(root, 'public', 'pieces', 'robots');
mkdirSync(outDir, { recursive: true });

const ALPHA_CLEAN_THRESHOLD = 24;

const MAP = {
  blanca_rey: 'w_k',
  blanca_reina: 'w_q',
  blanca_torre: 'w_r',
  blanca_alfil: 'w_b',
  blanca_caballo: 'w_n',
  blanca_peon: 'w_p',
  negra_rey: 'b_k',
  negra_reina: 'b_q',
  negra_torre: 'b_r',
  negra_alfil: 'b_b',
  negra_caballo: 'b_n',
  negra_peon: 'b_p',
};

for (const [srcName, outName] of Object.entries(MAP)) {
  const srcPath = path.join(srcDir, `${srcName}.png`);
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    if (data[i + 3] < ALPHA_CLEAN_THRESHOLD) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  const outPath = path.join(outDir, `${outName}.png`);
  await sharp(data, { raw: { width, height, channels } })
    .trim({ threshold: 10 })
    .png()
    .toFile(outPath);
  console.log(`${outName}.png listo`);
}
