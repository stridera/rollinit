"use client";

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { LucideProps } from "lucide-react";
import {
  Triangle,
  Dice6,
  Octagon,
  Diamond,
  Pentagon,
  Hexagon,
  Circle,
} from "lucide-react";
import type { DiceRoll } from "@prisma/client";
import type { SessionState, ClientToServerEvents } from "@/types/socket";
import type { AppSocket } from "@/lib/socketClient";
import { DICE_CONFIG, isNat20, isNat1 } from "@/lib/diceConfig";
import { DiceSpotlight } from "./DiceSpotlight";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Triangle,
  Dice6,
  Octagon,
  Diamond,
  Pentagon,
  Hexagon,
  Circle,
};

const DICE_TYPES = [
  { label: "d4", sides: 4 },
  { label: "d6", sides: 6 },
  { label: "d8", sides: 8 },
  { label: "d10", sides: 10 },
  { label: "d12", sides: 12 },
  { label: "d20", sides: 20 },
  { label: "d100", sides: 100 },
];

export function DiceRoller({
  joinCode,
  rollerName,
  isDM,
  emit,
  setSessionState,
  socket,
}: {
  joinCode: string;
  rollerName: string;
  isDM: boolean;
  emit: EmitFn;
  setSessionState: Dispatch<SetStateAction<SessionState | null>>;
  socket: AppSocket | null;
}) {
  const [notation, setNotation] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [spotlight, setSpotlight] = useState<{
    total: number;
    isNat20: boolean;
    isNat1: boolean;
    dieColor: string;
  } | null>(null);
  const spotlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for dice results
  useEffect(() => {
    if (!socket) return;

    function onDiceResult(roll: DiceRoll) {
      setSessionState((prev) => {
        if (!prev) return prev;
        if (prev.diceRolls.some((r) => r.id === roll.id)) return prev;
        return { ...prev, diceRolls: [roll, ...prev.diceRolls].slice(0, 50) };
      });

      // Show spotlight for this user's rolls
      if (roll.rollerName === rollerName) {
        const nat20 = isNat20(roll.notation, roll.rolls);
        const nat1 = isNat1(roll.notation, roll.rolls);
        const dieMatch = roll.notation.match(/d(\d+)/i);
        const dieKey = dieMatch ? `d${dieMatch[1]}` : "d20";
        const config = DICE_CONFIG[dieKey] ?? DICE_CONFIG.d20;

        setSpotlight({
          total: roll.total,
          isNat20: nat20,
          isNat1: nat1,
          dieColor: config.color,
        });

        if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
        spotlightTimer.current = setTimeout(
          () => setSpotlight(null),
          nat20 || nat1 ? 2500 : 1500
        );
      }
    }

    socket.on("dice:result", onDiceResult);
    return () => {
      socket.off("dice:result", onDiceResult);
    };
  }, [socket, setSessionState, rollerName]);

  function handleRoll(diceNotation: string) {
    if (!diceNotation.trim()) return;
    emit("dice:roll", {
      joinCode,
      notation: diceNotation.trim(),
      rollerName,
      isPrivate,
    });
    setNotation("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleRoll(notation);
  }

  return (
    <div className="card space-y-4 relative overflow-hidden">
      {spotlight && <DiceSpotlight {...spotlight} />}

      <h3 className="text-lg">Dice Roller</h3>

      {/* Color-coded dice buttons */}
      <div className="flex gap-1.5 items-end justify-center">
        {DICE_TYPES.map((d) => {
          const config = DICE_CONFIG[d.label];
          const IconComponent = ICON_MAP[config.icon];
          const isD20 = d.label === "d20";
          const isD100 = d.label === "d100";

          return (
            <button
              key={d.label}
              onClick={() => handleRoll(d.label)}
              className="flex flex-col items-center gap-0.5 rounded-lg border-2 transition-all hover:scale-105 active:scale-95"
              style={{
                borderColor: config.color,
                background: `color-mix(in srgb, ${config.color} 8%, transparent)`,
                padding: isD20 ? "0.5rem 0.6rem" : "0.35rem 0.45rem",
              }}
              title={`Roll ${d.label}`}
            >
              <IconComponent
                size={isD20 ? 24 : isD100 ? 16 : 18}
                className="transition-colors"
                color={config.color}
              />
              <span
                className={`font-bold ${isD100 ? "text-[10px]" : "text-xs"}`}
                style={{ color: config.color }}
              >
                {d.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notation input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={notation}
          onChange={(e) => setNotation(e.target.value)}
          placeholder="2d6+3"
          className="flex-1 text-sm"
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Roll
        </button>
      </form>

      {/* DM private toggle */}
      {isDM && (
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="accent-accent-gold"
          />
          Private roll (DM only)
        </label>
      )}
    </div>
  );
}
