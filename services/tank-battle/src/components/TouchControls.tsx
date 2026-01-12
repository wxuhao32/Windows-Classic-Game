// Virtual touch controls for mobile devices

import React, { useCallback, useRef } from 'react';

interface TouchControlsProps {
  onInput: (key: string, pressed: boolean) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({ onInput }) => {
  const activeRef = useRef<Set<string>>(new Set());

  const handleTouch = useCallback((key: string, pressed: boolean) => {
    if (pressed) {
      if (!activeRef.current.has(key)) {
        activeRef.current.add(key);
        onInput(key, true);
      }
    } else {
      activeRef.current.delete(key);
      onInput(key, false);
    }
  }, [onInput]);

  const DPadButton: React.FC<{ dir: string; label: string; style: React.CSSProperties }> = 
    ({ dir, label, style }) => (
    <button
      className="absolute flex items-center justify-center text-white/60 transition-none select-none touch-none"
      style={{
        ...style,
        width: 48,
        height: 48,
        backgroundColor: 'rgba(255,255,255,0.2)',
        border: '2px solid rgba(255,255,255,0.4)',
      }}
      onTouchStart={(e) => { e.preventDefault(); handleTouch(dir, true); (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.5)'; }}
      onTouchEnd={(e) => { e.preventDefault(); handleTouch(dir, false); (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
      onTouchCancel={(e) => { e.preventDefault(); handleTouch(dir, false); (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  const ActionButton: React.FC<{ action: string; label: string; color?: string }> = 
    ({ action, label, color = 'rgba(255,255,255,0.2)' }) => (
    <button
      className="flex items-center justify-center text-white/80 font-bold rounded-lg transition-none select-none touch-none"
      style={{
        width: 64,
        height: 64,
        backgroundColor: color,
        border: '2px solid rgba(255,255,255,0.4)',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 14,
      }}
      onTouchStart={(e) => { e.preventDefault(); handleTouch(action, true); (e.target as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.5)'; }}
      onTouchEnd={(e) => { e.preventDefault(); handleTouch(action, false); (e.target as HTMLElement).style.backgroundColor = color; }}
      onTouchCancel={(e) => { e.preventDefault(); handleTouch(action, false); (e.target as HTMLElement).style.backgroundColor = color; }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 h-40 flex justify-between items-end px-8 pb-8 pointer-events-auto z-50">
      {/* D-Pad */}
      <div className="relative" style={{ width: 144, height: 144 }}>
        <DPadButton dir="up" label="^" style={{ top: 0, left: 48 }} />
        <DPadButton dir="left" label="<" style={{ top: 48, left: 0 }} />
        <DPadButton dir="right" label=">" style={{ top: 48, left: 96 }} />
        <DPadButton dir="down" label="v" style={{ top: 96, left: 48 }} />
        <div 
          className="absolute"
          style={{ 
            top: 48, left: 48, width: 48, height: 48,
            backgroundColor: 'rgba(255,255,255,0.1)',
            border: '2px solid rgba(255,255,255,0.2)',
          }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <ActionButton action="special" label="B" />
        <ActionButton action="fire" label="A" color="rgba(231, 76, 60, 0.3)" />
      </div>
    </div>
  );
};
