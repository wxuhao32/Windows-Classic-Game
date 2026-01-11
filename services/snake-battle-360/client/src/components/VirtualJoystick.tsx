/**
 * VirtualJoystick (mobile)
 * - More responsive: floating center + remapped deadzone + curve
 */

import { useEffect, useMemo, useRef, useState } from "react";

type Stick = { x: number; y: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function VirtualJoystick({
  side,
  onStick,
}: {
  side: "left" | "right";
  onStick: (stick: Stick) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Stick>({ x: 0, y: 0 });

  // Floating center: set on pointer down (feels much more “跟手”)
  const centerRef = useRef({ x: 0, y: 0 });

  const [active, setActive] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const maxR = 54; // px
  const dead = 0.06; // normalized

  const containerStyle = useMemo(() => {
    const common: React.CSSProperties = {
      position: "fixed",
      bottom: "max(18px, env(safe-area-inset-bottom))",
      width: 150,
      height: 150,
      zIndex: 50,
      borderRadius: 9999,
      background: "rgba(0,0,0,0.20)",
      backdropFilter: "blur(6px)",
      border: active ? "2px solid rgba(0,255,200,0.55)" : "2px solid rgba(255,255,255,0.22)",
      boxShadow: active ? "0 0 18px rgba(0,255,200,0.22)" : "0 0 10px rgba(255,255,255,0.12)",
      touchAction: "none",
      userSelect: "none",
    };
    if (side === "left") return { ...common, left: 16 };
    return { ...common, right: 16 };
  }, [side, active]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const flush = () => {
    rafRef.current = null;
    onStick(pendingRef.current);
  };

  const schedule = (stick: Stick) => {
    pendingRef.current = stick;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flush);
  };

  const setNeutral = () => {
    setKnob({ x: 0, y: 0 });
    schedule({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (pointerIdRef.current != null) return;
    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // floating center
    centerRef.current = { x: e.clientX, y: e.clientY };

    setActive(true);
    setNeutral();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const c = centerRef.current;
    const dx = e.clientX - c.x;
    const dy = e.clientY - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const clampedR = Math.min(maxR, d);
    const nx = (dx / d) * clampedR;
    const ny = (dy / d) * clampedR;

    setKnob({ x: nx, y: ny });

    // normalize to [-1..1]
    const sx = nx / maxR;
    const sy = ny / maxR;
    const mag = Math.hypot(sx, sy);

    if (mag < dead) {
      schedule({ x: 0, y: 0 });
    } else {
      // deadzone remap + curve (sqrt-ish)
      const strength = clamp((mag - dead) / (1 - dead), 0, 1);
      const curved = Math.pow(strength, 0.55);

      const inv = mag > 0 ? 1 / mag : 0;
      const dirX = sx * inv;
      const dirY = sy * inv;

      schedule({ x: clamp(dirX * curved, -1, 1), y: clamp(dirY * curved, -1, 1) });
    }

    e.preventDefault();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setActive(false);
    setNeutral();
    e.preventDefault();
  };

  return (
    <div style={containerStyle}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 110,
          height: 110,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0"
      />
      <div
        className="absolute left-1/2 top-1/2 rounded-full -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 56,
          height: 56,
          transform: `translate(${knob.x}px, ${knob.y}px) translate(-50%, -50%)`,
          background: active ? "rgba(0,255,255,0.45)" : "rgba(255,255,255,0.18)",
          boxShadow: active ? "0 0 18px rgba(0,255,255,0.28)" : "0 0 10px rgba(255,255,255,0.10)",
        }}
      />
      <div
        className="absolute inset-x-0 -top-7 text-center text-[11px] text-white/65"
        style={{ letterSpacing: "0.12em" }}
      >
        {side === "left" ? "LEFT" : "RIGHT"}
      </div>
    </div>
  );
}
