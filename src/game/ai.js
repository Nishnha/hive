import { BASE_INVENTORY, PIECE_TYPES, otherColor } from "./constants.js";
import {
  applyMove,
  countOccupiedNeighbors,
  distanceBetween,
  enumerateLegalActions,
  findQueen,
  getStack,
  sortActions,
} from "./engine.js";
import { neighbors } from "./coordinates.js";

const ENEMY_QUEEN_PRESSURE = [0, 60, 180, 520, 1_500, 5_000, 1_000_000];
const OWN_QUEEN_DANGER = [0, 80, 320, 1_200, 4_500, 25_000, 1_000_000];
const PLACEMENT_VALUES = {
  queen: 0,
  beetle: 260,
  spider: 100,
  grasshopper: 180,
  ant: 320,
};

function opponentCanWinImmediately(state, opponent) {
  const threatenedQueen = findQueen(state, otherColor(opponent));
  if (
    !threatenedQueen ||
    countOccupiedNeighbors(state, threatenedQueen.coord) !== 5
  ) {
    return false;
  }
  const gap = neighbors(threatenedQueen.coord).find(
    (coord) => getStack(state, coord).length === 0,
  );
  return enumerateLegalActions(state, opponent)
    .filter(
      (reply) =>
        reply.kind !== "pass" &&
        reply.to.q === gap.q &&
        reply.to.r === gap.r,
    )
    .some((reply) => {
      const result = applyMove(state, reply);
      return result.status === "won" && result.winner === opponent;
    });
}

function remainingPieces(state, color) {
  return PIECE_TYPES.reduce(
    (total, type) => total + state.inventories[color][type],
    0,
  );
}

function deploymentScore(state, action, color) {
  const deployed = 11 - remainingPieces(state, color);
  if (action.kind === "pass") return -50_000;

  if (action.kind === "place") {
    let score = PLACEMENT_VALUES[action.type];
    if (deployed < 6) score += 2_400;
    else if (deployed < 8) score += 1_000;
    else if (deployed < 10) score += 280;

    const typeAlreadyDeployed =
      BASE_INVENTORY[action.type] - state.inventories[color][action.type];
    if (typeAlreadyDeployed === 0 && action.type !== "queen") score += 180;
    if (action.type === "queen" && state.turns[color] < 2) score -= 700;
    return score;
  }

  let score = deployed < 6 ? -2_800 : deployed < 8 ? -1_200 : -80;
  if (action.type === "queen") score -= 420;
  return score;
}

function queenPressureScore(state, color) {
  const opponent = otherColor(color);
  const enemyQueen = findQueen(state, opponent);
  const ownQueen = findQueen(state, color);
  const enemyPressure = enemyQueen
    ? ENEMY_QUEEN_PRESSURE[countOccupiedNeighbors(state, enemyQueen.coord)]
    : 0;
  const ownDanger = ownQueen
    ? OWN_QUEEN_DANGER[countOccupiedNeighbors(state, ownQueen.coord)]
    : 0;
  return enemyPressure - ownDanger;
}

function movementPurposeScore(state, next, action, color) {
  if (action.kind !== "move") return 0;
  const opponent = otherColor(color);
  const enemyQueen = findQueen(state, opponent);
  const ownQueen = findQueen(state, color);
  let score = 0;

  if (enemyQueen) {
    const before = distanceBetween(action.from, enemyQueen.coord);
    const after = distanceBetween(action.to, enemyQueen.coord);
    score += (before - after) * 90;
  }

  if (ownQueen) {
    const dangerBefore = countOccupiedNeighbors(state, ownQueen.coord);
    const nextQueen = findQueen(next, color);
    const dangerAfter = nextQueen
      ? countOccupiedNeighbors(next, nextQueen.coord)
      : dangerBefore;
    score += (dangerBefore - dangerAfter) * 1_100;
  }

  return score;
}

function opponentPressureNextTurn(state, opponent) {
  const defendedColor = otherColor(opponent);
  const queen = findQueen(state, defendedColor);
  if (!queen) return 0;

  const currentPressure = countOccupiedNeighbors(state, queen.coord);
  if (currentPressure < 3) return 0;

  let maximum = currentPressure;
  for (const reply of enumerateLegalActions(state, opponent)) {
    if (reply.kind === "pass") continue;
    const entersRing = distanceBetween(reply.to, queen.coord) === 1;
    const leavesRing =
      reply.kind === "move" && distanceBetween(reply.from, queen.coord) === 1;
    maximum = Math.max(
      maximum,
      currentPressure + Number(entersRing) - Number(leavesRing),
    );
  }
  return OWN_QUEEN_DANGER[maximum] - OWN_QUEEN_DANGER[currentPressure];
}

function scoreAction(state, action, color) {
  const next = applyMove(state, action);
  if (next.status === "won" && next.winner === color) return 1_000_000;
  if (next.status === "draw") return 100_000;

  const opponent = otherColor(color);
  let score = deploymentScore(state, action, color);
  if (opponentCanWinImmediately(next, opponent)) score -= 500_000;

  score += queenPressureScore(next, color);
  score += movementPurposeScore(state, next, action, color);
  score -= opponentPressureNextTurn(next, opponent);
  return score;
}

export function chooseMove(state, color = state.currentPlayer) {
  if (state.status !== "active") return null;
  if (color !== state.currentPlayer) {
    throw new Error("AI can only choose for the current player");
  }
  const actions = sortActions(enumerateLegalActions(state, color));
  if (!actions.length) return null;

  let best = actions[0];
  let bestScore = scoreAction(state, best, color);
  for (let index = 1; index < actions.length; index += 1) {
    const score = scoreAction(state, actions[index], color);
    if (score > bestScore) {
      best = actions[index];
      bestScore = score;
    }
  }
  return best;
}

export const chooseAction = chooseMove;

export default chooseMove;
