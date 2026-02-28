"use client";

import { Sparkles, Skull } from "lucide-react";
import type { DiceRoll } from "@prisma/client";
import { DICE_CONFIG, getPrimaryDieType, isNat20, isNat1 } from "@/lib/diceConfig";

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
          diceRolls.map((roll) => {
            const nat20 = isNat20(roll.notation, roll.rolls);
            const nat1 = isNat1(roll.notation, roll.rolls);
            const dieType = getPrimaryDieType(roll.notation);
            const dieColor = dieType ? DICE_CONFIG[dieType]?.color : undefined;

            return (
              <div
                key={roll.id}
                className={`flex items-center justify-between py-1.5 px-2 rounded text-sm animate-slide-in ${
                  roll.isPrivate
                    ? "bg-accent-purple/10 border border-accent-purple/20"
                    : nat20
                    ? "bg-[var(--nat20-gold)]/10 border border-[var(--nat20-gold)]/20"
                    : nat1
                    ? "bg-[var(--nat1-red)]/10 border border-[var(--nat1-red)]/20"
                    : "bg-bg-tertiary"
                }`}
              >
                <div className="flex items-center gap-2">
                  {nat20 && <Sparkles size={14} className="text-nat20-gold" />}
                  {nat1 && <Skull size={14} className="text-nat1-red" />}
                  <span className="text-text-muted text-xs">
                    {roll.rollerName}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={dieColor ? { color: dieColor } : undefined}
                  >
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
                    className={`font-bold min-w-[24px] text-right cursor-help ${
                      nat20
                        ? "text-nat20-gold"
                        : nat1
                        ? "text-nat1-red"
                        : "text-accent-gold"
                    }`}
                    title={`Rolls: [${roll.rolls.join(", ")}]${roll.modifier !== 0 ? ` ${roll.modifier > 0 ? "+" : ""}${roll.modifier}` : ""} = ${roll.total}`}
                  >
                    {roll.total}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
