"use client";

import { useState } from "react";
import {
  GripVertical,
  Skull,
  Eye,
  Dice6,
  Check,
  HeartPulse,
} from "lucide-react";
import type { EncounterWithCombatants, ClientToServerEvents } from "@/types/socket";
import { getTypeColor, getTypeLabel } from "@/lib/combatantTypes";
import { HpTracker } from "./HpTracker";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function InitiativeList({
  encounter,
  isDM,
  joinCode,
  emit,
  readOnly,
  playerCombatantId,
  physicalDice,
  showMonsterHpBar,
  hideCurrentTurn,
}: {
  encounter: EncounterWithCombatants;
  isDM: boolean;
  joinCode: string;
  emit: EmitFn;
  readOnly?: boolean;
  playerCombatantId?: string | null;
  physicalDice?: boolean;
  showMonsterHpBar?: boolean;
  hideCurrentTurn?: boolean;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const canDrag =
    !readOnly && isDM && (encounter.status === "ACTIVE" || encounter.status === "ROLLING");

  const activeEntries = encounter.combatants
    .filter((ec) => ec.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const deadEntries = encounter.combatants.filter((ec) => !ec.isActive);

  // Rotate so current turn is at top (both DM and player views)
  const isActive = encounter.status === "ACTIVE";
  const shouldRotate = isActive && activeEntries.length > 0 && encounter.currentTurnIdx > 0;
  const rotatedEntries = shouldRotate
    ? [
        ...activeEntries.slice(encounter.currentTurnIdx),
        ...activeEntries.slice(0, encounter.currentTurnIdx),
      ]
    : activeEntries;

  // When hideCurrentTurn is set, skip the current entry (shown in banner instead)
  const displayEntries = hideCurrentTurn && isActive
    ? rotatedEntries.filter((_, idx) => !(shouldRotate ? idx === 0 : idx === encounter.currentTurnIdx))
    : rotatedEntries;

  return (
    <div className="space-y-3">
      <h3 className="text-lg">
        Initiative Order
        {isActive && (
          <span className="text-text-muted text-sm font-normal ml-2">
            Round {encounter.roundNumber}
          </span>
        )}
      </h3>

      {displayEntries.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-4">
          No active combatants
        </p>
      ) : (
        <div className="space-y-1">
          {displayEntries.map((entry, idx) => {
            // Always use original index for current turn detection
            const originalIdx = activeEntries.indexOf(entry);
            const isCurrent =
              isActive && originalIdx === encounter.currentTurnIdx;

            // Position label (both views)
            let positionLabel: string | null = null;
            if (isActive) {
              if (idx === 0) positionLabel = "NOW";
              else if (idx === 1) positionLabel = "ON DECK";
            }

            // Drag-reorder needs original sorted index for server
            const dragIdx = originalIdx;

            // Resolve owner name for companions
            const ownerName = entry.combatant.type === "COMPANION" && entry.combatant.ownerId
              ? encounter.combatants.find((ec) => ec.combatantId === entry.combatant.ownerId)?.displayName ?? null
              : null;

            return (
              <InitiativeCard
                key={entry.id}
                entry={entry}
                isCurrent={isCurrent}
                isDM={isDM}
                joinCode={joinCode}
                encounterId={encounter.id}
                isRolling={encounter.status === "ROLLING"}
                emit={emit}
                readOnly={readOnly}
                playerCombatantId={playerCombatantId}
                physicalDice={physicalDice}
                showMonsterHpBar={showMonsterHpBar}
                ownerName={ownerName}
                draggable={canDrag}
                isDragOver={dragOverIdx === dragIdx}
                positionLabel={positionLabel}
                onDragStart={() => setDraggedId(entry.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIdx(dragIdx);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverIdx(null);
                }}
                onDrop={() => {
                  if (draggedId && draggedId !== entry.id) {
                    emit("combat:reorder", {
                      joinCode,
                      encounterId: encounter.id,
                      instanceId: draggedId,
                      newIndex: dragIdx,
                    });
                  }
                  setDraggedId(null);
                  setDragOverIdx(null);
                }}
              />
            );
          })}
        </div>
      )}

      {/* Dead combatants */}
      {deadEntries.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-dashed border-accent-red/30">
          <p className="text-accent-red/60 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Skull size={12} />
            Fallen
          </p>
          {deadEntries.map((entry) => (
            <div
              key={entry.id}
              className="card combatant-dead py-2 px-3 flex items-center justify-between transition-all duration-300"
            >
              <div className="flex items-center gap-2">
                <Skull size={12} className="text-accent-red/40" />
                <span className={`text-sm ${entry.combatant.type === "MONSTER" ? "text-accent-red" : ""}`}>{entry.displayName}</span>
                {entry.initiative !== null && (
                  <span className="text-xs text-text-muted">
                    ({entry.initiative})
                  </span>
                )}
              </div>
              {isDM && !readOnly && (
                <button
                  onClick={() =>
                    emit("combat:toggleActive", {
                      joinCode,
                      encounterId: encounter.id,
                      instanceId: entry.id,
                    })
                  }
                  className="btn btn-ghost btn-sm text-xs text-accent-green"
                >
                  <HeartPulse size={14} />
                  Revive
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InitiativeCard({
  entry,
  isCurrent,
  isDM,
  joinCode,
  encounterId,
  isRolling,
  emit,
  readOnly,
  draggable,
  isDragOver,
  positionLabel,
  playerCombatantId,
  physicalDice,
  showMonsterHpBar,
  ownerName,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  entry: EncounterWithCombatants["combatants"][number];
  isCurrent: boolean;
  isDM: boolean;
  joinCode: string;
  encounterId: string;
  isRolling: boolean;
  emit: EmitFn;
  readOnly?: boolean;
  draggable?: boolean;
  isDragOver?: boolean;
  positionLabel?: string | null;
  playerCombatantId?: string | null;
  physicalDice?: boolean;
  showMonsterHpBar?: boolean;
  ownerName?: string | null;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}) {
  const [manualInit, setManualInit] = useState("");

  const typeColor = getTypeColor(entry.combatant.type);

  const showExactHp = isDM || (entry.combatant.type !== "MONSTER");
  const isOwnCombatant = !!playerCombatantId && entry.combatantId === playerCombatantId;
  const isOwnCompanion = !!playerCombatantId && entry.combatant.ownerId === playerCombatantId;
  const showHpControls = !readOnly && (isDM || isOwnCombatant || isOwnCompanion);
  const hideHpBar = !isDM && entry.combatant.type === "MONSTER" && showMonsterHpBar === false;

  function handleManualRoll() {
    const val = parseInt(manualInit);
    if (isNaN(val)) return;
    emit("combat:rollInitiative", {
      joinCode,
      encounterId,
      instanceId: entry.id,
      value: val,
    });
    setManualInit("");
  }

  function handleAutoRoll() {
    emit("combat:rollInitiative", {
      joinCode,
      encounterId,
      instanceId: entry.id,
    });
  }

  function handleHpChange(newHp: number) {
    emit("instance:update", {
      joinCode,
      encounterId,
      instanceId: entry.id,
      updates: { currentHp: newHp },
    });
  }

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", entry.id);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragEnter={(e) => e.preventDefault()}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
      className={`card py-2 px-3 transition-all duration-300 ${
        isCurrent ? "current-turn" : ""
      } ${isDragOver ? "ring-2 ring-accent-gold" : ""} ${
        draggable ? "cursor-grab select-none" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          {draggable && (
            <GripVertical size={16} className="text-text-muted" />
          )}
          {/* Initiative number */}
          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-bold">
            {entry.initiative ?? "?"}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] ${typeColor}`}>
                {getTypeLabel(entry.combatant.type)}
              </span>
              <span
                className={`text-sm font-medium ${
                  isCurrent ? "text-accent-gold" : entry.combatant.type === "MONSTER" ? "text-accent-red" : ""
                }`}
              >
                {entry.displayName}
              </span>
              {ownerName && (
                <span className="text-[10px] text-text-muted">
                  ({ownerName})
                </span>
              )}
              {entry.isHidden && isDM && (
                <span className="text-[10px] bg-accent-purple/20 text-accent-purple px-1.5 py-0.5 rounded">
                  Hidden
                </span>
              )}
            </div>
            {isCurrent && (
              <span className="text-[10px] text-accent-gold uppercase tracking-wider">
                Current Turn
              </span>
            )}
            {positionLabel && !isCurrent && (
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                {positionLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && isRolling && entry.initiative === null && (isDM || entry.combatantId === playerCombatantId || (playerCombatantId && entry.combatant.ownerId === playerCombatantId)) && (
            <>
              {(isDM || physicalDice) && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={manualInit}
                    onChange={(e) => setManualInit(e.target.value)}
                    placeholder="Roll"
                    className="w-12 text-xs text-center py-1"
                  />
                  <button
                    onClick={handleManualRoll}
                    className="btn btn-ghost btn-sm text-xs"
                    disabled={!manualInit}
                  >
                    <Check size={14} />
                  </button>
                </div>
              )}
              <button
                onClick={handleAutoRoll}
                className="btn btn-secondary btn-sm text-xs"
              >
                <Dice6 size={14} />
                Roll
              </button>
            </>
          )}
          {!readOnly && isDM && entry.isHidden && (
            <button
              onClick={() =>
                emit("instance:update", {
                  joinCode,
                  encounterId,
                  instanceId: entry.id,
                  updates: { isHidden: false },
                })
              }
              className="btn btn-ghost btn-sm text-xs text-accent-purple"
            >
              <Eye size={14} />
              Reveal
            </button>
          )}
          {!readOnly && isDM && !isRolling && (
            <button
              onClick={() =>
                emit("combat:toggleActive", {
                  joinCode,
                  encounterId,
                  instanceId: entry.id,
                })
              }
              className="btn btn-ghost btn-sm text-xs text-accent-red"
              title="Kill / KO"
            >
              <Skull size={14} />
            </button>
          )}
        </div>
      </div>

      {/* HP bar for each instance */}
      <div className="mt-1.5">
        <HpTracker
          currentHp={entry.currentHp}
          maxHp={entry.maxHp}
          onHpChange={handleHpChange}
          showControls={showHpControls}
          showExact={showExactHp}
          hideBar={hideHpBar}
        />
      </div>
    </div>
  );
}
