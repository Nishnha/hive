import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_INVENTORY,
  DIRECTIONS,
  actionsEqual,
  applyAction,
  applyMove,
  createInitialState,
  deserializeState,
  enumerateLegalActions,
  enumerateLegalMoves,
  enumerateLegalPlacements,
  getGameResult,
  getStack,
  isOneHive,
  serializeState,
  sortActions,
} from "../src/game/index.js";

function key(q, r) {
  return `${q},${r}`;
}

function makeState(entries, currentPlayer = "white", turns = { white: 4, black: 4 }) {
  const inventories = {
    white: { ...BASE_INVENTORY },
    black: { ...BASE_INVENTORY },
  };
  const board = {};
  let sequence = 0;
  for (const [q, r, pieces] of entries) {
    board[key(q, r)] = pieces.map(([color, type]) => {
      inventories[color][type] -= 1;
      sequence += 1;
      return { id: `${color}-${type}-test-${sequence}`, color, type };
    });
  }
  return {
    version: 1,
    currentPlayer,
    moveNumber: turns.white + turns.black,
    turns: { ...turns },
    inventories,
    board,
    status: "active",
    winner: null,
    lastAction: null,
  };
}

function hasDestination(actions, q, r) {
  return actions.some((action) => action.to.q === q && action.to.r === r);
}

test("initial state exposes the base inventory and canonical opening", () => {
  const state = createInitialState();
  assert.deepEqual(state.inventories.white, BASE_INVENTORY);
  assert.deepEqual(state.inventories.black, BASE_INVENTORY);

  const actions = enumerateLegalActions(state);
  assert.equal(actions.length, 5);
  assert.deepEqual(new Set(actions.map((action) => action.type)), new Set([
    "queen",
    "beetle",
    "spider",
    "grasshopper",
    "ant",
  ]));
  assert.ok(actions.every((action) => action.to.q === 0 && action.to.r === 0));
});

test("placements touch only friendly top pieces after each player's opener", () => {
  let state = createInitialState();
  state = applyMove(state, { kind: "place", type: "ant", to: { q: 0, r: 0 } });

  const blackOpening = enumerateLegalPlacements(state);
  assert.equal(blackOpening.length, 30);
  state = applyMove(state, {
    kind: "place",
    type: "ant",
    to: { q: 1, r: 0 },
  });

  const whiteDestinations = enumerateLegalPlacements(state).filter(
    (action) => action.type === "beetle",
  );
  assert.equal(whiteDestinations.length, 3);
  assert.ok(hasDestination(whiteDestinations, -1, 0));
  assert.ok(!hasDestination(whiteDestinations, 1, -1));
});

test("a player must place the queen on their fourth turn", () => {
  let state = createInitialState();
  const sequence = [
    ["ant", 0, 0],
    ["ant", 1, 0],
    ["spider", -1, 0],
    ["spider", 2, 0],
    ["grasshopper", -2, 0],
    ["grasshopper", 3, 0],
  ];
  for (const [type, q, r] of sequence) {
    state = applyMove(state, { kind: "place", type, to: { q, r } });
  }

  const actions = enumerateLegalActions(state);
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.kind === "place"));
  assert.ok(actions.every((action) => action.type === "queen"));
  assert.throws(
    () =>
      applyMove(state, {
        kind: "place",
        type: "beetle",
        to: actions[0].to,
      }),
    /Illegal Hive action/,
  );
});

test("pieces cannot move before their own queen is placed", () => {
  const state = makeState(
    [
      [0, 0, [["white", "ant"]]],
      [1, 0, [["black", "queen"]]],
    ],
    "white",
    { white: 1, black: 1 },
  );
  assert.deepEqual(enumerateLegalMoves(state), []);
});

test("moving an articulation piece is forbidden by the one-hive rule", () => {
  const state = makeState([
    [-1, 0, [["white", "queen"]]],
    [0, 0, [["white", "ant"]]],
    [1, 0, [["black", "queen"]]],
  ]);
  const antMoves = enumerateLegalMoves(state).filter(
    (action) => action.type === "ant",
  );
  assert.deepEqual(antMoves, []);
  assert.equal(isOneHive(state), true);
});

test("a top beetle can leave a stack without disconnecting the hive", () => {
  const state = makeState([
    [-1, 0, [["black", "queen"]]],
    [0, 0, [["black", "ant"], ["white", "beetle"]]],
    [1, 0, [["white", "queen"]]],
  ]);
  const moves = enumerateLegalMoves(state).filter(
    (action) => action.type === "beetle",
  );
  assert.ok(moves.length > 0);

  const next = applyMove(state, moves[0]);
  assert.equal(getStack(next, { q: 0, r: 0 }).length, 1);
  assert.equal(getStack(next, { q: 0, r: 0 })[0].type, "ant");
  assert.equal(isOneHive(next), true);
});

test("queen slides one space and cannot squeeze through a closed gate", () => {
  const open = makeState([
    [0, 0, [["white", "queen"]]],
    [1, 0, [["black", "queen"]]],
  ]);
  const openMoves = enumerateLegalMoves(open);
  assert.deepEqual(
    new Set(openMoves.map((action) => key(action.to.q, action.to.r))),
    new Set(["0,1", "1,-1"]),
  );

  const gated = makeState([
    [0, 0, [["white", "queen"]]],
    [0, 1, [["black", "ant"]]],
    [-1, 1, [["black", "spider"]]],
    [-1, 0, [["black", "queen"]]],
    [0, -1, [["white", "ant"]]],
    [1, -1, [["white", "spider"]]],
  ]);
  assert.ok(
    !hasDestination(
      enumerateLegalMoves(gated).filter((action) => action.type === "queen"),
      1,
      0,
    ),
  );
});

test("beetles step onto occupied hexes and elevated beetles cross low gates", () => {
  const climbing = makeState([
    [0, 0, [["white", "beetle"]]],
    [0, 1, [["white", "queen"]]],
    [1, 0, [["black", "queen"]]],
  ]);
  const climb = enumerateLegalMoves(climbing).find(
    (action) => action.type === "beetle" && action.to.q === 1 && action.to.r === 0,
  );
  assert.ok(climb);
  const stacked = applyMove(climbing, climb);
  assert.equal(getStack(stacked, { q: 1, r: 0 }).length, 2);
  assert.equal(getStack(stacked, { q: 1, r: 0 })[1].color, "white");

  const elevated = makeState([
    [0, 0, [["black", "ant"], ["white", "beetle"]]],
    [0, 1, [["black", "spider"]]],
    [1, -1, [["black", "beetle"]]],
    [-1, 1, [["white", "queen"]]],
    [-1, 0, [["black", "queen"]]],
  ]);
  assert.ok(hasDestination(
    enumerateLegalMoves(elevated).filter((action) => action.type === "beetle"),
    1,
    0,
  ));
});

test("grasshoppers jump in a straight line to the first empty hex", () => {
  const state = makeState([
    [0, 0, [["white", "grasshopper"]]],
    [1, 0, [["white", "queen"]]],
    [2, 0, [["black", "queen"]]],
  ]);
  const jumps = enumerateLegalMoves(state).filter(
    (action) => action.type === "grasshopper",
  );
  assert.ok(hasDestination(jumps, 3, 0));
  assert.ok(!hasDestination(jumps, 2, 0));
  assert.ok(!hasDestination(jumps, 1, 0));
});

test("spiders take exactly three perimeter steps without revisiting", () => {
  const state = makeState([
    [0, 0, [["white", "queen"]]],
    [1, 0, [["white", "spider"]]],
  ]);
  const moves = enumerateLegalMoves(state).filter(
    (action) => action.type === "spider",
  );
  assert.deepEqual(
    new Set(moves.map((action) => key(action.to.q, action.to.r))),
    new Set(["-1,0"]),
  );
});

test("ants can traverse the entire reachable sliding perimeter", () => {
  const state = makeState([
    [0, 0, [["white", "queen"]]],
    [1, 0, [["white", "ant"]]],
  ]);
  const moves = enumerateLegalMoves(state).filter(
    (action) => action.type === "ant",
  );
  assert.equal(moves.length, 5);
  assert.ok(!hasDestination(moves, 1, 0));
  assert.ok(hasDestination(moves, -1, 0));
});

test("winner and simultaneous-surround draw detection include occupied stacks", () => {
  const aroundBlack = DIRECTIONS.map(({ q, r }, index) => [
    q,
    r,
    [[index % 2 ? "white" : "black", index === 0 ? "queen" : "ant"]],
  ]);
  aroundBlack[0] = [1, 0, [["white", "queen"]]];
  const blackSurrounded = makeState([
    [0, 0, [["black", "queen"], ["white", "beetle"]]],
    ...aroundBlack,
  ]);
  assert.deepEqual(getGameResult(blackSurrounded), {
    status: "won",
    winner: "white",
  });

  const occupied = new Map();
  const add = (q, r, piece) => {
    const cellKey = key(q, r);
    if (!occupied.has(cellKey)) occupied.set(cellKey, [q, r, []]);
    occupied.get(cellKey)[2].push(piece);
  };
  add(0, 0, ["white", "queen"]);
  add(1, 0, ["black", "queen"]);
  for (const origin of [{ q: 0, r: 0 }, { q: 1, r: 0 }]) {
    for (const direction of DIRECTIONS) {
      const q = origin.q + direction.q;
      const r = origin.r + direction.r;
      if (!occupied.has(key(q, r))) add(q, r, ["white", "ant"]);
    }
  }
  const draw = makeState([...occupied.values()]);
  assert.deepEqual(getGameResult(draw), { status: "draw", winner: null });
});

test("applyMove detects a win and leaves the input state unchanged", () => {
  const state = makeState([
    [0, 0, [["black", "queen"]]],
    [1, -1, [["white", "queen"]]],
    [0, -1, [["black", "ant"]]],
    [-1, 0, [["white", "ant"]]],
    [-1, 1, [["black", "spider"]]],
    [0, 1, [["white", "spider"]]],
    [2, 0, [["white", "beetle"]]],
  ]);
  const before = serializeState(state);
  const winningMove = enumerateLegalMoves(state).find(
    (action) =>
      action.type === "beetle" && action.to.q === 1 && action.to.r === 0,
  );
  assert.ok(winningMove);

  const next = applyMove(state, winningMove);
  assert.equal(next.status, "won");
  assert.equal(next.winner, "white");
  assert.equal(serializeState(state), before);
  assert.throws(() => applyMove(next, winningMove), /already over/);
});

test("state JSON round-trips without shared references", () => {
  let state = createInitialState();
  state = applyMove(state, {
    kind: "place",
    type: "queen",
    to: { q: 0, r: 0 },
  });
  const restored = deserializeState(serializeState(state));
  assert.deepEqual(restored, state);
  restored.board["0,0"][0].type = "ant";
  assert.equal(state.board["0,0"][0].type, "queen");
});

test("a player with no placement or movement gets exactly one forced pass", () => {
  const blackPieces = [
    "queen",
    "beetle",
    "beetle",
    "spider",
    "spider",
    "grasshopper",
    "grasshopper",
    "grasshopper",
    "ant",
    "ant",
    "ant",
  ];
  const entries = blackPieces.map((type, q) => [
    q,
    0,
    [["black", type]],
  ]);
  entries[0][2].push(["white", "beetle"]);
  entries[entries.length - 1][2].push(["white", "beetle"]);
  const state = makeState(
    entries,
    "black",
    { white: 2, black: blackPieces.length },
  );

  assert.deepEqual(enumerateLegalPlacements(state), []);
  assert.deepEqual(enumerateLegalMoves(state), []);
  assert.deepEqual(enumerateLegalActions(state), [
    { kind: "pass", color: "black" },
  ]);

  const next = applyAction(state, { kind: "pass", color: "black" });
  assert.equal(next.currentPlayer, "white");
  assert.equal(next.turns.black, state.turns.black + 1);
  assert.equal(next.moveNumber, state.moveNumber + 1);
  assert.deepEqual(next.lastAction, { kind: "pass", color: "black" });
  assert.deepEqual(state.lastAction, null);
});

test("pass is illegal when a placement or movement is available", () => {
  const state = createInitialState();
  assert.throws(
    () => applyMove(state, { kind: "pass", color: "white" }),
    /Illegal Hive action/,
  );
  assert.throws(
    () => applyMove(state, { kind: "pass", color: "black" }),
    /Illegal Hive action/,
  );
});

test("action helpers handle canonical pass actions", () => {
  const whitePass = { kind: "pass", color: "white" };
  const blackPass = { kind: "pass", color: "black" };
  assert.equal(actionsEqual(whitePass, { ...whitePass }), true);
  assert.equal(actionsEqual(whitePass, blackPass), false);
  assert.deepEqual(sortActions([whitePass, blackPass]), [
    blackPass,
    whitePass,
  ]);
});
