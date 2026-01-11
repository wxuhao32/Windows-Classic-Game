/**
 * VirtualJoystick (mobile)
 * - One joystick (left) friendly
 * - Fix "knob offset": no double translate
 * - Fix "sometimes can't drag": ensure hit-layer receives pointer events + robust pointer capture fallback
 */

import { useEffect, useMemo, useRef, useState } from "react";

type Stick = { x: number; y: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function VirtualJoystick({
  side = "left",
  onStick,
  label,
}: {
  side?: "left" | "right";
  onStick: (stick: Stick) => void;
  /** Optional label text (e.g. "MOVE") */
  label?: string;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const hasCaptureRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Stick>({ x: 0, y: 0 });

  // Floating center: set on touch start
  const centerRef = useRef({ x: 0, y: 0 });
  const rectRef = useRef<DOMRect | null>(null);

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
      border: active
        ? "2px solid rgba(0,255,200,0.55)"
        : "2px solid rgba(255,255,255,0.22)",
      boxShadow: active
        ? "0 0 18px rgba(0,255,200,0.22)"
        : "0 0 10px rgba(255,255,255,0.12)",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
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

  const schedule = (s: Stick) => {
    pendingRef.current = s;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(flush);
  };

  const setNeutral = () => {
    setKnob({ x: 0, y: 0 });
    schedule({ x: 0, y: 0 });
  };

  const computeStick = (clientX: number, clientY: number) => {
    const c = centerRef.current;
    const dx = clientX - c.x;
    const dy = clientY - c.y;

    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxR);

    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;

    const kx = nx * clamped;
    const ky = ny * clamped;

    // normalized magnitude [0..1]
    let mag = clamped / maxR;

    // deadzone + remap (so after deadzone, it ramps up smoothly)
    if (mag < dead) {
      setKnob({ x: 0, y: 0 });
      schedule({ x: 0, y: 0 });
      return;
    }
    mag = clamp((mag - dead) / (1 - dead), 0, 1);
    // curve: boost mid strength (more agile like mobile slither)
    mag = Math.sqrt(mag);

    const sx = nx * mag;
    const sy = ny * mag;

    setKnob({ x: kx, y: ky });
    schedule({ x: sx, y: sy });
  };

  const stopGlobalListeners = () => {
    window.removeEventListener("pointermove", onWindowMove as any);
    window.removeEventListener("pointerup", onWindowUp as any);
    window.removeEventListener("pointercancel", onWindowUp as any);
  };

  const onWindowMove = (e: PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    computeStick(e.clientX, e.clientY);
  };

  const onWindowUp = (e: PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    hasCaptureRef.current = false;
    setActive(false);
    setNeutral();
    stopGlobalListeners();
    e.preventDefault();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (pointerIdRef.current != null) return;
    pointerIdRef.current = e.pointerId;
    setActive(true);

    const rect = (e.currentTarget.parentElement as HTMLDivElement).getBoundingClientRect();
    rectRef.current = rect;

    // floating center = down position
    centerRef.current = { x: e.clientX, y: e.clientY };

    // Best effort capture
    try {
      (e.currentTarget as any).setPointerCapture(e.pointerId);
      hasCaptureRef.current = true;
    } catch {
      hasCaptureRef.current = false;
      // fallback: global listeners
      window.addEventListener("pointermove", onWindowMove as any, { passive: false });
      window.addEventListener("pointerup", onWindowUp as any, { passive: false });
      window.addEventListener("pointercancel", onWindowUp as any, { passive: false });
    }

    computeStick(e.clientX, e.clientY);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    computeStick(e.clientX, e.clientY);
    e.preventDefault();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    hasCaptureRef.current = false;
    setActive(false);
    setNeutral();
    stopGlobalListeners();
    e.preventDefault();
  };

  const onLostPointerCapture = (e: React.PointerEvent) => {
    // Some browsers may lose capture unexpectedly — reset to neutral to avoid "stuck joystick"
    if (pointerIdRef.current === e.pointerId) {
      pointerIdRef.current = null;
      hasCaptureRef.current = false;
      setActive(false);
      setNeutral();
      stopGlobalListeners();
      e.preventDefault();
    }
  };

  return (
    <div style={containerStyle}>
      {/* ring */}
      <div
        className="absolute inset-3 rounded-full"
        style={{
          pointerEvents: "none",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      />
      {/* hit layer */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onLostPointerCapture}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
      />

      {/* knob (pure visual, centered by default) */}
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "50%",
          width: 56,
          height: 56,
          transform: `translate(-50%, -50%) translate(${knob.x}px, ${knob.y}px)`,
          pointerEvents: "none",
          background: active
            ? "radial-gradient(circle at 50% 50%, rgba(0,255,255,0.65), rgba(0,255,255,0.20) 60%, rgba(255,255,255,0.10) 100%)"
            : "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.30), rgba(255,255,255,0.14) 60%, rgba(255,255,255,0.08) 100%)",
          border: active ? "1px solid rgba(0,255,255,0.35)" : "1px solid rgba(255,255,255,0.16)",
          boxShadow: active
            ? "0 0 18px rgba(0,255,255,0.28)"
            : "0 0 10px rgba(255,255,255,0.10)",
        }}
      >
        {/* center cap */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 14,
            height: 14,
            borderRadius: 9999,
            transform: "translate(-50%, -50%)",
            background: active ? "rgba(0,255,255,0.75)" : "rgba(255,255,255,0.55)",
            boxShadow: active ? "0 0 10px rgba(0,255,255,0.25)" : "none",
            pointerEvents: "none",
          }}
        />
      </div>

      {label ? (
        <div
          className="absolute inset-x-0 -top-7 text-center text-[11px] text-white/65"
          style={{ letterSpacing: "0.12em", pointerEvents: "none" }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
