"use client";

import { useState } from "react";

function getHpDescription(current: number, max: number): string {
  const pct = current / max;
  if (pct >= 0.75) return "Healthy";
  if (pct >= 0.5) return "Injured";
  if (pct >= 0.25) return "Bloodied";
  if (pct > 0) return "Critical";
  return "Dead";
}

function getHpColor(current: number, max: number): string {
  const pct = current / max;
  if (pct >= 0.5) return "var(--hp-green)";
  if (pct >= 0.25) return "var(--hp-yellow)";
  return "var(--hp-red)";
}

export function HpTracker({
  currentHp,
  maxHp,
  onHpChange,
  showControls,
  showExact,
}: {
  currentHp: number;
  maxHp: number;
  onHpChange: (newHp: number) => void;
  showControls: boolean;
  showExact: boolean;
}) {
  const [hpDelta, setHpDelta] = useState("");
  const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));

  function applyHp(mode: "damage" | "heal") {
    const val = parseInt(hpDelta);
    if (isNaN(val) || val <= 0) return;

    let newHp: number;
    if (mode === "damage") {
      newHp = Math.max(0, currentHp - val);
    } else {
      newHp = Math.min(maxHp, currentHp + val);
    }

    onHpChange(newHp);
    setHpDelta("");
  }

  function quickAdjust(amount: number) {
    const newHp = Math.max(0, Math.min(maxHp, currentHp + amount));
    onHpChange(newHp);
  }

  return (
    <div className="space-y-1.5">
      {/* HP Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: getHpColor(currentHp, maxHp),
            }}
          />
        </div>
        <span className="text-xs text-text-secondary min-w-[60px] text-right">
          {showExact
            ? `${currentHp}/${maxHp}`
            : getHpDescription(currentHp, maxHp)}
        </span>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => quickAdjust(-1)}
            className="btn btn-ghost btn-sm text-xs px-2 text-accent-red"
          >
            -1
          </button>
          <button
            onClick={() => quickAdjust(-5)}
            className="btn btn-ghost btn-sm text-xs px-2 text-accent-red"
          >
            -5
          </button>
          <input
            type="number"
            value={hpDelta}
            onChange={(e) => setHpDelta(e.target.value)}
            placeholder="HP"
            className="w-14 text-xs text-center py-1 px-1"
            min={1}
          />
          <button
            onClick={() => applyHp("damage")}
            disabled={!hpDelta}
            className="btn btn-ghost btn-sm text-xs px-2 text-accent-red"
          >
            Dmg
          </button>
          <button
            onClick={() => applyHp("heal")}
            disabled={!hpDelta}
            className="btn btn-ghost btn-sm text-xs px-2 text-accent-green"
          >
            Heal
          </button>
          <button
            onClick={() => quickAdjust(1)}
            className="btn btn-ghost btn-sm text-xs px-2 text-accent-green"
          >
            +1
          </button>
          <button
            onClick={() => quickAdjust(5)}
            className="btn btn-ghost btn-sm text-xs px-2 text-accent-green"
          >
            +5
          </button>
        </div>
      )}
    </div>
  );
}
