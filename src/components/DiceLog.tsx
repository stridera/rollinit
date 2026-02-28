"use client";

import type { DiceRoll } from "@prisma/client";

export function DiceLog({ diceRolls }: { diceRolls: DiceRoll[] }) {
  return (
    <div className="card space-y-2">
      <h3 className="text-lg">Roll Log</h3>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {diceRolls.length === 0 ? (
          <p className="text-text-muted text-xs text-center py-4">
            No rolls yet
          </p>
        ) : (
          diceRolls.map((roll) => (
            <div
              key={roll.id}
              className={`flex items-center justify-between py-1.5 px-2 rounded text-sm animate-slide-in ${
                roll.isPrivate
                  ? "bg-accent-purple/10 border border-accent-purple/20"
                  : "bg-bg-tertiary"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-xs">
                  {roll.rollerName}
                </span>
                <span className="text-accent-gold text-xs">
                  {roll.notation}
                </span>
                {roll.isPrivate && (
                  <span className="text-[10px] text-accent-purple">
                    (private)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-xs">
                  [{roll.rolls.join(", ")}]
                  {roll.modifier !== 0 &&
                    `${roll.modifier > 0 ? "+" : ""}${roll.modifier}`}
                </span>
                <span
                  className="font-bold text-accent-gold min-w-[24px] text-right cursor-help"
                  title={`Rolls: [${roll.rolls.join(", ")}]${roll.modifier !== 0 ? ` ${roll.modifier > 0 ? "+" : ""}${roll.modifier}` : ""} = ${roll.total}`}
                >
                  {roll.total}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
