import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SQUARE_SIZE = 1;
const ALL_FILES = 'abcdefghi';

const LIGHT_COLOR = 0xf0d9b5;
const DARK_COLOR = 0xb58863;
const HIGHLIGHT_COLOR = 0xffd166;
const TARGET_COLOR = 0x2f2a22;
const CAPTURE_COLOR = 0xbe3c32;
const LAST_MOVE_COLOR = 0x9bc76c;
const CHECK_COLOR = 0xd6382c;
const FRAME_COLOR = 0x4a3222;
const BLOCKED_TILE_COLOR = 0x1c1a17;
const FROZEN_TILE_COLOR = 0x8fd4f2;

const WHITE_PIECE_COLOR = 0xfbf8f1;
const BLACK_PIECE_COLOR = 0x201c17;

const pieceMaterials = {
  w: new THREE.MeshPhysicalMaterial({
    color: WHITE_PIECE_COLOR,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  }),
  b: new THREE.MeshPhysicalMaterial({
    color: BLACK_PIECE_COLOR,
    roughness: 0.28,
    metalness: 0.1,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  }),
};

function buildPieceMesh(type, color) {
  const material = pieceMaterials[color];
  const group = new THREE.Group();

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 12, 24), material);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.16;
  group.add(collar);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.14, 28), material);
  base.position.y = 0.07;
  group.add(base);

  const addStem = (height, radiusTop, radiusBottom, yOffset) => {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24), material);
    stem.position.y = yOffset;
    group.add(stem);
    return stem;
  };

  switch (type) {
    case 'p': {
      addStem(0.35, 0.14, 0.2, 0.28);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), material);
      head.position.y = 0.52;
      group.add(head);
      break;
    }
    case 'r': {
      addStem(0.5, 0.24, 0.28, 0.35);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.14, 8), material);
      top.position.y = 0.65;
      group.add(top);
      break;
    }
    case 'n': {
      addStem(0.3, 0.2, 0.26, 0.22);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.34), material);
      head.position.set(0, 0.5, 0.05);
      head.rotation.x = -0.3;
      group.add(head);
      break;
    }
    case 'b': {
      addStem(0.5, 0.1, 0.22, 0.35);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 16), material);
      head.position.y = 0.75;
      group.add(head);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), material);
      tip.position.y = 0.97;
      group.add(tip);
      break;
    }
    case 'q': {
      addStem(0.6, 0.12, 0.24, 0.4);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), material);
      crown.position.y = 0.78;
      group.add(crown);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), material);
      tip.position.y = 0.98;
      group.add(tip);
      break;
    }
    case 'k': {
      addStem(0.68, 0.13, 0.26, 0.44);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), material);
      crossV.position.y = 0.95;
      group.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.08), material);
      crossH.position.y = 0.88;
      group.add(crossH);
      break;
    }
  }

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return group;
}

export class Board3D {
  constructor(canvas, { onSquareClick }) {
    this.canvas = canvas;
    this.onSquareClick = onSquareClick;
    this.orientation = 'w';
    this.files = 8;
    this.ranks = 8;
    this.pieceMeshes = new Map();
    this.markerMeshes = [];
    this.blockerMeshes = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b1a17);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 7, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;

    this.setupLights();
    this.buildBoardTiles();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    canvas.addEventListener('click', (event) => this.handleClick(event));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.renderer.render(this.scene, this.camera);

    this.animate = this.animate.bind(this);
    this.running = false;
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0xfff3e0, 0.55);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xfff6e8, 1.05);
    dir.position.set(5, 10, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -8;
    dir.shadow.camera.right = 8;
    dir.shadow.camera.top = 8;
    dir.shadow.camera.bottom = -8;
    dir.shadow.radius = 3;
    this.scene.add(dir);
    this.dirLight = dir;

    const fill = new THREE.DirectionalLight(0xdce8ff, 0.3);
    fill.position.set(-6, 6, -4);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xffe9c4, 0.4, 15);
    rim.position.set(0, 4, -6);
    this.scene.add(rim);
  }

  offsetX() {
    return ((this.files - 1) / 2) * SQUARE_SIZE;
  }

  offsetZ() {
    return ((this.ranks - 1) / 2) * SQUARE_SIZE;
  }

  squareToWorld(square, orientation) {
    const file = ALL_FILES.indexOf(square[0]);
    const rank = parseInt(square.slice(1), 10) - 1;
    const x = orientation === 'w' ? file : this.files - 1 - file;
    const z = orientation === 'w' ? this.ranks - 1 - rank : rank;
    return { x: x * SQUARE_SIZE - this.offsetX(), z: z * SQUARE_SIZE - this.offsetZ() };
  }

  worldToSquare(x, z, orientation) {
    const col = Math.round((x + this.offsetX()) / SQUARE_SIZE);
    const row = Math.round((z + this.offsetZ()) / SQUARE_SIZE);
    if (col < 0 || col >= this.files || row < 0 || row >= this.ranks) return null;
    const file = orientation === 'w' ? col : this.files - 1 - col;
    const rank = orientation === 'w' ? this.ranks - 1 - row : row;
    return ALL_FILES[file] + (rank + 1);
  }

  buildBoardTiles() {
    if (this.tileGroup) {
      this.scene.remove(this.tileGroup);
      this.tileGroup.traverse((obj) => obj.geometry?.dispose?.());
    }
    if (this.frame) {
      this.scene.remove(this.frame);
      this.frame.geometry.dispose();
    }

    this.tileGroup = new THREE.Group();
    this.tiles = {};
    const geometry = new THREE.BoxGeometry(SQUARE_SIZE, 0.2, SQUARE_SIZE);
    const offsetX = this.offsetX();
    const offsetZ = this.offsetZ();

    for (let row = 0; row < this.ranks; row++) {
      for (let col = 0; col < this.files; col++) {
        const isLight = (row + col) % 2 === 0;
        const material = new THREE.MeshStandardMaterial({
          color: isLight ? LIGHT_COLOR : DARK_COLOR,
          roughness: 0.75,
          metalness: 0.02,
        });
        const tile = new THREE.Mesh(geometry, material);
        tile.position.set(col * SQUARE_SIZE - offsetX, -0.1, row * SQUARE_SIZE - offsetZ);
        tile.receiveShadow = true;
        tile.userData.baseColor = isLight ? LIGHT_COLOR : DARK_COLOR;
        this.tileGroup.add(tile);
        this.tiles[`${col},${row}`] = tile;
      }
    }
    this.scene.add(this.tileGroup);

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: FRAME_COLOR,
      roughness: 0.55,
      metalness: 0.08,
    });
    const outerW = SQUARE_SIZE * this.files + 0.6;
    const outerH = SQUARE_SIZE * this.ranks + 0.6;
    const innerW = SQUARE_SIZE * this.files;
    const innerH = SQUARE_SIZE * this.ranks;
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-outerW / 2, -outerH / 2);
    frameShape.lineTo(outerW / 2, -outerH / 2);
    frameShape.lineTo(outerW / 2, outerH / 2);
    frameShape.lineTo(-outerW / 2, outerH / 2);
    frameShape.lineTo(-outerW / 2, -outerH / 2);
    const hole = new THREE.Path();
    hole.moveTo(-innerW / 2, -innerH / 2);
    hole.lineTo(innerW / 2, -innerH / 2);
    hole.lineTo(innerW / 2, innerH / 2);
    hole.lineTo(-innerW / 2, innerH / 2);
    hole.lineTo(-innerW / 2, -innerH / 2);
    frameShape.holes.push(hole);
    const frameGeometry = new THREE.ExtrudeGeometry(frameShape, { depth: 0.24, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    frameGeometry.rotateX(Math.PI / 2);
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.set(0, -0.22, 0);
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.scene.add(frame);
    this.frame = frame;

    const maxDim = Math.max(this.files, this.ranks);
    const dist = 8 * (maxDim / 8);
    this.camera.position.set(0, 7 * (maxDim / 8), dist);
    this.controls.maxDistance = 20 * (maxDim / 8);
    if (this.dirLight) {
      const half = maxDim / 2 + 2;
      this.dirLight.shadow.camera.left = -half;
      this.dirLight.shadow.camera.right = half;
      this.dirLight.shadow.camera.top = half;
      this.dirLight.shadow.camera.bottom = -half;
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }
  }

  setBoardSize(files, ranks) {
    if (files === this.files && ranks === this.ranks) return;
    this.files = files;
    this.ranks = ranks;
    this.buildBoardTiles();
  }

  setOrientation(orientation) {
    this.orientation = orientation;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    this.renderer.setSize(size, size, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.tileGroup.children, false);
    if (intersects.length === 0) return;
    const tile = intersects[0].object;
    const square = this.worldToSquare(tile.position.x, tile.position.z, this.orientation);
    if (square) this.onSquareClick(square);
  }

  clearPieces() {
    for (const mesh of this.pieceMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.pieceMeshes.clear();
  }

  clearMarkers() {
    for (const marker of this.markerMeshes) {
      this.scene.remove(marker);
    }
    this.markerMeshes = [];
  }

  clearBlockers() {
    for (const mesh of this.blockerMeshes) {
      this.scene.remove(mesh);
    }
    this.blockerMeshes = [];
  }

  buildBlockerMesh() {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 0.95, metalness: 0.02 });
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), material);
    rock.position.y = 0.3;
    rock.rotation.set(0.4, 0.8, 0.2);
    rock.scale.set(1, 0.8, 1);
    group.add(rock);
    const rock2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), material);
    rock2.position.set(0.22, 0.16, 0.15);
    rock2.rotation.set(1.1, 0.3, 0.6);
    group.add(rock2);
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  resetTileColors() {
    for (const tile of Object.values(this.tiles)) {
      tile.material.color.setHex(tile.userData.baseColor);
    }
  }

  findCheckedKingSquare(game) {
    if (!game.isCheck()) return null;
    const board = game.board();
    const turn = game.turn();
    for (let r = 0; r < this.ranks; r++) {
      for (let f = 0; f < this.files; f++) {
        const piece = board[r][f];
        if (piece && piece.type === 'k' && piece.color === turn) {
          return ALL_FILES[f] + (this.ranks - r);
        }
      }
    }
    return null;
  }

  render(game, { selectedSquare, legalTargets = [], lastMove, blockedSquares = [], frozen = [] } = {}) {
    this.clearPieces();
    this.clearMarkers();
    this.clearBlockers();
    this.resetTileColors();
    const checkedKingSquare = this.findCheckedKingSquare(game);

    const board = game.board();
    for (let r = 0; r < this.ranks; r++) {
      for (let f = 0; f < this.files; f++) {
        const piece = board[r][f];
        if (!piece) continue;
        const square = ALL_FILES[f] + (this.ranks - r);
        const mesh = buildPieceMesh(piece.type, piece.color);
        const { x, z } = this.squareToWorld(square, this.orientation);
        mesh.position.set(x, 0, z);
        this.scene.add(mesh);
        this.pieceMeshes.set(square, mesh);
      }
    }

    const setTileColor = (square, color) => {
      const { x, z } = this.squareToWorld(square, this.orientation);
      const col = Math.round((x + this.offsetX()) / SQUARE_SIZE);
      const row = Math.round((z + this.offsetZ()) / SQUARE_SIZE);
      const tile = this.tiles[`${col},${row}`];
      if (tile) tile.material.color.setHex(color);
    };

    for (const square of blockedSquares) {
      setTileColor(square, BLOCKED_TILE_COLOR);
      const { x, z } = this.squareToWorld(square, this.orientation);
      const blocker = this.buildBlockerMesh();
      blocker.position.set(x, 0, z);
      this.scene.add(blocker);
      this.blockerMeshes.push(blocker);
    }

    for (const entry of frozen) {
      setTileColor(entry.square, FROZEN_TILE_COLOR);
    }

    if (lastMove) {
      setTileColor(lastMove.from, LAST_MOVE_COLOR);
      setTileColor(lastMove.to, LAST_MOVE_COLOR);
    }
    if (checkedKingSquare) {
      setTileColor(checkedKingSquare, CHECK_COLOR);
    }
    if (selectedSquare) {
      setTileColor(selectedSquare, HIGHLIGHT_COLOR);
    }

    for (const target of legalTargets) {
      const { x, z } = this.squareToWorld(target, this.orientation);
      const isCapture = Boolean(game.get(target));
      const marker = isCapture
        ? new THREE.Mesh(
            new THREE.TorusGeometry(0.42, 0.05, 12, 32),
            new THREE.MeshStandardMaterial({ color: CAPTURE_COLOR, roughness: 0.5 })
          )
        : new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.05, 20),
            new THREE.MeshStandardMaterial({ color: TARGET_COLOR, roughness: 0.6 })
          );
      if (isCapture) marker.rotation.x = Math.PI / 2;
      marker.position.set(x, 0.04, z);
      this.scene.add(marker);
      this.markerMeshes.push(marker);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.animate();
  }

  stop() {
    this.running = false;
  }

  animate() {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
