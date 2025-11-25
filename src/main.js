import './style.css'

// --- Game Logic ---

const APP = document.querySelector('#app');
const BOARD_SIZE = 7;
const CELL_SIZE = 60; // Must match CSS

// Tile Types
const TYPE_I = 'I';
const TYPE_L = 'L';
const TYPE_T = 'T';

const DIRS = { N: 0, E: 1, S: 2, W: 3 };
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0]; // N is -1 y

// Base connections for Rotation 0
const CONNECTIONS = {
  [TYPE_I]: [true, false, true, false], // N-S
  [TYPE_L]: [true, true, false, false], // N-E
  [TYPE_T]: [true, true, false, true], // N-E-W
};

// Fantasy Treasures
const TREASURES = ['👑', '💍', '🔮', '🏺', '📜', '🗡️', '🛡️', '🗝️', '🕯️', '⚱️', '💎', '🏆'];

// Game State
let board = [];
let extraTile = null;
let players = [
  { id: 0, x: 0, y: 0, char: '🧙', color: '#ffffff', target: 0, score: 0 },
];
let currentPlayerIndex = 0;
let phase = 'SHIFT'; // 'SHIFT' or 'MOVE'
let lastShift = null; // { dir, index }
let showInstructions = false;
let totalTreasures = 0;

function initGame() {
  // 1. Create Tiles
  const createTile = (type, rot, fixed = false) => ({
    type, rotation: rot, fixed, treasure: null, id: Math.random().toString(36).substr(2, 9)
  });

  board = Array(7).fill(null).map(() => Array(7).fill(null));

  // Fixed Tiles
  board[0][0] = createTile(TYPE_L, 1, true);
  board[0][6] = createTile(TYPE_L, 2, true);
  board[6][0] = createTile(TYPE_L, 0, true);
  board[6][6] = createTile(TYPE_L, 3, true);

  board[0][2] = createTile(TYPE_T, 2, true);
  board[0][4] = createTile(TYPE_T, 2, true);
  board[2][0] = createTile(TYPE_T, 1, true);
  board[2][2] = createTile(TYPE_T, 1, true);
  board[2][4] = createTile(TYPE_T, 3, true);
  board[2][6] = createTile(TYPE_T, 3, true);
  board[4][0] = createTile(TYPE_T, 1, true);
  board[4][2] = createTile(TYPE_T, 0, true);
  board[4][4] = createTile(TYPE_T, 3, true);
  board[4][6] = createTile(TYPE_T, 3, true);
  board[6][2] = createTile(TYPE_T, 0, true);
  board[6][4] = createTile(TYPE_T, 0, true);

  let deck = [];
  for (let i = 0; i < 12; i++) deck.push(TYPE_I);
  for (let i = 0; i < 16; i++) deck.push(TYPE_L);
  for (let i = 0; i < 6; i++) deck.push(TYPE_T);

  deck.sort(() => Math.random() - 0.5);

  let deckIdx = 0;
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      if (!board[y][x]) {
        const type = deck[deckIdx++];
        const rot = Math.floor(Math.random() * 4);
        board[y][x] = createTile(type, rot, false);
      }
    }
  }

  extraTile = createTile(deck[deckIdx], Math.floor(Math.random() * 4), false);

  const treasureTiles = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      if ((x === 0 && y === 0) || (x === 6 && y === 6)) continue;
      treasureTiles.push(board[y][x]);
    }
  }
  treasureTiles.push(extraTile);
  treasureTiles.sort(() => Math.random() - 0.5);

  TREASURES.forEach((t, i) => {
    if (i < treasureTiles.length) {
      treasureTiles[i].treasure = t;
      totalTreasures++;
    }
  });

  render();
}

function getConnections(tile) {
  const base = CONNECTIONS[tile.type];
  const rot = tile.rotation;
  const newConns = [...base];
  for (let i = 0; i < rot; i++) {
    const last = newConns.pop();
    newConns.unshift(last);
  }
  return newConns;
}

function canMove(x1, y1, x2, y2) {
  if (Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1) return false;

  const t1 = board[y1][x1];
  const t2 = board[y2][x2];
  const c1 = getConnections(t1);
  const c2 = getConnections(t2);

  let dir = -1;
  if (y2 < y1) dir = 0; // N
  else if (x2 > x1) dir = 1; // E
  else if (y2 > y1) dir = 2; // S
  else if (x2 < x1) dir = 3; // W

  if (!c1[dir]) return false;
  const opp = (dir + 2) % 4;
  if (!c2[opp]) return false;

  return true;
}

function getReachableTiles(startX, startY) {
  const visited = new Set();
  const queue = [[startX, startY]];
  visited.add(`${startX},${startY}`);
  const reachable = [];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    reachable.push({ x: cx, y: cy });

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];

      if (nx >= 0 && nx < 7 && ny >= 0 && ny < 7) {
        if (!visited.has(`${nx},${ny}`) && canMove(cx, cy, nx, ny)) {
          visited.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
    }
  }
  return reachable;
}

function shiftBoard(side, index) {
  if (phase !== 'SHIFT') return;

  if (lastShift) {
    const oppSide = (lastShift.side + 2) % 4;
    if (side === oppSide && index === lastShift.index) {
      showNotification("Cannot reverse the previous move immediately!");
      return;
    }
  }

  let newExtra = null;

  if (side === 0) { // Top -> Down
    newExtra = board[6][index];
    for (let y = 6; y > 0; y--) board[y][index] = board[y - 1][index];
    board[0][index] = extraTile;
    players.forEach(p => {
      if (p.x === index) {
        p.y++;
        if (p.y > 6) p.y = 0;
      }
    });
  } else if (side === 1) { // Right -> Left
    newExtra = board[index][0];
    for (let x = 0; x < 6; x++) board[index][x] = board[index][x + 1];
    board[index][6] = extraTile;
    players.forEach(p => {
      if (p.y === index) {
        p.x--;
        if (p.x < 0) p.x = 6;
      }
    });
  } else if (side === 2) { // Bottom -> Up
    newExtra = board[0][index];
    for (let y = 0; y < 6; y++) board[y][index] = board[y + 1][index];
    board[6][index] = extraTile;
    players.forEach(p => {
      if (p.x === index) {
        p.y--;
        if (p.y < 0) p.y = 6;
      }
    });
  } else if (side === 3) { // Left -> Right
    newExtra = board[index][6];
    for (let x = 6; x > 0; x--) board[index][x] = board[index][x - 1];
    board[index][0] = extraTile;
    players.forEach(p => {
      if (p.y === index) {
        p.x++;
        if (p.x > 6) p.x = 0;
      }
    });
  }

  extraTile = newExtra;
  lastShift = { side, index };
  phase = 'MOVE';
  render();
}

function movePlayer(tx, ty) {
  if (phase !== 'MOVE') return;
  const p = players[currentPlayerIndex];

  const reachable = getReachableTiles(p.x, p.y);
  const canReach = reachable.some(t => t.x === tx && t.y === ty);

  if (canReach) {
    p.x = tx;
    p.y = ty;

    const tile = board[ty][tx];
    if (tile.treasure) {
      p.score++;
      console.log(`Collected ${tile.treasure}!`);
      tile.treasure = null;

      if (p.score === totalTreasures) {
        showNotification("All treasure found, you win!");
      }
    }

    phase = 'SHIFT';
    render();
  }
}

function rotateExtraTile() {
  if (phase !== 'SHIFT') return;
  extraTile.rotation = (extraTile.rotation + 1) % 4;
  render();
}

function showNotification(message) {
  const app = document.getElementById('app');
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = message;
  app.appendChild(notif);

  // Remove after animation
  setTimeout(() => {
    notif.remove();
  }, 2000);
}

// --- Rendering ---

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  // Header
  const h1 = document.createElement('h1');
  h1.textContent = 'LABYRINTH';
  app.appendChild(h1);

  const container = document.createElement('div');
  container.className = 'game-container';
  app.appendChild(container);

  // Left Controls (Extra Tile)
  const controls = document.createElement('div');
  controls.className = 'controls';

  // Extra Tile Panel
  const extraContent = document.createElement('div');
  extraContent.className = 'panel extra-panel';

  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'NEXT TILE';
  extraContent.appendChild(title);

  const etDiv = document.createElement('div');
  etDiv.className = 'extra-tile';

  const etShape = document.createElement('div');
  etShape.className = `wall-shape shape-${extraTile.type}`;
  etShape.style.transform = `rotate(${extraTile.rotation * 90}deg)`;
  etDiv.appendChild(etShape);

  if (extraTile.treasure) {
    const tDiv = document.createElement('div');
    tDiv.className = 'treasure';
    tDiv.textContent = extraTile.treasure;
    tDiv.style.position = 'absolute';
    etDiv.appendChild(tDiv);
  }
  extraContent.appendChild(etDiv);

  const rotBtn = document.createElement('button');
  rotBtn.textContent = 'ROTATE';
  rotBtn.onclick = rotateExtraTile;
  rotBtn.disabled = phase !== 'SHIFT';
  extraContent.appendChild(rotBtn);

  controls.appendChild(extraContent);

  // Status Panel
  const statusContent = document.createElement('div');
  statusContent.className = 'panel status-panel';
  statusContent.innerHTML = `
    <div class="panel-title">STATUS</div>
    <div>PHASE: <span>${phase}</span></div>
    <div>SCORE: ${players[0].score} / ${totalTreasures}</div>
  `;

  const instrBtn = document.createElement('button');
  instrBtn.textContent = showInstructions ? 'HIDE INFO' : 'INSTRUCTIONS';
  instrBtn.style.marginTop = '1rem';
  instrBtn.style.fontSize = '1rem';
  instrBtn.onclick = () => {
    showInstructions = !showInstructions;
    render();
  };
  statusContent.appendChild(instrBtn);

  const instrDiv = document.createElement('div');
  instrDiv.className = `instructions ${showInstructions ? 'visible' : ''}`;
  instrDiv.innerHTML = `
    SHIFT: Click Arrows<br>
    ROTATE: [R] Key<br>
    MOVE: Click Cells
  `;
  statusContent.appendChild(instrDiv);

  controls.appendChild(statusContent);

  container.appendChild(controls);

  // Board Wrapper
  const boardWrapper = document.createElement('div');
  boardWrapper.className = 'board-wrapper';
  container.appendChild(boardWrapper);

  // Board
  const boardDiv = document.createElement('div');
  boardDiv.className = 'board';

  // Calculate reachable if moving
  let reachable = [];
  if (phase === 'MOVE') {
    reachable = getReachableTiles(players[0].x, players[0].y);
  }

  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const tile = board[y][x];
      const cell = document.createElement('div');
      cell.className = `cell ${tile.fixed ? 'fixed' : 'movable'}`;

      const isReachable = reachable.some(r => r.x === x && r.y === y);
      if (isReachable) {
        cell.classList.add('valid-move');
        cell.onclick = () => movePlayer(x, y);
      }
      if (x === players[0].x && y === players[0].y) {
        cell.classList.add('highlight');
      }

      const content = document.createElement('div');
      content.className = 'cell-content';

      const wallShape = document.createElement('div');
      wallShape.className = `wall-shape shape-${tile.type}`;
      wallShape.style.transform = `rotate(${tile.rotation * 90}deg)`;
      content.appendChild(wallShape);

      cell.appendChild(content);

      if (tile.treasure) {
        const tDiv = document.createElement('div');
        tDiv.className = 'cell-content treasure';
        tDiv.textContent = tile.treasure;
        cell.appendChild(tDiv);
      }

      players.forEach(p => {
        if (p.x === x && p.y === y) {
          const pDiv = document.createElement('div');
          pDiv.className = 'cell-content player';
          pDiv.textContent = p.char;
          cell.appendChild(pDiv);
        }
      });

      boardDiv.appendChild(cell);
    }
  }

  boardWrapper.appendChild(boardDiv);

  // Arrows
  const arrowIndices = [1, 3, 5];

  arrowIndices.forEach(i => {
    const disabled = phase !== 'SHIFT';
    const disabledClass = disabled ? ' disabled' : '';

    // Top
    const at = document.createElement('div');
    at.className = `arrow-btn arrow-top-${i}${disabledClass}`;
    at.textContent = '▼';
    at.onclick = () => !disabled && shiftBoard(0, i);
    boardWrapper.appendChild(at);

    // Bottom
    const ab = document.createElement('div');
    ab.className = `arrow-btn arrow-bottom-${i}${disabledClass}`;
    ab.textContent = '▲';
    ab.onclick = () => !disabled && shiftBoard(2, i);
    boardWrapper.appendChild(ab);

    // Left
    const al = document.createElement('div');
    al.className = `arrow-btn arrow-left-${i}${disabledClass}`;
    al.textContent = '▶';
    al.onclick = () => !disabled && shiftBoard(3, i);
    boardWrapper.appendChild(al);

    // Right
    const ar = document.createElement('div');
    ar.className = `arrow-btn arrow-right-${i}${disabledClass}`;
    ar.textContent = '◀';
    ar.onclick = () => !disabled && shiftBoard(1, i);
    boardWrapper.appendChild(ar);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    rotateExtraTile();
  }
});

initGame();
