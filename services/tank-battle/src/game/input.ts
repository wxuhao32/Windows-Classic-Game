// Input abstraction for engine-agnostic control (keyboard/joystick/touch/network)
export interface InputState {
  move: { x: number; y: number }; // normalized direction vector
  magnitude: number;              // 0..1 strength
  fire: boolean;
  special: boolean;
  seq: number;                    // reserved for multiplayer input sequence
}

export const EmptyInput: InputState = Object.freeze({
  move: { x: 0, y: 0 },
  magnitude: 0,
  fire: false,
  special: false,
  seq: 0,
});

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function normalize(x: number, y: number): { x: number; y: number; mag: number } {
  const mag = Math.hypot(x, y);
  if (mag <= 1e-6) return { x: 0, y: 0, mag: 0 };
  return { x: x / mag, y: y / mag, mag };
}
