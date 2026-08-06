import { otherColor } from "./constants.js";
import {
  applyMove,
  countOccupiedNeighbors,
  enumerateLegalActions,
  findQueen,
  getStack,
  sortActions,
} from "./engine.js";
import { neighbors } from "./coordinates.js";

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

function scoreAction(state, action, color) {
  const next = applyMove(state, action);
  if (next.status === "won" && next.winner === color) return 1_000_000;
  if (next.status === "draw") return 100_000;

  const opponent = otherColor(color);
  let score = 0;
  if (opponentCanWinImmediately(next, opponent)) score -= 500_000;

  const enemyQueen = findQueen(next, opponent);
  if (enemyQueen) {
    score += countOccupiedNeighbors(next, enemyQueen.coord) * 1_000;
  }
  const ownQueen = findQueen(next, color);
  if (ownQueen) {
    score -= countOccupiedNeighbors(next, ownQueen.coord) * 100;
  }

  if (action.type === "queen" && state.turns[color] < 3) score -= 10;
  if (action.kind === "move") score += 2;
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
