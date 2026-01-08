export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function randInt(min, maxInclusive){
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

export function eqPos(a, b){
  return a.x === b.x && a.y === b.y;
}

export function oppositeDir(a, b){
  return (a.x === -b.x && a.y === -b.y);
}

export function now(){
  return (typeof performance !== "undefined" ? performance.now() : Date.now());
}
