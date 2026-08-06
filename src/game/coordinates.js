import { DIRECTIONS } from "./constants.js";

export function coordinate(q, r) {
  if (!Number.isInteger(q) || !Number.isInteger(r)) {
    throw new TypeError("Axial coordinates must be integers");
  }
  return { q, r };
}

export function coordinateKey({ q, r }) {
  return `${q},${r}`;
}

export function parseCoordinateKey(key) {
  const [q, r] = key.split(",").map(Number);
  return coordinate(q, r);
}

export function sameCoordinate(a, b) {
  return a.q === b.q && a.r === b.r;
}

export function addCoordinates(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbors(coord) {
  return DIRECTIONS.map((direction) => addCoordinates(coord, direction));
}

export function axialDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
