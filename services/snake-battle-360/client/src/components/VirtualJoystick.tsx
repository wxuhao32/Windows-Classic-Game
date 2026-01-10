/**
 * VirtualJoystick (mobile)
 * - Ultra-responsive analog stick (pointer events + requestAnimationFrame).
 * - Two instances can be mounted (left & right) so players can choose a side.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type Stick = { x: number; y: number };

export function VirtualJoystick({
  side,
  onStick,
}: {
  side: "left" | "right";
  onStick: (stick: Stick) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Stick>({ x: 0, y: 0 });

  const [active, setActive] = useState(false);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const maxR = 50; // px
  const dead = 0.12; // normalized

  const containerStyle = useMemo(() => {
    const common: React.CSSProperties = {
      position: "fixed",
      bottom: "max(18px, env(safe-area-inset-bottom))",
      width: 150,
      height: 150,
      zIndex: 40,
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    };
    if (side === "left") {
      return { ...common, left: "max(14px, env(safe-area-inset-left))" };
    }
    return { ...common, right: "max(14px, env(safe-area-inset-right))" };
  }, [side]);

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
    // only one pointer controls this joystick instance
    if (pointerIdRef.current != null) return;
    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setCenter({ x: cx, y: cy });
    setActive(true);
    setNeutral();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - center.x;
    const dy = e.clientY - center.y;
    const d = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(maxR, d);
    const nx = (dx / d) * clamped;
    const ny = (dy / d) * clamped;
    setKnob({ x: nx, y: ny });

    const sx = nx / maxR;
    const sy = ny / maxR;
    const mag = Math.hypot(sx, sy);
    if (mag < dead) {
      schedule({ x: 0, y: 0 });
    } else {
      // clamp to [-1,1]
      schedule({ x: Math.max(-1, Math.min(1, sx)), y: Math.max(-1, Math.min(1, sy)) });
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
    <div
      style={containerStyle}
      className="md:hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={baseRef}
        className="absolute inset-0 rounded-full"
        style={{
          background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.06)",
          border: active ? "2px solid rgba(0,255,200,0.45)" : "2px solid rgba(255,255,255,0.14)",
          boxShadow: active ? "0 0 18px rgba(0,255,200,0.18)" : "0 0 10px rgba(255,255,255,0.06)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />
      <div
        ref={knobRef}
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 68,
          height: 68,
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          background: active ? "rgba(0,255,200,0.22)" : "rgba(255,255,255,0.16)",
          border: active ? "2px solid rgba(0,255,200,0.55)" : "2px solid rgba(255,255,255,0.22)",
          boxShadow: active ? "0 0 18px rgba(0,255,200,0.22)" : "0 0 10px rgba(255,255,255,0.12)",
          touchAction: "none",
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
