import "./styles.css";
import {
  PIECE_TYPES,
  applyMove,
  chooseMove,
  coordinateKey,
  createInitialState,
  enumerateLegalActions,
  getStack,
  getTopPiece,
  occupiedCoordinates,
  sameCoordinate,
} from "./game/index.js";

const app = document.querySelector("#app");
const pieceNames = {
  queen: "Queen Bee",
  beetle: "Beetle",
  spider: "Spider",
  grasshopper: "Grasshopper",
  ant: "Soldier Ant",
};
const pieceColors = {
  queen: "#e6aa1f",
  beetle: "#8868ba",
  spider: "#aa602f",
  grasshopper: "#4c9b3d",
  ant: "#1888c7",
};

function bugIconMarkup(type) {
  const common = 'viewBox="0 0 64 64" aria-hidden="true"';
  if (type === "queen") {
    return `<svg ${common}><g fill="currentColor" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="19" cy="27" rx="8" ry="14" transform="rotate(-38 19 27)"/><ellipse cx="45" cy="27" rx="8" ry="14" transform="rotate(38 45 27)"/><ellipse cx="20" cy="43" rx="7" ry="12" transform="rotate(35 20 43)"/><ellipse cx="44" cy="43" rx="7" ry="12" transform="rotate(-35 44 43)"/><ellipse cx="32" cy="36" rx="9" ry="18"/><circle cx="32" cy="16" r="7"/><path d="M27 12 20 5M37 12l7-7M24 28 10 23M23 37 8 40M40 28l14-5M41 37l15 3"/></g></svg>`;
  }
  if (type === "beetle") {
    return `<svg ${common}><g fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="39" rx="17" ry="20"/><path d="M20 24c0-10 24-10 24 0l-4 7H24Z"/><path d="m25 19-9-9M39 19l9-9M18 31 7 25M16 42 5 46M46 31l11-6M48 42l11 4M32 25v33" fill="none"/></g></svg>`;
  }
  if (type === "spider") {
    return `<svg ${common}><g fill="currentColor" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="23" r="8"/><ellipse cx="32" cy="42" rx="12" ry="15"/><path d="M24 28 14 17 5 13M22 35 10 28 3 29M21 42 9 48 3 55M24 49 18 60M40 28l10-11 9-4M42 35l12-7 7 1M43 42l12 6 6 7M40 49l6 11" fill="none"/></g></svg>`;
  }
  if (type === "grasshopper") {
    return `<svg ${common}><g fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="35" rx="9" ry="21"/><path d="M23 19c3-11 15-11 18 0l-4 7H27Z"/><path d="M25 16 18 5M39 16l7-11M24 31 11 23M40 31l13-8M25 42 11 55H3M39 42l14 13h8" fill="none"/></g></svg>`;
  }
  return `<svg ${common}><g fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="49" rx="10" ry="12"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="15" r="9"/><path d="m27 8-8-5M37 8l8-5M26 28 14 19M25 34 11 37M38 28l12-9M39 34l14 3M28 39 18 51M36 39l10 12" fill="none"/></g></svg>`;
}

let state = createInitialState();
let mode = null;
let selected = null;
let online = {
  socket: null,
  code: null,
  player: null,
  players: 0,
  revision: 0,
  message: "",
};
let camera = { x: 0, y: 0, zoom: 1 };
let aiTimer = null;

function titleCase(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function isHumanTurn() {
  if (!mode) return false;
  if (mode === "local") return true;
  if (mode === "computer") return state.currentPlayer === "white";
  return online.player === state.currentPlayer && online.players === 2;
}

function legalActions() {
  return enumerateLegalActions(state);
}

function selectedActions() {
  const actions = legalActions();
  if (!selected) return [];
  if (selected.kind === "place") {
    return actions.filter(
      (action) => action.kind === "place" && action.type === selected.type,
    );
  }
  return actions.filter(
    (action) =>
      action.kind === "move" && sameCoordinate(action.from, selected.from),
  );
}

function statusText() {
  if (state.status === "won") {
    return `${titleCase(state.winner)} wins by surrounding the opposing Queen.`;
  }
  if (state.status === "draw") {
    return state.drawReason === "repetition"
      ? "Draw — the same board position occurred three times."
      : "Draw — both Queens were surrounded at the same time.";
  }
  if (mode === "online" && online.players < 2) {
    return "Waiting for another player to join the room.";
  }
  if (mode === "computer" && state.currentPlayer === "black") {
    return "The computer is considering its move…";
  }
  const actions = legalActions();
  if (actions.length === 1 && actions[0].kind === "pass") {
    return `${titleCase(state.currentPlayer)} has no legal move and must pass.`;
  }
  if (!isHumanTurn()) return `Waiting for ${titleCase(state.currentPlayer)}.`;
  if (selected?.kind === "place") {
    return `Choose a highlighted space for the ${pieceNames[selected.type]}.`;
  }
  if (selected?.kind === "move") {
    return `Choose a highlighted destination for the ${pieceNames[selected.type]}.`;
  }
  return `${titleCase(state.currentPlayer)} to move. Select a piece from the tray or board.`;
}

function playerLabel(color) {
  if (mode === "computer") return color === "white" ? "You" : "Computer";
  if (mode === "online") {
    if (online.player === color) return "You";
    return online.players === 2 ? "Opponent" : "Waiting…";
  }
  return color === "white" ? "Player 1" : "Player 2";
}

function inventoryMarkup(color) {
  return PIECE_TYPES.map((type) => {
    const count = state.inventories[color][type];
    const canSelect =
      isHumanTurn() &&
      state.currentPlayer === color &&
      count > 0 &&
      legalActions().some(
        (action) => action.kind === "place" && action.type === type,
      );
    const active = selected?.kind === "place" && selected.type === type;
    return `
      <button class="piece-button ${color} ${active ? "selected" : ""}"
        data-piece="${type}" data-color="${color}"
        aria-label="${pieceNames[type]}, ${count} remaining"
        ${canSelect ? "" : "disabled"}>
        <span class="piece-symbol">${bugIconMarkup(type)}</span>
        <span class="piece-name">${pieceNames[type]}</span>
        <span class="piece-count">×${count}</span>
      </button>`;
  }).join("");
}

function playerPanel(color) {
  const active = state.status === "active" && state.currentPlayer === color;
  return `
    <aside class="side-panel">
      <section class="player-card ${active ? "active" : ""}">
        <div class="player-heading">
          <h2>${playerLabel(color)} · ${titleCase(color)}</h2>
          ${active ? '<span class="turn-badge">Turn</span>' : ""}
        </div>
        <div class="inventory">${inventoryMarkup(color)}</div>
      </section>
      ${
        color === "black"
          ? `<div class="status" role="status">${statusText()}</div>${onlineMarkup()}`
          : ""
      }
    </aside>`;
}

function onlineMarkup() {
  if (mode !== "online") return "";
  return `
    <div class="status">
      <span class="connection ${online.socket?.readyState === WebSocket.OPEN ? "connected" : ""}">
        ${online.socket?.readyState === WebSocket.OPEN ? "Connected" : "Disconnected"}
      </span>
      <div class="room-code">${online.code || "-----"}</div>
      <div>${online.players}/2 players${online.message ? ` · ${online.message}` : ""}</div>
    </div>`;
}

function modeModal() {
  return `
    <div class="modal-backdrop" id="mode-modal">
      <section class="modal" aria-labelledby="mode-title">
        <h2 id="mode-title">Choose how to play</h2>
        <p>Play the complete base game of Hive. Surround the opposing Queen while keeping every tile connected in one hive.</p>
        <div class="mode-grid">
          <button class="mode-card" data-mode="local">
            <span class="mode-icon">↔</span>
            <strong>Pass & play</strong>
            <span>Two people take turns on this device.</span>
          </button>
          <button class="mode-card" data-mode="computer">
            <span class="mode-icon">⌁</span>
            <strong>Vs computer</strong>
            <span>Play White against a tactical opponent.</span>
          </button>
          <button class="mode-card" data-mode="online">
            <span class="mode-icon">◎</span>
            <strong>Online room</strong>
            <span>Create or join a private room with a friend.</span>
          </button>
        </div>
        <div class="online-panel hidden" id="online-panel">
          <div class="dialog-actions">
            <button class="button primary" id="create-room">Create room</button>
            <span>or join with a code</span>
          </div>
          <form class="online-form" id="join-form">
            <label class="sr-only" for="room-input">Room code</label>
            <input id="room-input" maxlength="5" autocomplete="off" placeholder="ROOM CODE">
            <button class="button" type="submit">Join room</button>
          </form>
          <p class="status hidden" id="online-error" role="alert"></p>
        </div>
      </section>
    </div>`;
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">H</span>
          <div><h1>HIVE</h1><p>No board. No boundaries. One hive.</p></div>
        </div>
        <div class="header-actions">
          <button class="button" id="rules-button">How to play</button>
          <button class="button danger" id="new-game">New game</button>
        </div>
      </header>
      <main class="game-layout">
        ${playerPanel("white")}
        <section class="board-wrap">
          <canvas id="board" aria-label="Hive game board"></canvas>
          <div class="board-toolbar">
            <button class="icon-button" id="zoom-out" aria-label="Zoom out">−</button>
            <button class="icon-button" id="center-board" aria-label="Center board">⌾</button>
            <button class="icon-button" id="zoom-in" aria-label="Zoom in">+</button>
          </div>
        </section>
        ${playerPanel("black")}
      </main>
    </div>
    ${mode ? "" : modeModal()}
    <div class="modal-backdrop hidden" id="rules-modal">
      <section class="modal" aria-labelledby="rules-title">
        <h2 id="rules-title">How to play</h2>
        <p>Surround your opponent’s Queen Bee on all six sides. Tiles may belong to either player when the Queen is surrounded.</p>
        <p><strong>Placement:</strong> after your opening tile, new tiles may touch your color but not your opponent’s. Your Queen must be placed by your fourth turn, and your pieces cannot move before she is placed.</p>
        <p><strong>Movement:</strong> the hive must stay connected. Queen moves one space; Beetle moves one space and can climb; Grasshopper jumps in a straight line; Spider moves exactly three spaces; Ant moves any distance around the hive.</p>
        <div class="dialog-actions"><button class="button primary" id="close-rules">Got it</button></div>
      </section>
    </div>`;

  bindUi();
  drawBoard();
  maybeContinueTurn();
}

function bindUi() {
  document.querySelectorAll("[data-piece]").forEach((button) => {
    button.addEventListener("click", () => {
      selected = { kind: "place", type: button.dataset.piece };
      render();
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.mode === "online") {
        document.querySelector("#online-panel").classList.remove("hidden");
        return;
      }
      beginGame(button.dataset.mode);
    });
  });

  document.querySelector("#new-game").addEventListener("click", resetGame);
  document.querySelector("#rules-button").addEventListener("click", () => {
    document.querySelector("#rules-modal").classList.remove("hidden");
  });
  document.querySelector("#close-rules").addEventListener("click", () => {
    document.querySelector("#rules-modal").classList.add("hidden");
  });
  document.querySelector("#zoom-in").addEventListener("click", () => zoomBy(1.16));
  document.querySelector("#zoom-out").addEventListener("click", () => zoomBy(1 / 1.16));
  document.querySelector("#center-board").addEventListener("click", () => {
    camera = { x: 0, y: 0, zoom: 1 };
    drawBoard();
  });

  const createButton = document.querySelector("#create-room");
  if (createButton) createButton.addEventListener("click", () => connectOnline("create"));
  const joinForm = document.querySelector("#join-form");
  if (joinForm) {
    joinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      connectOnline("join", document.querySelector("#room-input").value);
    });
  }
  bindCanvas();
}

function beginGame(nextMode) {
  clearTimeout(aiTimer);
  state = createInitialState();
  mode = nextMode;
  selected = null;
  camera = { x: 0, y: 0, zoom: 1 };
  render();
}

function resetGame() {
  clearTimeout(aiTimer);
  online.socket?.close();
  online = {
    socket: null,
    code: null,
    player: null,
    players: 0,
    revision: 0,
    message: "",
  };
  mode = null;
  state = createInitialState();
  selected = null;
  render();
}

function showOnlineError(message) {
  const error = document.querySelector("#online-error");
  if (!error) return;
  error.textContent = message;
  error.classList.remove("hidden");
}

function connectOnline(action, code = "") {
  if (online.socket && online.socket.readyState < WebSocket.CLOSING) {
    online.socket.close();
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
  online.socket = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: action, code: code.trim().toUpperCase() }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "joined") {
      mode = "online";
      online.code = message.code;
      online.player = message.player;
      online.players = message.players;
      online.revision = message.revision;
      online.message = "";
      state = message.state;
      selected = null;
      render();
    } else if (message.type === "presence") {
      online.players = message.players;
      online.message = message.players === 2 ? "Game ready" : "Opponent left";
      render();
    } else if (message.type === "state") {
      state = message.state;
      online.revision = message.revision;
      selected = null;
      render();
    } else if (message.type === "error") {
      if (!mode) showOnlineError(message.message);
      else {
        online.message = message.message;
        render();
      }
    }
  });
  socket.addEventListener("close", () => {
    if (mode === "online") {
      online.message = "Connection closed";
      render();
    } else {
      showOnlineError("Could not reach the game server. Run npm run build, then npm start.");
    }
  });
}

function performAction(action) {
  if (!action || state.status !== "active") return;
  if (mode === "online") {
    online.socket.send(
      JSON.stringify({
        type: "action",
        action,
        revision: online.revision + 1,
      }),
    );
    return;
  }
  state = applyMove(state, action);
  selected = null;
  render();
}

function maybeContinueTurn() {
  clearTimeout(aiTimer);
  if (!mode || state.status !== "active") return;
  const actions = legalActions();
  if (actions.length === 1 && actions[0].kind === "pass") {
    if (mode !== "online" || isHumanTurn()) {
      aiTimer = setTimeout(() => performAction(actions[0]), 650);
    }
    return;
  }
  if (mode === "computer" && state.currentPlayer === "black") {
    aiTimer = setTimeout(() => performAction(chooseMove(state, "black")), 520);
  }
}

function zoomBy(factor) {
  camera.zoom = Math.max(0.55, Math.min(1.8, camera.zoom * factor));
  drawBoard();
}

function axialToPixel(coord, size, center) {
  return {
    x: center.x + size * 1.5 * coord.q,
    y: center.y + size * Math.sqrt(3) * (coord.r + coord.q / 2),
  };
}

function cubeRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
  else if (rDiff > sDiff) rr = -rq - rs;
  return { q: rq, r: rr };
}

function pixelToAxial(point, size, center) {
  const x = point.x - center.x;
  const y = point.y - center.y;
  return cubeRound((2 / 3) * x / size, (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size);
}

function hexPath(context, x, y, size) {
  context.beginPath();
  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 180) * (60 * corner);
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (corner === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function pieceSeed(piece) {
  let hash = 2166136261;
  for (const character of piece.id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function drawTileTexture(context, piece, x, y, size) {
  const ink = piece.color === "white" ? "37, 38, 30" : "245, 236, 209";
  let seed = pieceSeed(piece);
  const random = () => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return (seed >>> 0) / 4294967296;
  };

  context.save();
  hexPath(context, x, y, size * 0.89);
  context.clip();

  for (let index = 0; index < 24; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * size * 0.76;
    context.beginPath();
    context.arc(
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      Math.max(0.55, size * (0.012 + random() * 0.014)),
      0,
      Math.PI * 2,
    );
    context.fillStyle = `rgba(${ink}, ${0.035 + random() * 0.055})`;
    context.fill();
  }

  const sheen = context.createLinearGradient(
    x - size,
    y - size,
    x + size,
    y + size,
  );
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.13)");
  sheen.addColorStop(0.42, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(1, "rgba(0, 0, 0, 0.1)");
  context.fillStyle = sheen;
  context.fillRect(x - size, y - size, size * 2, size * 2);
  context.restore();
}

function drawBugIcon(context, piece, x, y, size) {
  context.save();
  context.translate(x - size / 2, y - size / 2);
  context.scale(size / 64, size / 64);
  context.fillStyle = pieceColors[piece.type];
  context.strokeStyle = pieceColors[piece.type];
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";

  const ellipse = (cx, cy, rx, ry, fill = true) => {
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill) context.fill();
    context.stroke();
  };
  const rotatedEllipse = (cx, cy, rx, ry, rotation) => {
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };
  const line = (...points) => {
    context.beginPath();
    context.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) {
      context.lineTo(points[index], points[index + 1]);
    }
    context.stroke();
  };

  if (piece.type === "queen") {
    rotatedEllipse(19, 27, 8, 14, -0.66);
    rotatedEllipse(45, 27, 8, 14, 0.66);
    rotatedEllipse(20, 43, 7, 12, 0.61);
    rotatedEllipse(44, 43, 7, 12, -0.61);
    ellipse(32, 36, 9, 18);
    ellipse(32, 16, 7, 7);
    line(27, 12, 20, 5);
    line(37, 12, 44, 5);
    line(24, 28, 10, 23);
    line(23, 37, 8, 40);
    line(40, 28, 54, 23);
    line(41, 37, 56, 40);
  } else if (piece.type === "beetle") {
    ellipse(32, 39, 17, 20);
    context.beginPath();
    context.moveTo(20, 24);
    context.bezierCurveTo(20, 14, 44, 14, 44, 24);
    context.lineTo(40, 31);
    context.lineTo(24, 31);
    context.closePath();
    context.fill();
    context.stroke();
    line(25, 19, 16, 10);
    line(39, 19, 48, 10);
    line(18, 31, 7, 25);
    line(16, 42, 5, 46);
    line(46, 31, 57, 25);
    line(48, 42, 59, 46);
    context.strokeStyle = piece.color === "white" ? "#eee4c8" : "#33352b";
    context.lineWidth = 3;
    line(32, 25, 32, 58);
  } else if (piece.type === "spider") {
    ellipse(32, 23, 8, 8);
    ellipse(32, 42, 12, 15);
    context.lineWidth = 5;
    line(24, 28, 14, 17, 5, 13);
    line(22, 35, 10, 28, 3, 29);
    line(21, 42, 9, 48, 3, 55);
    line(24, 49, 18, 60);
    line(40, 28, 50, 17, 59, 13);
    line(42, 35, 54, 28, 61, 29);
    line(43, 42, 55, 48, 61, 55);
    line(40, 49, 46, 60);
  } else if (piece.type === "grasshopper") {
    ellipse(32, 35, 9, 21);
    context.beginPath();
    context.moveTo(23, 19);
    context.bezierCurveTo(26, 8, 38, 8, 41, 19);
    context.lineTo(37, 26);
    context.lineTo(27, 26);
    context.closePath();
    context.fill();
    context.stroke();
    line(25, 16, 18, 5);
    line(39, 16, 46, 5);
    line(24, 31, 11, 23);
    line(40, 31, 53, 23);
    context.lineWidth = 5;
    line(25, 42, 11, 55, 3, 55);
    line(39, 42, 53, 55, 61, 55);
  } else {
    ellipse(32, 49, 10, 12);
    ellipse(32, 32, 8, 8);
    ellipse(32, 15, 9, 9);
    line(27, 8, 19, 3);
    line(37, 8, 45, 3);
    line(26, 28, 14, 19);
    line(25, 34, 11, 37);
    line(38, 28, 50, 19);
    line(39, 34, 53, 37);
    line(28, 39, 18, 51);
    line(36, 39, 46, 51);
  }

  context.restore();
}

function boardCoordinates() {
  const cells = new Map();
  const occupied = occupiedCoordinates(state);
  const actions = selectedActions();
  const seed = occupied.length ? occupied : [{ q: 0, r: 0 }];
  for (const coord of seed) cells.set(coordinateKey(coord), coord);
  for (const action of actions) cells.set(coordinateKey(action.to), action.to);
  return { cells: [...cells.values()], actions };
}

function drawBoard() {
  const canvas = document.querySelector("#board");
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
  canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const size = Math.max(29, Math.min(48, Math.min(bounds.width, bounds.height) / 10)) * camera.zoom;
  const center = {
    x: bounds.width / 2 + camera.x,
    y: bounds.height / 2 + camera.y,
  };
  const { cells, actions } = boardCoordinates();
  const destinations = new Set(actions.map((action) => coordinateKey(action.to)));
  const selectedKey = selected?.from ? coordinateKey(selected.from) : null;

  for (const coord of cells) {
    const point = axialToPixel(coord, size, center);
    const key = coordinateKey(coord);
    const stack = getStack(state, coord);
    const piece = stack[stack.length - 1];
    const destination = destinations.has(key);
    const isSelected = key === selectedKey;

    if (!piece && !destination) continue;
    hexPath(context, point.x, point.y, size * 0.93);
    if (piece) {
      context.fillStyle = piece.color === "white" ? "#eee4c8" : "#33352b";
      context.fill();
      drawTileTexture(context, piece, point.x, point.y, size);
      hexPath(context, point.x, point.y, size * 0.93);
      context.lineWidth = isSelected ? 4 : 2;
      context.strokeStyle = isSelected ? "#e8ae3d" : piece.color === "white" ? "#aa9b78" : "#11130e";
      context.stroke();
      if (stack.length > 1) {
        context.lineWidth = 3;
        context.strokeStyle = "#e8ae3d";
        context.stroke();
      }
      drawBugIcon(context, piece, point.x, point.y, size * 1.22);
      if (stack.length > 1) {
        context.font = `700 ${Math.max(9, size * 0.2)}px system-ui`;
        context.fillStyle = "#e8ae3d";
        context.fillText(String(stack.length), point.x + size * 0.48, point.y - size * 0.48);
      }
    } else {
      context.fillStyle = "rgba(232, 174, 61, 0.2)";
      context.fill();
      context.setLineDash([5, 5]);
      context.lineWidth = 2;
      context.strokeStyle = "#e8ae3d";
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(point.x, point.y, 4, 0, Math.PI * 2);
      context.fillStyle = "#e8ae3d";
      context.fill();
    }
  }
}

function bindCanvas() {
  const canvas = document.querySelector("#board");
  if (!canvas) return;
  let pointer = null;

  canvas.addEventListener("pointerdown", (event) => {
    pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      dragged: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.hypot(dx, dy) > 5) pointer.dragged = true;
    if (pointer.dragged) {
      camera.x = pointer.cameraX + dx;
      camera.y = pointer.cameraY + dy;
      canvas.classList.add("dragging");
      drawBoard();
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    canvas.classList.remove("dragging");
    if (!pointer.dragged) handleBoardClick(event);
    pointer = null;
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });
}

function handleBoardClick(event) {
  if (!isHumanTurn() || state.status !== "active") return;
  const canvas = document.querySelector("#board");
  const bounds = canvas.getBoundingClientRect();
  const size = Math.max(29, Math.min(48, Math.min(bounds.width, bounds.height) / 10)) * camera.zoom;
  const center = {
    x: bounds.width / 2 + camera.x,
    y: bounds.height / 2 + camera.y,
  };
  const coord = pixelToAxial(
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    size,
    center,
  );
  const destination = selectedActions().find((action) => sameCoordinate(action.to, coord));
  if (destination) {
    performAction(destination);
    return;
  }
  const piece = getTopPiece(state, coord);
  if (piece?.color === state.currentPlayer) {
    const canMove = legalActions().some(
      (action) => action.kind === "move" && sameCoordinate(action.from, coord),
    );
    if (canMove) {
      selected = { kind: "move", from: coord, type: piece.type };
      render();
      return;
    }
  }
  selected = null;
  render();
}

window.addEventListener("resize", drawBoard);
render();
