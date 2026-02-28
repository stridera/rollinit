"use client";

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
      <p className="text-text-muted text-xs uppercase tracking-wider mb-1">
        Current Turn
      </p>
      <h2 className="text-3xl text-accent-gold">
        {currentEntry.displayName}
      </h2>
      <p className="text-text-secondary text-sm mt-1">
        Round {encounter.roundNumber} &middot; Initiative{" "}
        {currentEntry.initiative ?? "?"}
      </p>
    </div>
  );
}
