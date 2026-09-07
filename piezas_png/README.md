# Fuentes de los estilos de fichas

Cada estilo tiene su propia carpeta aca, con la imagen fuente sin procesar:

```
piezas_png/
  <estilo>/
    fuente.png     <- grilla 4 columnas x 3 filas, fondo transparente
  _originales_sin_usar/
    ...            <- archivo de recortes viejos que ya no usa la app
```

## Orden esperado de la grilla en `fuente.png`

```
Rey blanco    Dama blanca   Torre blanca   Alfil blanco
Caballo bl.   Peon blanco   Rey negro      Dama negra
Torre negra   Alfil negro   Caballo negro  Peon negro
```

## Agregar un estilo nuevo

1. Crear `piezas_png/<id-del-estilo>/fuente.png` con esa grilla (fondo
   transparente, PNG con canal alfa).
2. Correr:
   ```
   node scripts/crop-pieces.mjs <id-del-estilo>
   ```
   Esto recorta las 12 piezas (con trim automatico del padding transparente)
   y las deja en `public/pieces/<id-del-estilo>/` como `w_p.png`, `w_n.png`,
   `w_b.png`, `w_r.png`, `w_q.png`, `w_k.png` y los mismos con prefijo `b_`.
3. Agregar una entrada en `src/pieceStyles.js` (`PIECE_STYLES`) con ese mismo
   `id` y una etiqueta para mostrar en el selector.

Si la grilla de la imagen fuente no es 4x3, hay que ajustar `COLS`/`ROWS`/
`GRID` en `scripts/crop-pieces.mjs` antes de correrlo (o pasar los recortes
a mano con el mismo esquema de nombres).
