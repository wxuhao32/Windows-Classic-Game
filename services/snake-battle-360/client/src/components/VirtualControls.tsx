import type React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { Position } from "@/lib/gameEngine";

type Props = {
  onDirection: (dir: Position) => void;
  className?: string;
};

const BTN =
  "w-14 h-14 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm text-white/80 active:bg-white/15 active:text-white touch-none";

export function VirtualControls({ onDirection, className }: Props) {
  const fire = (dir: Position) => (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
    onDirection(dir);
  };

  return (
    <div
      className={
        "fixed left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 select-none md:hidden " +
        (className || "")
      }
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-3">
        <button
          className={"col-start-2 row-start-1 " + BTN}
          onPointerDown={fire({ x: 0, y: -1 })}
          aria-label="上"
        >
          <ArrowUp className="mx-auto" />
        </button>

        <button
          className={"col-start-1 row-start-2 " + BTN}
          onPointerDown={fire({ x: -1, y: 0 })}
          aria-label="左"
        >
          <ArrowLeft className="mx-auto" />
        </button>

        <button
          className={"col-start-3 row-start-2 " + BTN}
          onPointerDown={fire({ x: 1, y: 0 })}
          aria-label="右"
        >
          <ArrowRight className="mx-auto" />
        </button>

        <button
          className={"col-start-2 row-start-3 " + BTN}
          onPointerDown={fire({ x: 0, y: 1 })}
          aria-label="下"
        >
          <ArrowDown className="mx-auto" />
        </button>
      </div>
    </div>
  );
}
