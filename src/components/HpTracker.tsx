"use client";

import { useState, useRef, useEffect } from "react";
import { Sword, Heart, Shield, X } from "lucide-react";

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
  tempHp = 0,
  onHpChange,
  onTempHpChange,
  showControls,
  showExact,
  hideBar,
}: {
  currentHp: number;
  maxHp: number;
  tempHp?: number;
  onHpChange: (newHp: number) => void;
  onTempHpChange?: (tempHp: number) => void;
  showControls: boolean;
  showExact: boolean;
  hideBar?: boolean;
}) {
  const [hpDelta, setHpDelta] = useState("");
  const [deathFlash, setDeathFlash] = useState(false);
  const [showTempPanel, setShowTempPanel] = useState(false);
  const [tempInput, setTempInput] = useState("");
  const prevHpRef = useRef(currentHp);

  // HP bar percentages: temp HP extends beyond the normal bar
  const totalPool = tempHp > 0 ? maxHp + tempHp : maxHp;
  const hpPct = Math.max(0, (currentHp / totalPool) * 100);
  const tempPct = tempHp > 0 ? (tempHp / totalPool) * 100 : 0;

  // Detect HP transition from >0 to 0
  useEffect(() => {
    if (prevHpRef.current > 0 && currentHp === 0) {
      setDeathFlash(true);
      const timer = setTimeout(() => setDeathFlash(false), 600);
      return () => clearTimeout(timer);
    }
    prevHpRef.current = currentHp;
  }, [currentHp]);

  function applyHp(mode: "damage" | "heal") {
    const val = parseInt(hpDelta);
    if (isNaN(val) || val <= 0) return;

    if (mode === "damage") {
      if (tempHp > 0) {
        // Damage absorbs from temp HP first, overflow to real HP
        const remaining = val - tempHp;
        const newTempHp = Math.max(0, tempHp - val);
        if (remaining > 0) {
          onHpChange(Math.max(0, currentHp - remaining));
          onTempHpChange?.(0);
        } else {
          onTempHpChange?.(newTempHp);
        }
      } else {
        onHpChange(Math.max(0, currentHp - val));
      }
    } else {
      // Healing always goes to real HP (temp HP can't be healed per D&D rules)
      onHpChange(Math.min(maxHp, currentHp + val));
    }

    setHpDelta("");
  }

  function quickAdjust(amount: number) {
    if (amount < 0) {
      const dmg = Math.abs(amount);
      if (tempHp > 0) {
        const remaining = dmg - tempHp;
        const newTempHp = Math.max(0, tempHp - dmg);
        if (remaining > 0) {
          onHpChange(Math.max(0, currentHp - remaining));
          onTempHpChange?.(0);
        } else {
          onTempHpChange?.(newTempHp);
        }
      } else {
        onHpChange(Math.max(0, currentHp + amount));
      }
    } else {
      onHpChange(Math.min(maxHp, currentHp + amount));
    }
  }

  function setTempHp() {
    const val = parseInt(tempInput);
    if (isNaN(val) || val <= 0) return;
    onTempHpChange?.(val);
    setTempInput("");
    setShowTempPanel(false);
  }

  function clearTempHp() {
    onTempHpChange?.(0);
  }

  return (
    <div className={`space-y-1.5 ${deathFlash ? "animate-death-flash" : ""}`}>
      {/* HP Bar */}
      <div className="flex items-center gap-2">
        <div className={`flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden ${tempHp > 0 ? "ring-1 ring-accent-gold/40" : ""}`}>
          <div className="flex h-full">
            <div
              className="h-full rounded-l-full transition-all duration-300"
              style={{
                width: hideBar ? "100%" : `${hpPct}%`,
                backgroundColor: getHpColor(currentHp, maxHp),
                borderRadius: tempPct === 0 ? "9999px" : undefined,
              }}
            />
            {tempPct > 0 && (
              <div
                className="h-full rounded-r-full transition-all duration-300"
                style={{
                  width: `${tempPct}%`,
                  backgroundColor: "var(--color-accent-gold)",
                }}
              />
            )}
          </div>
        </div>
        <span className="text-xs text-text-secondary min-w-[60px] text-right flex items-center justify-end gap-1">
          {showExact ? (
            <>
              {`${currentHp}/${maxHp}`}
              {tempHp > 0 && (
                <span className="text-accent-gold flex items-center gap-0.5">
                  <Shield size={10} />+{tempHp}
                </span>
              )}
            </>
          ) : (
            <>
              {getHpDescription(currentHp, maxHp)}
              {tempHp > 0 && (
                <span className="text-accent-gold flex items-center gap-0.5">
                  <Shield size={10} />
                </span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Temp HP clear button (only when controls shown) */}
      {tempHp > 0 && showControls && onTempHpChange && (
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-accent-gold flex items-center gap-0.5">
            <Shield size={10} />
            Temp HP: {tempHp}
          </span>
          <button
            onClick={clearTempHp}
            className="btn btn-ghost text-[10px] px-1 py-0 text-text-muted"
            title="Clear temp HP"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Controls */}
      {showControls && (
        <>
          <div className="flex items-center justify-center gap-0.5">
            <button
              onClick={() => quickAdjust(-5)}
              className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-red"
            >
              -5
            </button>
            <button
              onClick={() => quickAdjust(-1)}
              className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-red"
            >
              -1
            </button>
            <button
              onClick={() => applyHp("damage")}
              disabled={!hpDelta}
              className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-red"
            >
              <Sword size={12} />
              Dmg
            </button>
            <input
              type="number"
              value={hpDelta}
              onChange={(e) => setHpDelta(e.target.value)}
              placeholder="HP"
              className="w-12 text-xs text-center py-1 px-1"
              min={1}
            />
            <button
              onClick={() => applyHp("heal")}
              disabled={!hpDelta}
              className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-green"
            >
              <Heart size={12} />
              Heal
            </button>
            <button
              onClick={() => quickAdjust(1)}
              className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-green"
            >
              +1
            </button>
            <button
              onClick={() => quickAdjust(5)}
              className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-green"
            >
              +5
            </button>
          </div>

          {/* Set Temp HP */}
          {onTempHpChange && tempHp === 0 && (
            <div>
              {!showTempPanel ? (
                <button
                  onClick={() => setShowTempPanel(true)}
                  className="btn btn-ghost btn-sm text-[10px] text-text-muted px-1"
                >
                  <Shield size={10} />
                  Temp HP
                </button>
              ) : (
                <div className="flex items-center gap-1 animate-fade-in">
                  <Shield size={12} className="text-accent-gold shrink-0" />
                  <input
                    type="number"
                    value={tempInput}
                    onChange={(e) => setTempInput(e.target.value)}
                    placeholder="Temp HP"
                    className="w-16 text-xs text-center py-1 px-1"
                    min={1}
                  />
                  <button
                    onClick={setTempHp}
                    disabled={!tempInput}
                    className="btn btn-ghost btn-sm text-xs text-accent-gold px-2"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => setShowTempPanel(false)}
                    className="btn btn-ghost btn-sm text-[10px] text-text-muted px-1"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
