"use client";

import { Swords, RotateCw, Zap } from "lucide-react";
import type { EncounterWithCombatants } from "@/types/socket";
import { getTypeColor, getTypeLabel } from "@/lib/combatantTypes";
import { HpTracker } from "./HpTracker";

export function CurrentTurnBanner({
  encounter,
  showMonsterHpBar,
  showHpControls,
  onHpChange,
  onTempHpChange,
}: {
  encounter: EncounterWithCombatants;
  showMonsterHpBar?: boolean;
  showHpControls?: boolean;
  onHpChange?: (instanceId: string, newHp: number) => void;
  onTempHpChange?: (instanceId: string, tempHp: number) => void;
}) {
  const activeEntries = encounter.combatants.filter(
    (ec) => ec.isActive
  );
  const currentEntry = activeEntries[encounter.currentTurnIdx];

  if (!currentEntry) return null;

  const isMonster = currentEntry.combatant.type === "MONSTER";
  const showExact = !isMonster;
  const hideBar = isMonster && showMonsterHpBar === false;

  const typeColor = getTypeColor(currentEntry.combatant.type);

  return (
    <div className="card current-turn text-center py-6">
      <Swords size={28} className="text-accent-gold mx-auto mb-2 opacity-60" />
      <p className="text-text-muted text-xs uppercase tracking-wider mb-1">
        Current Turn
      </p>
      <h2 className={`text-4xl md:text-5xl ${currentEntry.combatant.type === "MONSTER" ? "text-accent-red" : "text-accent-gold"}`}>
        {currentEntry.displayName}
      </h2>
      <div className="flex items-center justify-center gap-3 text-text-secondary text-sm mt-2">
        <span className={`text-xs font-medium ${typeColor}`}>
          {getTypeLabel(currentEntry.combatant.type)}
        </span>
        <span className="flex items-center gap-1">
          <RotateCw size={12} />
          Round {encounter.roundNumber}
        </span>
        <span className="flex items-center gap-1">
          <Zap size={12} />
          Initiative {currentEntry.initiative ?? "?"}
        </span>
      </div>
      <div className="mt-3 max-w-xs mx-auto">
        <HpTracker
          currentHp={currentEntry.currentHp}
          maxHp={currentEntry.maxHp}
          tempHp={currentEntry.tempHp}
          onHpChange={(newHp) => onHpChange?.(currentEntry.id, newHp)}
          onTempHpChange={showHpControls ? (tempHp) => onTempHpChange?.(currentEntry.id, tempHp) : undefined}
          showControls={!!showHpControls}
          showExact={showExact}
          hideBar={hideBar}
        />
      </div>
    </div>
  );
}
