"use client";

import { Swords, RotateCw, Zap } from "lucide-react";
import type { EncounterWithCombatants } from "@/types/socket";

export function CurrentTurnBanner({
  encounter,
}: {
  encounter: EncounterWithCombatants;
}) {
  const activeEntries = encounter.combatants.filter(
    (ec) => ec.isActive
  );
  const currentEntry = activeEntries[encounter.currentTurnIdx];

  if (!currentEntry) return null;

  return (
    <div className="card current-turn text-center py-6">
      <Swords size={28} className="text-accent-gold mx-auto mb-2 opacity-60" />
      <p className="text-text-muted text-xs uppercase tracking-wider mb-1">
        Current Turn
      </p>
      <h2 className="text-4xl md:text-5xl text-accent-gold">
        {currentEntry.displayName}
      </h2>
      <div className="flex items-center justify-center gap-3 text-text-secondary text-sm mt-2">
        <span className="flex items-center gap-1">
          <RotateCw size={12} />
          Round {encounter.roundNumber}
        </span>
        <span className="flex items-center gap-1">
          <Zap size={12} />
          Initiative {currentEntry.initiative ?? "?"}
        </span>
      </div>
    </div>
  );
}
