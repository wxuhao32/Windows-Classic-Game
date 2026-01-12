// 虚拟摇杆（超低延迟，直接输出方向向量 + 位移强度）
import React, { useRef, useCallback } from 'react';

type Vec = { x: number; y: number };

interface VirtualJoystickProps {
  onChange: (s: { move: Vec; magnitude: number }) => void;
  radius?: number;      // 视觉半径（像素）
  deadzone?: number;    // 0..1
  className?: string;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onChange,
  radius = 56,
  deadzone = 0.12,
  className,
}) => {
  const pointerIdRef = useRef<number | null>(null);
  const centerRef = useRef<Vec>({ x: 0, y: 0 });
  const knobRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);

  const emit = useCallback((dx: number, dy: number) => {
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, radius);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    let mag = clamped / radius;
    if (mag < deadzone) {
      onChange({ move: { x: 0, y: 0 }, magnitude: 0 });
      return;
    }
    // 轻微非线性，提升小幅位移的精度
    mag = Math.pow((mag - deadzone) / (1 - deadzone), 1.1);
    onChange({ move: { x: nx, y: ny }, magnitude: Math.min(1, Math.max(0, mag)) });
  }, [onChange, radius, deadzone]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerIdRef.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    centerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // 显示底座
    const base = baseRef.current;
    if (base) {
      base.style.display = 'flex';
      base.style.left = `${centerRef.current.x - radius}px`;
      base.style.top = `${centerRef.current.y - radius}px`;
    }
  }, [radius]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = (e.clientX - rect.left) - centerRef.current.x;
    const dy = (e.clientY - rect.top) - centerRef.current.y;
    // UI 拖动
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, radius);
    const kx = dist > 0 ? (dx / dist) * clamped : 0;
    const ky = dist > 0 ? (dy / dist) * clamped : 0;
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`;
    }
    emit(dx, dy);
  }, [emit, radius]);

  const reset = useCallback(() => {
    pointerIdRef.current = null;
    if (knobRef.current) knobRef.current.style.transform = `translate(0px, 0px)`;
    if (baseRef.current) baseRef.current.style.display = 'none';
    onChange({ move: { x: 0, y: 0 }, magnitude: 0 });
  }, [onChange]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    reset();
  }, [reset]);

  return (
    <div
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      {/* 动态出现的摇杆底座 */}
      <div
        ref={baseRef}
        style={{
          position: 'absolute',
          width: radius * 2,
          height: radius * 2,
          marginLeft: 0,
          marginTop: 0,
          borderRadius: radius,
          border: '2px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.05)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div
          ref={knobRef}
          style={{
            width: radius * 0.8,
            height: radius * 0.8,
            borderRadius: radius * 0.4,
            background: 'rgba(255,255,255,0.25)',
            border: '2px solid rgba(255,255,255,0.35)',
            transition: 'transform 40ms linear',
          }}
        />
      </div>
    </div>
  );
};
