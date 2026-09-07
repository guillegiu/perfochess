import './style.css';
import { Chess } from 'chess.js';
import { CustomChess } from './customEngine.js';
import { pickCustomBotMove } from './customBot.js';
import { Board2D } from './board2d.js';
import { Board3D } from './board3d.js';
import { pickBotAction } from './bot.js';
import { POWER_DEFS, FREEZE_TURNS, randomPowerSet, getPowerTargets, isEligiblePiece, powerTargetsEnemy, applyPowerAction } from './powers.js';
import { MultiplayerClient } from './multiplayer.js';
import { PIECE_STYLES, DEFAULT_PIECE_STYLE, isValidPieceStyle } from './pieceStyles.js';
import { BOARD_VARIANTS, pickRandomVariant, generateBlockedSquares, legalMoves } from './boardVariants.js';

let game = new Chess();
let boardEngine = 'standard'; // 'standard' (chess.js) | 'custom' (CustomChess, sin poderes)

const storedPieceStyle = localStorage.getItem('majedrez-piece-style');
let pieceStyle = isValidPieceStyle(storedPieceStyle) ? storedPieceStyle : DEFAULT_PIECE_STYLE;

let variantsEnabled = true;
let mode = 'bot'; // 'bot' | 'online'
let playerColor = 'w';
let difficulty = 2;
let selectedSquare = null;
let legalTargets = [];
let lastMove = null;
let is3D = false;
let botThinking = false;
let pendingPromotion = null;
let moveLog = [];
let powers = { w: [], b: [] };
let activePower = null; // { type, stage: 'select-piece' | 'select-target' }
let powerFrom = null;
let multiplayerClient = null;
let activeVariant = null; // BOARD_VARIANTS entry o null
let blockedSquares = [];
let frozen = []; // [{ square, color, turns }] piezas congeladas por el poder "Congelar"

function frozenSquares() {
  return frozen.map((entry) => entry.square);
}

function frozenAt(square) {
  return frozen.find((entry) => entry.square === square) || null;
}

function addFreeze(square, color) {
  frozen = frozen.filter((entry) => entry.square !== square);
  frozen.push({ square, color, turns: FREEZE_TURNS });
}

// Se llama cada vez que `color` completa un turno (jugada normal o poder):
// descuenta un turno a sus piezas congeladas y limpia las que fueron
// capturadas (la casilla ya no tiene una pieza de ese color).
function afterTurnCompleted(color) {
  frozen = frozen
    .map((entry) => (entry.color === color ? { ...entry, turns: entry.turns - 1 } : entry))
    .filter((entry) => entry.turns > 0 && game.get(entry.square)?.color === entry.color);
}

const statusEl = document.getElementById('status');
const moveListEl = document.getElementById('move-list');
const homeScreen = document.getElementById('home-screen');

const modeTabBot = document.getElementById('mode-tab-bot');
const modeTabOnline = document.getElementById('mode-tab-online');
const homeBotPanel = document.getElementById('home-bot-panel');
const homeOnlinePanel = document.getElementById('home-online-panel');
const homeSideSelect = document.getElementById('home-side-select');
const homeDifficultySelect = document.getElementById('home-difficulty-select');
const homePlayBtn = document.getElementById('home-play-btn');
const homePowersListEl = document.getElementById('home-powers-list');
const homeVariantsListEl = document.getElementById('home-variants-list');
const variantToggleInput = document.getElementById('variant-toggle-input');
const variantNoteEl = document.getElementById('variant-note');
const pieceStyleRowEl = document.getElementById('piece-style-row');

const onlineIdleEl = document.getElementById('online-idle');
const onlineWaitingEl = document.getElementById('online-waiting');
const onlineWaitingText = document.getElementById('online-waiting-text');
const onlineCodeDisplay = document.getElementById('online-code-display');
const onlineHostColorSelect = document.getElementById('online-host-color');
const onlineCreateBtn = document.getElementById('online-create-btn');
const onlineCodeInput = document.getElementById('online-code-input');
const onlineJoinBtn = document.getElementById('online-join-btn');
const onlineCancelBtn = document.getElementById('online-cancel-btn');
const onlineErrorEl = document.getElementById('online-error');

const newGameBtn = document.getElementById('new-game-btn');
const viewToggleBtn = document.getElementById('view-toggle-btn');
const view2dEl = document.getElementById('view-2d');
const view3dEl = document.getElementById('view-3d');
const promotionModal = document.getElementById('promotion-modal');
const gameOverModal = document.getElementById('game-over-modal');
const gameOverBox = gameOverModal.querySelector('.game-over-box');
const gameOverIcon = document.getElementById('game-over-icon');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverSubtitle = document.getElementById('game-over-subtitle');
const gameOverRematchBtn = document.getElementById('game-over-rematch');
const playerPowersEl = document.getElementById('player-powers');
const botPowersEl = document.getElementById('bot-powers');

const board2d = new Board2D(document.getElementById('board-2d'), {
  onSquareClick: handleSquareClick,
  pieceStyle,
});
const board3d = new Board3D(document.getElementById('board-3d'), {
  onSquareClick: handleSquareClick,
});

function renderStylePicker() {
  pieceStyleRowEl.innerHTML = PIECE_STYLES.map(
    (style) => `
      <button type="button" class="style-card${style.id === pieceStyle ? ' active' : ''}" data-style="${style.id}">
        <img class="style-card-preview" src="/pieces/${style.id}/w_k.png" alt="" />
        <span class="style-card-label">${style.label}</span>
      </button>`
  ).join('');

  pieceStyleRowEl.querySelectorAll('.style-card').forEach((card) => {
    card.addEventListener('click', () => selectPieceStyle(card.dataset.style));
  });
}

function selectPieceStyle(id) {
  if (id === pieceStyle) return;
  pieceStyle = id;
  localStorage.setItem('majedrez-piece-style', id);
  board2d.setPieceStyle(id);
  renderStylePicker();
}

renderStylePicker();

homePowersListEl.innerHTML = Object.values(POWER_DEFS)
  .map(
    (def) => `
      <div class="power-card mini-card" style="--power-color:${def.color}" title="${def.label}: ${def.description}">
        <div class="power-card-icon">${def.icon}</div>
        <div class="power-card-title">${def.label}</div>
      </div>`
  )
  .join('');

homeVariantsListEl.innerHTML = Object.values(BOARD_VARIANTS)
  .map(
    (variant) => `
      <div class="power-card mini-card${variant.implemented ? '' : ' power-card-soon'}" style="--power-color:#8a8172" title="${variant.label}: ${variant.description}">
        ${variant.implemented ? '' : '<span class="power-card-soon-tag">Proximamente</span>'}
        <div class="power-card-icon">${variant.icon}</div>
        <div class="power-card-title">${variant.label}</div>
      </div>`
  )
  .join('');

variantToggleInput.addEventListener('change', () => {
  variantsEnabled = variantToggleInput.checked;
  homeVariantsListEl.classList.toggle('disabled', !variantsEnabled);
});

function renderAll() {
  const options = { selectedSquare, legalTargets, lastMove, blockedSquares, frozen };
  board2d.render(game, options);
  board3d.render(game, options);
}

function updateVariantNote() {
  if (!activeVariant) {
    variantNoteEl.classList.add('hidden');
    return;
  }
  variantNoteEl.classList.remove('hidden');
  let detail = '';
  if (activeVariant.id === 'blocked_squares' && blockedSquares.length === 2) {
    detail = ` (${blockedSquares[0]}, ${blockedSquares[1]})`;
  } else if (activeVariant.engine === 'custom') {
    detail = ' (sin poderes)';
  }
  variantNoteEl.textContent = `${activeVariant.icon} Alteracion: ${activeVariant.label}${detail}`;
}

function updateStatus() {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Negras' : 'Blancas';
    statusEl.textContent = `Jaque mate. Ganan ${winner}.`;
  } else if (game.isStalemate()) {
    statusEl.textContent = 'Tablas por ahogado.';
  } else if (game.isThreefoldRepetition()) {
    statusEl.textContent = 'Tablas por repeticion.';
  } else if (game.isInsufficientMaterial()) {
    statusEl.textContent = 'Tablas por material insuficiente.';
  } else if (game.isDraw()) {
    statusEl.textContent = 'Tablas.';
  } else if (botThinking) {
    statusEl.textContent = 'El bot esta pensando...';
  } else if (activePower) {
    statusEl.textContent = powerPrompt(activePower.type, activePower.stage);
  } else if (mode === 'online' && !isPlayerTurn()) {
    statusEl.textContent = 'Esperando la jugada del rival...';
  } else if (game.isCheck()) {
    const turn = game.turn() === 'w' ? 'Blancas' : 'Negras';
    statusEl.textContent = `Jaque. Turno de ${turn}.`;
  } else {
    const turn = game.turn() === 'w' ? 'Blancas' : 'Negras';
    statusEl.textContent = `Turno de ${turn}.`;
  }
}

function updateMoveList() {
  moveListEl.innerHTML = '';
  for (let i = 0; i < moveLog.length; i += 2) {
    const li = document.createElement('li');
    const white = moveLog[i] ? moveLog[i].text : '';
    const black = moveLog[i + 1] ? moveLog[i + 1].text : '';
    li.textContent = black ? `${white}  ${black}` : white;
    moveListEl.appendChild(li);
  }
}

function renderPowersPanel() {
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  const canActivate = isPlayerTurn() && !botThinking && !pendingPromotion;

  playerPowersEl.innerHTML = '';
  powers[playerColor].forEach((id, idx) => {
    const def = POWER_DEFS[id];
    const isActive = Boolean(activePower && activePower.type === id && activePower.idx === idx);
    const card = document.createElement('button');
    card.className = 'power-card power-card-player';
    card.style.setProperty('--power-color', def.color);
    card.title = def.description;
    card.disabled = !canActivate;
    if (isActive) card.classList.add('active');
    card.innerHTML = `
      <div class="power-card-icon">${def.icon}</div>
      <div class="power-card-body">
        <div class="power-card-title">${def.label}</div>
      </div>`;
    card.addEventListener('click', () => togglePower(id, idx));
    playerPowersEl.appendChild(card);
  });
  if (powers[playerColor].length === 0) {
    playerPowersEl.innerHTML = '<span class="power-empty">Sin poderes disponibles</span>';
  }

  botPowersEl.innerHTML = '';
  powers[opponentColor].forEach((id) => {
    const def = POWER_DEFS[id];
    const card = document.createElement('div');
    card.className = 'power-card power-card-bot';
    card.style.setProperty('--power-color', def.color);
    card.title = def.description;
    card.innerHTML = `
      <div class="power-card-icon">${def.icon}</div>
      <div class="power-card-body">
        <div class="power-card-title">${def.label}</div>
      </div>`;
    botPowersEl.appendChild(card);
  });
  if (powers[opponentColor].length === 0) {
    botPowersEl.innerHTML = '<span class="power-empty">Sin poderes disponibles</span>';
  }
}

function showGameOverModal() {
  gameOverBox.classList.remove('result-win', 'result-loss');

  if (game.isCheckmate()) {
    const winnerColor = game.turn() === 'w' ? 'b' : 'w';
    const winnerLabel = winnerColor === 'w' ? 'Blancas' : 'Negras';
    const playerWon = winnerColor === playerColor;
    gameOverIcon.textContent = playerWon ? '♚' : '☠';
    gameOverTitle.textContent = playerWon ? 'Ganaste por jaque mate' : 'Jaque mate';
    gameOverSubtitle.textContent = `Ganan las ${winnerLabel}.`;
    gameOverBox.classList.add(playerWon ? 'result-win' : 'result-loss');
  } else if (game.isStalemate()) {
    gameOverIcon.textContent = '♟';
    gameOverTitle.textContent = 'Tablas';
    gameOverSubtitle.textContent = 'Ahogado: quien mueve no tiene jugadas legales.';
  } else if (game.isThreefoldRepetition()) {
    gameOverIcon.textContent = '♟';
    gameOverTitle.textContent = 'Tablas';
    gameOverSubtitle.textContent = 'Repeticion de posicion.';
  } else if (game.isInsufficientMaterial()) {
    gameOverIcon.textContent = '♟';
    gameOverTitle.textContent = 'Tablas';
    gameOverSubtitle.textContent = 'Material insuficiente para dar mate.';
  } else {
    gameOverIcon.textContent = '♟';
    gameOverTitle.textContent = 'Tablas';
    gameOverSubtitle.textContent = 'La partida termino en empate.';
  }

  gameOverModal.classList.remove('hidden');
}

function refreshUI() {
  renderAll();
  updateStatus();
  updateMoveList();
  renderPowersPanel();
  updateVariantNote();
  if (game.isGameOver()) {
    showGameOverModal();
  }
}

function isPlayerTurn() {
  return game.turn() === playerColor && !game.isGameOver();
}

function powerPrompt(type, stage) {
  if (stage === 'select-piece') {
    if (type === 'exchange') return 'Poder: elegi una pieza propia (no peon ni rey) para intercambiar.';
    if (type === 'cross_move') return 'Poder: elegi una torre o un alfil propio.';
    if (type === 'long_knight') return 'Poder: elegi un caballo propio.';
    if (type === 'freeze') return `Poder: elegi una pieza rival (no el rey) para congelarla ${FREEZE_TURNS} turnos.`;
    return 'Poder: elegi una pieza propia para el avance extendido.';
  }
  if (type === 'exchange') return 'Poder: elegi el peon con el que intercambiar.';
  return 'Poder: elegi la casilla destino.';
}

function togglePower(type, idx) {
  if (!isPlayerTurn() || botThinking || pendingPromotion) return;

  if (activePower && activePower.type === type && activePower.idx === idx) {
    cancelActivePower();
    return;
  }

  activePower = { type, idx, stage: 'select-piece' };
  powerFrom = null;
  selectedSquare = null;
  legalTargets = [];
  refreshUI();
}

function cancelActivePower() {
  activePower = null;
  powerFrom = null;
  legalTargets = [];
  refreshUI();
}

function sendNetworkMove(move) {
  if (mode === 'online') {
    multiplayerClient?.send({ type: 'move', from: move.from, to: move.to, promotion: move.promotion });
  }
}

function sendNetworkPower(action) {
  if (mode === 'online') {
    multiplayerClient?.send({ type: 'power', powerType: action.type, from: action.from, to: action.to });
  }
}

function handlePowerSquareClick(square) {
  const piece = game.get(square);

  if (powerTargetsEnemy(activePower.type)) {
    // Poderes de un solo paso sobre una pieza rival (p.ej. "Congelar").
    if (!piece || piece.color === playerColor || !isEligiblePiece(activePower.type, piece)) return;
    if (frozenAt(square)) {
      statusEl.textContent = 'Esa pieza ya esta congelada.';
      return;
    }
    const type = activePower.type;
    activePower = null;
    powerFrom = null;
    selectedSquare = null;
    legalTargets = [];
    const action = commitPowerAction(playerColor, { type, from: square, to: square });
    refreshUI();
    sendNetworkPower(action);
    if (mode === 'bot' && !game.isGameOver()) {
      scheduleBotTurn();
    }
    return;
  }

  if (activePower.stage === 'select-piece') {
    if (!piece || piece.color !== playerColor || !isEligiblePiece(activePower.type, piece)) return;
    if (frozenAt(square)) {
      statusEl.textContent = 'Esa pieza esta congelada y no puede usarse.';
      return;
    }
    const targets = getPowerTargets(game, activePower.type, square, blockedSquares, frozenSquares());
    if (targets.length === 0) {
      statusEl.textContent = 'Esa pieza no tiene movimientos disponibles con este poder.';
      return;
    }
    powerFrom = square;
    legalTargets = targets;
    activePower.stage = 'select-target';
    selectedSquare = square;
    renderAll();
    updateStatus();
    return;
  }

  if (square === powerFrom) {
    cancelActivePower();
    return;
  }

  if (!legalTargets.includes(square)) {
    if (piece && piece.color === playerColor && isEligiblePiece(activePower.type, piece) && !frozenAt(square)) {
      const targets = getPowerTargets(game, activePower.type, square, blockedSquares, frozenSquares());
      if (targets.length > 0) {
        powerFrom = square;
        legalTargets = targets;
        selectedSquare = square;
        renderAll();
        return;
      }
    }
    cancelActivePower();
    return;
  }

  const type = activePower.type;
  const from = powerFrom;
  activePower = null;
  powerFrom = null;
  selectedSquare = null;
  legalTargets = [];
  const action = commitPowerAction(playerColor, { type, from, to: square });
  refreshUI();

  sendNetworkPower(action);
  if (mode === 'bot' && !game.isGameOver()) {
    scheduleBotTurn();
  }
}

function consumePower(color, type) {
  const idx = powers[color].indexOf(type);
  if (idx !== -1) powers[color].splice(idx, 1);
}

function logPowerMove(color, action) {
  const def = POWER_DEFS[action.type];
  const text = action.type === 'freeze' ? `${def.icon} ${action.to}` : `${def.icon} ${action.from}-${action.to}`;
  moveLog.push({ color, text });
}

// Aplica una jugada de poder ya validada de parte de `color` (jugador local,
// bot o rival por red) y actualiza todo el estado derivado.
function commitPowerAction(color, action) {
  const result = applyPowerAction(game, action);
  consumePower(color, action.type);
  logPowerMove(color, result);
  if (result.type === 'freeze') {
    addFreeze(result.to, result.piece.color);
  }
  lastMove = { from: result.from, to: result.to };
  afterTurnCompleted(color);
  return result;
}

function handleSquareClick(square) {
  if (botThinking || pendingPromotion) return;
  if (!isPlayerTurn()) return;

  if (activePower) {
    handlePowerSquareClick(square);
    return;
  }

  const piece = game.get(square);

  if (selectedSquare) {
    if (selectedSquare === square) {
      selectedSquare = null;
      legalTargets = [];
      refreshUI();
      return;
    }

    const isTarget = legalTargets.includes(square);
    if (isTarget) {
      attemptMove(selectedSquare, square);
      return;
    }

    if (piece && piece.color === playerColor) {
      selectSquare(square);
    } else {
      selectedSquare = null;
      legalTargets = [];
      refreshUI();
    }
    return;
  }

  if (piece && piece.color === playerColor) {
    selectSquare(square);
  }
}

function selectSquare(square) {
  selectedSquare = square;
  const moves = legalMoves(game, { square }, blockedSquares, frozenSquares());
  legalTargets = moves.map((m) => m.to);
  refreshUI();
  if (moves.length === 0 && frozenAt(square)) {
    statusEl.textContent = `Esa pieza esta congelada (${frozenAt(square).turns} turno(s) mas).`;
  }
}

function attemptMove(from, to) {
  const piece = game.get(from);
  const boardRanks = game.ranks || 8;
  const targetRank = to.slice(1);
  const isPromotion =
    piece.type === 'p' && (targetRank === String(boardRanks) || targetRank === '1');

  if (isPromotion) {
    pendingPromotion = { from, to };
    promotionModal.classList.remove('hidden');
    return;
  }

  finalizeMove(from, to);
}

function finalizeMove(from, to, promotion) {
  const move = game.move({ from, to, promotion });
  if (!move) return;

  moveLog.push({ color: move.color, text: move.san });
  lastMove = { from: move.from, to: move.to };
  selectedSquare = null;
  legalTargets = [];
  afterTurnCompleted(move.color);
  refreshUI();

  sendNetworkMove(move);
  if (mode === 'bot' && !game.isGameOver()) {
    scheduleBotTurn();
  }
}

promotionModal.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-piece]');
  if (!button || !pendingPromotion) return;
  const { from, to } = pendingPromotion;
  pendingPromotion = null;
  promotionModal.classList.add('hidden');
  finalizeMove(from, to, button.dataset.piece);
});

gameOverRematchBtn.addEventListener('click', () => {
  gameOverModal.classList.add('hidden');
  leaveOnlineGame();
  showHomeScreen();
});

function scheduleBotTurn() {
  botThinking = true;
  updateStatus();
  setTimeout(() => {
    if (boardEngine === 'custom') {
      const move = pickCustomBotMove(game, difficulty);
      if (move) {
        const applied = game.move(move);
        if (applied) {
          moveLog.push({ color: applied.color, text: applied.san });
          lastMove = { from: applied.from, to: applied.to };
        }
      }
    } else {
      const botColor = playerColor === 'w' ? 'b' : 'w';
      const action = pickBotAction(game, difficulty, botColor, powers[botColor], blockedSquares, frozenSquares());

      if (action.kind === 'power') {
        commitPowerAction(botColor, action);
      } else if (action.move) {
        const move = game.move({ from: action.move.from, to: action.move.to, promotion: action.move.promotion });
        moveLog.push({ color: move.color, text: move.san });
        lastMove = { from: move.from, to: move.to };
        afterTurnCompleted(move.color);
      }
    }

    botThinking = false;
    refreshUI();
  }, 300);
}

function maybeTriggerBotFirstMove() {
  if (mode === 'bot' && !isPlayerTurn() && !game.isGameOver()) {
    scheduleBotTurn();
  }
}

newGameBtn.addEventListener('click', () => {
  leaveOnlineGame();
  showHomeScreen();
});

viewToggleBtn.addEventListener('click', () => {
  is3D = !is3D;
  view2dEl.classList.toggle('active', !is3D);
  view3dEl.classList.toggle('active', is3D);
  viewToggleBtn.textContent = is3D ? 'Ver en 2D' : 'Ver en 3D';
  if (is3D) {
    board3d.resize();
    board3d.start();
  } else {
    board3d.stop();
  }
});

homePlayBtn.addEventListener('click', startBotGame);

modeTabBot.addEventListener('click', () => setHomeMode('bot'));
modeTabOnline.addEventListener('click', () => setHomeMode('online'));

function setHomeMode(newMode) {
  modeTabBot.classList.toggle('active', newMode === 'bot');
  modeTabOnline.classList.toggle('active', newMode === 'online');
  homeBotPanel.classList.toggle('hidden', newMode !== 'bot');
  homeOnlinePanel.classList.toggle('hidden', newMode !== 'online');
}

function showOnlineIdle() {
  onlineIdleEl.classList.remove('hidden');
  onlineWaitingEl.classList.add('hidden');
}

function showOnlineWaiting(text) {
  onlineWaitingText.textContent = text;
  onlineCodeDisplay.classList.add('hidden');
  onlineIdleEl.classList.add('hidden');
  onlineWaitingEl.classList.remove('hidden');
}

function setOnlineError(message) {
  onlineErrorEl.textContent = message;
  onlineErrorEl.classList.remove('hidden');
}

function handleMultiplayerMessage(msg) {
  switch (msg.type) {
    case 'created':
      showOnlineWaiting('Esperando al rival...');
      onlineCodeDisplay.textContent = msg.code;
      onlineCodeDisplay.classList.remove('hidden');
      break;
    case 'joined':
      showOnlineWaiting('Conectado. Esperando que el anfitrion arranque la partida...');
      break;
    case 'opponent-joined': {
      const hostColor = onlineHostColorSelect.value;
      const variant = variantsEnabled ? pickRandomVariant() : null;
      const powersData = variant?.engine === 'custom' ? { w: [], b: [] } : { w: randomPowerSet(3), b: randomPowerSet(3) };
      const blocked = variant?.id === 'blocked_squares' ? generateBlockedSquares() : [];
      multiplayerClient.send({ type: 'init', hostColor, powers: powersData, variantId: variant?.id ?? null, blockedSquares: blocked });
      beginOnlineGame(hostColor, powersData, variant, blocked);
      break;
    }
    case 'init': {
      const variant = msg.variantId ? BOARD_VARIANTS[msg.variantId] : null;
      beginOnlineGame(msg.hostColor, msg.powers, variant, msg.blockedSquares || []);
      break;
    }
    case 'move': {
      const move = game.move({ from: msg.from, to: msg.to, promotion: msg.promotion });
      if (!move) return;
      moveLog.push({ color: move.color, text: move.san });
      lastMove = { from: move.from, to: move.to };
      afterTurnCompleted(move.color);
      refreshUI();
      break;
    }
    case 'power': {
      commitPowerAction(game.turn(), { type: msg.powerType, from: msg.from, to: msg.to });
      refreshUI();
      break;
    }
    case 'opponent-left':
      if (mode === 'online' && homeScreen.classList.contains('hidden')) {
        statusEl.textContent = 'El rival se desconecto de la partida.';
      } else {
        setOnlineError('El rival se desconecto.');
        showOnlineIdle();
      }
      break;
    case 'error':
      setOnlineError(msg.message);
      showOnlineIdle();
      break;
  }
}

function handleMultiplayerClose() {
  if (mode === 'online' && homeScreen.classList.contains('hidden') && !game.isGameOver()) {
    statusEl.textContent = 'Se perdio la conexion con el rival.';
  }
}

function beginOnlineGame(hostColor, powersData, variant, blocked) {
  mode = 'online';
  playerColor = multiplayerClient.role === 'host' ? hostColor : hostColor === 'w' ? 'b' : 'w';
  homeScreen.classList.add('hidden');
  resetGameState(powersData, variant, blocked);
}

async function connectMultiplayer() {
  multiplayerClient = new MultiplayerClient({
    onMessage: handleMultiplayerMessage,
    onClose: handleMultiplayerClose,
  });
  await multiplayerClient.connect();
  return multiplayerClient;
}

onlineCreateBtn.addEventListener('click', async () => {
  onlineErrorEl.classList.add('hidden');
  onlineCreateBtn.disabled = true;
  onlineJoinBtn.disabled = true;
  try {
    const client = await connectMultiplayer();
    client.createRoom();
    showOnlineWaiting('Creando sala...');
  } catch {
    setOnlineError('No se pudo conectar al servidor de salas (npm run server debe estar corriendo).');
  } finally {
    onlineCreateBtn.disabled = false;
    onlineJoinBtn.disabled = false;
  }
});

onlineJoinBtn.addEventListener('click', async () => {
  const code = onlineCodeInput.value.trim();
  if (code.length !== 4) {
    setOnlineError('Ingresa el codigo de 4 caracteres.');
    return;
  }
  onlineErrorEl.classList.add('hidden');
  onlineCreateBtn.disabled = true;
  onlineJoinBtn.disabled = true;
  try {
    const client = await connectMultiplayer();
    client.joinRoom(code);
    showOnlineWaiting('Uniendose a la sala...');
  } catch {
    setOnlineError('No se pudo conectar al servidor de salas (npm run server debe estar corriendo).');
  } finally {
    onlineCreateBtn.disabled = false;
    onlineJoinBtn.disabled = false;
  }
});

onlineCodeInput.addEventListener('input', () => {
  onlineCodeInput.value = onlineCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

onlineCancelBtn.addEventListener('click', () => {
  if (multiplayerClient) {
    multiplayerClient.disconnect();
    multiplayerClient = null;
  }
  showOnlineIdle();
});

function leaveOnlineGame() {
  if (multiplayerClient) {
    multiplayerClient.disconnect();
    multiplayerClient = null;
  }
}

function showHomeScreen() {
  homeSideSelect.value = playerColor;
  homeDifficultySelect.value = String(difficulty);
  gameOverModal.classList.add('hidden');
  showOnlineIdle();
  onlineErrorEl.classList.add('hidden');
  onlineCodeInput.value = '';
  homeScreen.classList.remove('hidden');
}

function startBotGame() {
  mode = 'bot';
  playerColor = homeSideSelect.value;
  difficulty = parseInt(homeDifficultySelect.value, 10);
  homeScreen.classList.add('hidden');
  const variant = variantsEnabled ? pickRandomVariant() : null;
  const powersData = variant?.engine === 'custom' ? { w: [], b: [] } : { w: randomPowerSet(3), b: randomPowerSet(3) };
  const blocked = variant?.id === 'blocked_squares' ? generateBlockedSquares() : [];
  resetGameState(powersData, variant, blocked);
  maybeTriggerBotFirstMove();
}

function resetGameState(powersData, variant = null, blocked = []) {
  boardEngine = variant?.engine === 'custom' ? 'custom' : 'standard';
  const files = boardEngine === 'custom' ? variant.files : 8;
  const ranks = boardEngine === 'custom' ? variant.ranks : 8;
  game = boardEngine === 'custom' ? new CustomChess(files, ranks) : new Chess();
  selectedSquare = null;
  legalTargets = [];
  lastMove = null;
  botThinking = false;
  pendingPromotion = null;
  activePower = null;
  powerFrom = null;
  moveLog = [];
  powers = powersData;
  activeVariant = variant;
  blockedSquares = blocked;
  frozen = [];
  promotionModal.classList.add('hidden');
  gameOverModal.classList.add('hidden');
  board2d.setBoardSize(files, ranks);
  board3d.setBoardSize(files, ranks);
  board2d.setOrientation(playerColor);
  board3d.setOrientation(playerColor);
  refreshUI();
}

renderAll();
