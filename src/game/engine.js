import {
  BASE_INVENTORY,
  COLORS,
  DIRECTIONS,
  PIECE_TYPES,
  otherColor,
} from "./constants.js";
import {
  addCoordinates,
  axialDistance,
  coordinate,
  coordinateKey,
  neighbors,
  parseCoordinateKey,
  sameCoordinate,
} from "./coordinates.js";

function copyInventory(inventory) {
  return Object.fromEntries(
    COLORS.map((color) => [color, { ...inventory[color] }]),
  );
}

export function cloneState(state) {
  return {
    version: state.version,
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    turns: { ...state.turns },
    inventories: copyInventory(state.inventories),
    board: Object.fromEntries(
      Object.entries(state.board).map(([key, stack]) => [
        key,
        stack.map((piece) => ({ ...piece })),
      ]),
    ),
    status: state.status,
    winner: state.winner,
    lastAction: state.lastAction
      ? JSON.parse(JSON.stringify(state.lastAction))
      : null,
  };
}

export function createInitialState(options = {}) {
  const firstPlayer = options.firstPlayer ?? "white";
  assertColor(firstPlayer);
  return {
    version: 1,
    currentPlayer: firstPlayer,
    moveNumber: 0,
    turns: { white: 0, black: 0 },
    inventories: {
      white: { ...BASE_INVENTORY },
      black: { ...BASE_INVENTORY },
    },
    board: {},
    status: "active",
    winner: null,
    lastAction: null,
  };
}

export function serializeState(state) {
  validateState(state);
  return JSON.stringify(state);
}

export function deserializeState(json) {
  const state = typeof json === "string" ? JSON.parse(json) : json;
  validateState(state);
  return cloneState(state);
}

export function getStack(state, coord) {
  return state.board[coordinateKey(coord)] ?? [];
}

export function getTopPiece(state, coord) {
  const stack = getStack(state, coord);
  return stack[stack.length - 1] ?? null;
}

export function occupiedCoordinates(state) {
  return Object.keys(state.board)
    .filter((key) => state.board[key].length > 0)
    .map(parseCoordinateKey);
}

export function findPiece(state, pieceId) {
  for (const [key, stack] of Object.entries(state.board)) {
    const level = stack.findIndex((piece) => piece.id === pieceId);
    if (level !== -1) {
      return {
        coord: parseCoordinateKey(key),
        level,
        piece: stack[level],
      };
    }
  }
  return null;
}

export function findQueen(state, color) {
  assertColor(color);
  for (const [key, stack] of Object.entries(state.board)) {
    const level = stack.findIndex(
      (piece) => piece.color === color && piece.type === "queen",
    );
    if (level !== -1) {
      return {
        coord: parseCoordinateKey(key),
        level,
        piece: stack[level],
      };
    }
  }
  return null;
}

export function isQueenPlaced(state, color) {
  return findQueen(state, color) !== null;
}

export function isQueenSurrounded(state, color) {
  const queen = findQueen(state, color);
  return (
    queen !== null &&
    neighbors(queen.coord).every((coord) => getStack(state, coord).length > 0)
  );
}

export function getGameResult(state) {
  const whiteSurrounded = isQueenSurrounded(state, "white");
  const blackSurrounded = isQueenSurrounded(state, "black");
  if (whiteSurrounded && blackSurrounded) {
    return { status: "draw", winner: null };
  }
  if (whiteSurrounded) {
    return { status: "won", winner: "black" };
  }
  if (blackSurrounded) {
    return { status: "won", winner: "white" };
  }
  return { status: "active", winner: null };
}

function assertColor(color) {
  if (!COLORS.includes(color)) {
    throw new TypeError(`Unknown color: ${color}`);
  }
}

function assertPieceType(type) {
  if (!PIECE_TYPES.includes(type)) {
    throw new TypeError(`Unknown piece type: ${type}`);
  }
}

function assertCoordinateValue(coord, name = "coordinate") {
  if (
    coord === null ||
    typeof coord !== "object" ||
    !Number.isInteger(coord.q) ||
    !Number.isInteger(coord.r)
  ) {
    throw new TypeError(`${name} must contain integer q and r values`);
  }
}

export function validateState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("State must be an object");
  }
  if (state.version !== 1) {
    throw new TypeError(`Unsupported state version: ${state.version}`);
  }
  assertColor(state.currentPlayer);
  if (!Number.isInteger(state.moveNumber) || state.moveNumber < 0) {
    throw new TypeError("moveNumber must be a non-negative integer");
  }
  for (const color of COLORS) {
    if (!Number.isInteger(state.turns?.[color]) || state.turns[color] < 0) {
      throw new TypeError(`Invalid turn count for ${color}`);
    }
    for (const type of PIECE_TYPES) {
      const count = state.inventories?.[color]?.[type];
      if (
        !Number.isInteger(count) ||
        count < 0 ||
        count > BASE_INVENTORY[type]
      ) {
        throw new TypeError(`Invalid ${color} ${type} inventory`);
      }
    }
  }
  if (
    state.board === null ||
    typeof state.board !== "object" ||
    Array.isArray(state.board)
  ) {
    throw new TypeError("board must be an object");
  }
  const ids = new Set();
  const pieceCounts = Object.fromEntries(
    COLORS.map((color) => [
      color,
      Object.fromEntries(PIECE_TYPES.map((type) => [type, 0])),
    ]),
  );
  for (const [key, stack] of Object.entries(state.board)) {
    const coord = parseCoordinateKey(key);
    if (coordinateKey(coord) !== key || !Array.isArray(stack) || !stack.length) {
      throw new TypeError(`Invalid stack at ${key}`);
    }
    for (let level = 0; level < stack.length; level += 1) {
      const piece = stack[level];
      assertColor(piece.color);
      assertPieceType(piece.type);
      if (level > 0 && piece.type !== "beetle") {
        throw new TypeError("Only beetles may occupy elevated stack levels");
      }
      if (typeof piece.id !== "string" || !piece.id || ids.has(piece.id)) {
        throw new TypeError("Piece IDs must be unique non-empty strings");
      }
      ids.add(piece.id);
      pieceCounts[piece.color][piece.type] += 1;
    }
  }
  for (const color of COLORS) {
    for (const type of PIECE_TYPES) {
      if (
        pieceCounts[color][type] + state.inventories[color][type] !==
        BASE_INVENTORY[type]
      ) {
        throw new TypeError(`Board and inventory disagree for ${color} ${type}`);
      }
    }
  }
  if (!["active", "won", "draw"].includes(state.status)) {
    throw new TypeError(`Invalid game status: ${state.status}`);
  }
  if (state.winner !== null) assertColor(state.winner);
  if (
    (state.status === "won" && state.winner === null) ||
    (state.status !== "won" && state.winner !== null)
  ) {
    throw new TypeError("winner must be set exactly when status is won");
  }
  return true;
}

function topColor(state, coord) {
  return getTopPiece(state, coord)?.color ?? null;
}

function playerHasBoardPiece(state, color) {
  return Object.values(state.board).some((stack) =>
    stack.some((piece) => piece.color === color),
  );
}

function placementCoordinates(state, color) {
  const occupied = occupiedCoordinates(state);
  if (occupied.length === 0) return [coordinate(0, 0)];

  const candidates = new Map();
  for (const coord of occupied) {
    for (const adjacent of neighbors(coord)) {
      if (getStack(state, adjacent).length === 0) {
        candidates.set(coordinateKey(adjacent), adjacent);
      }
    }
  }

  if (!playerHasBoardPiece(state, color)) {
    return [...candidates.values()];
  }

  return [...candidates.values()].filter((candidate) => {
    const touchingColors = neighbors(candidate)
      .filter((coord) => getStack(state, coord).length > 0)
      .map((coord) => topColor(state, coord));
    return (
      touchingColors.includes(color) &&
      touchingColors.every((touchingColor) => touchingColor === color)
    );
  });
}

function availablePlacementTypes(state, color) {
  const available = PIECE_TYPES.filter(
    (type) => state.inventories[color][type] > 0,
  );
  if (!isQueenPlaced(state, color) && state.turns[color] >= 3) {
    return available.includes("queen") ? ["queen"] : [];
  }
  return available;
}

export function enumerateLegalPlacements(state, color = state.currentPlayer) {
  assertColor(color);
  if (state.status !== "active") return [];
  const destinations = placementCoordinates(state, color);
  const actions = [];
  for (const type of availablePlacementTypes(state, color)) {
    for (const to of destinations) {
      actions.push({ kind: "place", color, type, to: { ...to } });
    }
  }
  return sortActions(actions);
}

function boardAfterRemovingTop(state, from) {
  const board = Object.fromEntries(
    Object.entries(state.board).map(([key, stack]) => [key, [...stack]]),
  );
  const key = coordinateKey(from);
  const stack = board[key];
  stack.pop();
  if (stack.length === 0) delete board[key];
  return board;
}

function boardStack(board, coord) {
  return board[coordinateKey(coord)] ?? [];
}

function boardOccupied(board, coord) {
  return boardStack(board, coord).length > 0;
}

function occupiedBoardIsConnected(board) {
  const keys = Object.keys(board).filter((key) => board[key].length > 0);
  if (keys.length <= 1) return true;
  const seen = new Set([keys[0]]);
  const queue = [parseCoordinateKey(keys[0])];
  while (queue.length) {
    const current = queue.shift();
    for (const adjacent of neighbors(current)) {
      const key = coordinateKey(adjacent);
      if (board[key]?.length && !seen.has(key)) {
        seen.add(key);
        queue.push(adjacent);
      }
    }
  }
  return seen.size === keys.length;
}

function touchesHive(board, coord) {
  return neighbors(coord).some((adjacent) => boardOccupied(board, adjacent));
}

function directionIndex(from, to) {
  return DIRECTIONS.findIndex((direction) =>
    sameCoordinate(addCoordinates(from, direction), to),
  );
}

function gateFlanks(from, to) {
  const index = directionIndex(from, to);
  if (index === -1) return null;
  return [
    addCoordinates(from, DIRECTIONS[(index + 5) % 6]),
    addCoordinates(from, DIRECTIONS[(index + 1) % 6]),
  ];
}

function canSlide(board, from, to, level = 1) {
  const flanks = gateFlanks(from, to);
  if (!flanks) return false;
  return !flanks.every(
    (coord) => boardStack(board, coord).length >= level,
  );
}

function groundSlideDestinations(board, from) {
  return neighbors(from).filter(
    (to) =>
      !boardOccupied(board, to) &&
      touchesHive(board, to) &&
      canSlide(board, from, to),
  );
}

function queenDestinations(board, from) {
  return groundSlideDestinations(board, from);
}

function beetleDestinations(board, from, sourceHeight) {
  return neighbors(from).filter((to) => {
    if (!boardOccupied(board, to) && !touchesHive(board, to)) return false;
    const destinationHeight = boardStack(board, to).length;
    const movementLevel = Math.max(sourceHeight, destinationHeight + 1);
    return canSlide(board, from, to, movementLevel);
  });
}

function grasshopperDestinations(board, from) {
  const destinations = [];
  for (const direction of DIRECTIONS) {
    let cursor = addCoordinates(from, direction);
    if (!boardOccupied(board, cursor)) continue;
    do {
      cursor = addCoordinates(cursor, direction);
    } while (boardOccupied(board, cursor));
    destinations.push(cursor);
  }
  return destinations;
}

function spiderDestinations(board, from) {
  const destinations = new Map();
  const visited = new Set([coordinateKey(from)]);

  function walk(current, remaining) {
    if (remaining === 0) {
      destinations.set(coordinateKey(current), current);
      return;
    }
    for (const next of groundSlideDestinations(board, current)) {
      const key = coordinateKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      walk(next, remaining - 1);
      visited.delete(key);
    }
  }

  walk(from, 3);
  return [...destinations.values()];
}

function antDestinations(board, from) {
  const destinations = new Map();
  const queue = [from];
  const seen = new Set([coordinateKey(from)]);
  while (queue.length) {
    const current = queue.shift();
    for (const next of groundSlideDestinations(board, current)) {
      const key = coordinateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      destinations.set(key, next);
      queue.push(next);
    }
  }
  return [...destinations.values()];
}

function destinationsForPiece(board, from, piece, sourceHeight) {
  switch (piece.type) {
    case "queen":
      return queenDestinations(board, from);
    case "beetle":
      return beetleDestinations(board, from, sourceHeight);
    case "grasshopper":
      return grasshopperDestinations(board, from);
    case "spider":
      return spiderDestinations(board, from);
    case "ant":
      return antDestinations(board, from);
    default:
      return [];
  }
}

export function enumerateLegalPieceMoves(state, color = state.currentPlayer) {
  assertColor(color);
  if (state.status !== "active" || !isQueenPlaced(state, color)) return [];

  const actions = [];
  for (const [key, stack] of Object.entries(state.board)) {
    const piece = stack[stack.length - 1];
    if (piece.color !== color) continue;
    const from = parseCoordinateKey(key);
    const board = boardAfterRemovingTop(state, from);
    if (!occupiedBoardIsConnected(board)) continue;

    const destinations = destinationsForPiece(
      board,
      from,
      piece,
      stack.length,
    );
    for (const to of destinations) {
      actions.push({
        kind: "move",
        color,
        pieceId: piece.id,
        type: piece.type,
        from: { ...from },
        to: { ...to },
      });
    }
  }
  return sortActions(actions);
}

function enumerateRawActions(state, color) {
  return sortActions([
    ...enumerateLegalPlacements(state, color),
    ...enumerateLegalPieceMoves(state, color),
  ]);
}

export function enumerateLegalActions(state, color = state.currentPlayer) {
  assertColor(color);
  if (state.status !== "active") return [];
  const actions = enumerateRawActions(state, color);
  return actions.length ? actions : [{ kind: "pass", color }];
}

export const enumerateLegalMoves = enumerateLegalPieceMoves;

function actionSortKey(action) {
  if (action.kind === "pass") return `pass|${action.color ?? ""}`;
  const from = action.from
    ? `${action.from.q.toString().padStart(5, "0")},${action.from.r
        .toString()
        .padStart(5, "0")}`
    : "";
  return [
    action.kind,
    action.type ?? "",
    from,
    action.to.q.toString().padStart(5, "0"),
    action.to.r.toString().padStart(5, "0"),
  ].join("|");
}

export function sortActions(actions) {
  return [...actions].sort((a, b) =>
    actionSortKey(a).localeCompare(actionSortKey(b)),
  );
}

function requestedActionMatches(legal, requested) {
  if (legal.kind !== requested.kind) return false;
  if (legal.kind === "pass") {
    return !requested.color || legal.color === requested.color;
  }
  if (!sameCoordinate(legal.to, requested.to)) return false;
  if (legal.kind === "place") return legal.type === requested.type;
  if (!sameCoordinate(legal.from, requested.from)) return false;
  return !requested.pieceId || legal.pieceId === requested.pieceId;
}

function nextPieceId(state, color, type) {
  const number = BASE_INVENTORY[type] - state.inventories[color][type] + 1;
  return `${color}-${type}-${number}`;
}

function placeCanonicalAction(next, action) {
  const key = coordinateKey(action.to);
  const piece = {
    id: nextPieceId(next, action.color, action.type),
    color: action.color,
    type: action.type,
  };
  next.board[key] = [piece];
  next.inventories[action.color][action.type] -= 1;
  return { ...action, pieceId: piece.id };
}

function moveCanonicalAction(next, action) {
  const fromKey = coordinateKey(action.from);
  const toKey = coordinateKey(action.to);
  const source = next.board[fromKey];
  const piece = source.pop();
  if (!source.length) delete next.board[fromKey];
  if (!next.board[toKey]) next.board[toKey] = [];
  next.board[toKey].push(piece);
  return action;
}

export function applyMove(state, action) {
  validateState(state);
  if (state.status !== "active") {
    throw new Error("The game is already over");
  }
  if (action === null || typeof action !== "object") {
    throw new TypeError("Action must be an object");
  }
  if (!["place", "move", "pass"].includes(action.kind)) {
    throw new TypeError("Action kind must be place, move, or pass");
  }
  if (action.kind === "place") {
    assertCoordinateValue(action.to, "action.to");
    assertPieceType(action.type);
  } else if (action.kind === "move") {
    assertCoordinateValue(action.to, "action.to");
    assertCoordinateValue(action.from, "action.from");
  } else if (action.color !== undefined) {
    assertColor(action.color);
  }

  const legal = enumerateLegalActions(state).find((candidate) =>
    requestedActionMatches(candidate, action),
  );
  if (!legal) throw new Error("Illegal Hive action");

  const next = cloneState(state);
  const completed =
    legal.kind === "place"
      ? placeCanonicalAction(next, legal)
      : legal.kind === "move"
        ? moveCanonicalAction(next, legal)
        : legal;
  next.turns[legal.color] += 1;
  next.moveNumber += 1;
  next.currentPlayer = otherColor(legal.color);
  next.lastAction = JSON.parse(JSON.stringify(completed));
  const result = getGameResult(next);
  next.status = result.status;
  next.winner = result.winner;
  return next;
}

export const applyAction = applyMove;

export function isOneHive(state) {
  return occupiedBoardIsConnected(state.board);
}

export function countOccupiedNeighbors(state, coord) {
  assertCoordinateValue(coord);
  return neighbors(coord).filter((adjacent) => getStack(state, adjacent).length)
    .length;
}

export function actionsEqual(a, b) {
  if (!a || !b || a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "pass") return a.color === b.color;
  if (!sameCoordinate(a.to, b.to)) return false;
  return a.kind === "place"
    ? a.type === b.type
    : sameCoordinate(a.from, b.from);
}

export function distanceBetween(a, b) {
  return axialDistance(a, b);
}
