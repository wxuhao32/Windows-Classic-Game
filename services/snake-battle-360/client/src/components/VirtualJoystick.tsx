/**
 * VirtualJoystick (mobile)
 * - Ultra-responsive analog stick (pointer events + requestAnimationFrame).
 * - Two instances can be mounted (left & right) so players can choose a side.
 *
 * ✅ 本次优化点：
 * 1) 死区更小（更跟手）
 * 2) 使用 pointerDown 的触点作为“中心点”（避免需要把手指移动到圆心才有明显转向）
 * 3) 中心点放在 ref 里（避免 React state 异步导致的首帧抖动/延迟）
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

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Stick>({ x: 0, y: 0 });

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

    // ✅ 触点即中心：更接近常见手游的“摇杆手感”
    centerRef.current = { x: e.clientX, y: e.clientY };

    setActive(true);
    setNeutral();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;

    const cx = centerRef.current.x;
    const cy = centerRef.current.y;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;

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
      // remap after deadzone + apply curve so mid movement feels snappier
      const t = Math.max(0, Math.min(1, (mag - dead) / (1 - dead)));
      const curved = Math.sqrt(t);

      const ux = sx / (mag || 1);
      const uy = sy / (mag || 1);

      schedule({
        x: Math.max(-1, Math.min(1, ux * curved)),
        y: Math.max(-1, Math.min(1, uy * curved)),
      });
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
      <div className="absolute inset-x-0 -top-7 text-center text-[11px] text-white/65" style={{ letterSpacing: "0.12em" }}>
        {side === "left" ? "LEFT" : "RIGHT"}
      </div>
    </div>
  );
}
