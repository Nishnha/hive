export const COLORS = Object.freeze(["white", "black"]);

export const PIECE_TYPES = Object.freeze([
  "queen",
  "beetle",
  "spider",
  "grasshopper",
  "ant",
]);

export const BASE_INVENTORY = Object.freeze({
  queen: 1,
  beetle: 2,
  spider: 2,
  grasshopper: 3,
  ant: 3,
});

export const DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

export function otherColor(color) {
  if (color === "white") return "black";
  if (color === "black") return "white";
  throw new TypeError(`Unknown color: ${color}`);
}
