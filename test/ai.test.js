import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_INVENTORY,
  applyMove,
  chooseMove,
  createInitialState,
  enumerateLegalActions,
} from "../src/game/index.js";

function makeWinningState() {
  const inventories = {
    white: { ...BASE_INVENTORY, queen: 0, beetle: 1, ant: 2, spider: 1 },
    black: { ...BASE_INVENTORY, queen: 0, ant: 2, spider: 1 },
  };
  const entries = [
    [0, 0, "black", "queen"],
    [1, -1, "white", "queen"],
    [0, -1, "black", "ant"],
    [-1, 0, "white", "ant"],
    [-1, 1, "black", "spider"],
    [0, 1, "white", "spider"],
    [2, 0, "white", "beetle"],
  ];
  return {
    version: 1,
    currentPlayer: "white",
    moveNumber: 8,
    turns: { white: 4, black: 4 },
    inventories,
    board: Object.fromEntries(
      entries.map(([q, r, color, type], index) => [
        `${q},${r}`,
        [{ id: `${color}-${type}-ai-${index}`, color, type }],
      ]),
    ),
    status: "active",
    winner: null,
    lastAction: null,
  };
}

test("AI is deterministic and always returns a legal action", () => {
  const state = createInitialState();
  const first = chooseMove(state);
  const second = chooseMove(state);
  assert.deepEqual(first, second);
  assert.ok(
    enumerateLegalActions(state).some(
      (action) =>
        action.kind === first.kind &&
        action.type === first.type &&
        action.to.q === first.to.q &&
        action.to.r === first.to.r,
    ),
  );
});

test("AI takes an immediate winning move", () => {
  const state = makeWinningState();
  const action = chooseMove(state);
  const result = applyMove(state, action);
  assert.equal(result.status, "won");
  assert.equal(result.winner, "white");
});

test("AI develops reserve pieces instead of shuffling early pieces", () => {
  let state = createInitialState();
  const opening = [
    { kind: "place", type: "queen", to: { q: 0, r: 0 } },
    { kind: "place", type: "queen", to: { q: 1, r: 0 } },
    { kind: "place", type: "ant", to: { q: -1, r: 0 } },
    { kind: "place", type: "ant", to: { q: 2, r: 0 } },
  ];
  for (const action of opening) state = applyMove(state, action);

  const actions = enumerateLegalActions(state);
  assert.ok(actions.some((action) => action.kind === "move"));
  assert.ok(actions.some((action) => action.kind === "place"));
  assert.equal(chooseMove(state).kind, "place");
});

test("AI avoids a move that gives the opponent an immediate win", () => {
  const state = {
    version: 1,
    currentPlayer: "black",
    moveNumber: 13,
    turns: { white: 7, black: 6 },
    inventories: {
      white: { queen: 0, beetle: 0, spider: 2, grasshopper: 2, ant: 2 },
      black: { queen: 0, beetle: 0, spider: 2, grasshopper: 1, ant: 2 },
    },
    board: {
      "0,0": [{ id: "w-b1", color: "white", type: "beetle" }],
      "1,0": [{ id: "b-b1", color: "black", type: "beetle" }],
      "-1,1": [{ id: "w-g1", color: "white", type: "grasshopper" }],
      "2,-1": [{ id: "b-q1", color: "black", type: "queen" }],
      "2,-2": [{ id: "b-b2", color: "black", type: "beetle" }],
      "0,-1": [{ id: "w-q1", color: "white", type: "queen" }],
      "2,0": [{ id: "b-g1", color: "black", type: "grasshopper" }],
      "3,-2": [{ id: "b-g2", color: "black", type: "grasshopper" }],
      "3,0": [{ id: "w-a1", color: "white", type: "ant" }],
      "3,-3": [{ id: "b-a1", color: "black", type: "ant" }],
      "-2,2": [{ id: "w-b2", color: "white", type: "beetle" }],
    },
    status: "active",
    winner: null,
    lastAction: null,
  };

  const allowsWhiteWin = (action) => {
    const next = applyMove(state, action);
    return enumerateLegalActions(next).some((reply) => {
      const result = applyMove(next, reply);
      return result.status === "won" && result.winner === "white";
    });
  };
  const actions = enumerateLegalActions(state);
  assert.ok(actions.some(allowsWhiteWin));
  assert.ok(actions.some((action) => !allowsWhiteWin(action)));
  assert.equal(allowsWhiteWin(chooseMove(state)), false);
});

test("AI returns null after the game ends", () => {
  const state = makeWinningState();
  const won = applyMove(state, chooseMove(state));
  assert.equal(chooseMove(won), null);
});
