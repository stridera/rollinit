"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import type { DiceRoll } from "@prisma/client";
import type { SessionState, ClientToServerEvents } from "@/types/socket";
import type { AppSocket } from "@/lib/socketClient";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

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

  // Listen for dice results
  useEffect(() => {
    if (!socket) return;

    function onDiceResult(roll: DiceRoll) {
      setSessionState((prev) => {
        if (!prev) return prev;
        // Avoid duplicates
        if (prev.diceRolls.some((r) => r.id === roll.id)) return prev;
        return { ...prev, diceRolls: [roll, ...prev.diceRolls].slice(0, 50) };
      });
    }

    socket.on("dice:result", onDiceResult);
    return () => {
      socket.off("dice:result", onDiceResult);
    };
  }, [socket, setSessionState]);

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
    <div className="card space-y-4">
      <h3 className="text-lg">Dice Roller</h3>

      {/* Quick dice buttons */}
      <div className="flex flex-wrap gap-2">
        {DICE_TYPES.map((d) => (
          <button
            key={d.label}
            onClick={() => handleRoll(d.label)}
            className="btn btn-secondary btn-sm text-xs"
          >
            {d.label}
          </button>
        ))}
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
