"use client";

import { useState } from "react";
import type { CombatantWithInstances, ClientToServerEvents } from "@/types/socket";
import type { EncounterStatus } from "@prisma/client";
import { HpTracker } from "./HpTracker";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function CombatantList({
  combatants,
  joinCode,
  emit,
  isDM,
  activeEncounterId,
  activeEncounterStatus,
  activeEncounterCombatantIds,
}: {
  combatants: CombatantWithInstances[];
  joinCode: string;
  emit: EmitFn;
  isDM: boolean;
  activeEncounterId?: string | null;
  activeEncounterStatus?: EncounterStatus | null;
  activeEncounterCombatantIds?: Set<string>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (combatants.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-text-muted text-sm">
          No combatants yet. Add some above.
        </p>
      </div>
    );
  }

  const monsters = combatants.filter((c) => c.type === "MONSTER");
  const pcs = combatants.filter((c) => c.type === "PLAYER_CHARACTER");
  const npcs = combatants.filter((c) => c.type === "NPC");

  return (
    <div className="space-y-4">
      <h3 className="text-lg">
        Combatants{" "}
        <span className="text-text-muted text-sm font-normal">
          ({combatants.length})
        </span>
      </h3>

      {pcs.length > 0 && (
        <CombatantGroup
          label="Player Characters"
          combatants={pcs}
          joinCode={joinCode}
          emit={emit}
          isDM={isDM}
          editingId={editingId}
          setEditingId={setEditingId}
          activeEncounterId={activeEncounterId}
          activeEncounterStatus={activeEncounterStatus}
          activeEncounterCombatantIds={activeEncounterCombatantIds}
        />
      )}

      {monsters.length > 0 && (
        <CombatantGroup
          label="Monster Templates"
          combatants={monsters}
          joinCode={joinCode}
          emit={emit}
          isDM={isDM}
          editingId={editingId}
          setEditingId={setEditingId}
          activeEncounterId={activeEncounterId}
          activeEncounterStatus={activeEncounterStatus}
          activeEncounterCombatantIds={activeEncounterCombatantIds}
        />
      )}

      {npcs.length > 0 && (
        <CombatantGroup
          label="NPCs"
          combatants={npcs}
          joinCode={joinCode}
          emit={emit}
          isDM={isDM}
          editingId={editingId}
          setEditingId={setEditingId}
          activeEncounterId={activeEncounterId}
          activeEncounterStatus={activeEncounterStatus}
          activeEncounterCombatantIds={activeEncounterCombatantIds}
        />
      )}
    </div>
  );
}

function CombatantGroup({
  label,
  combatants,
  joinCode,
  emit,
  isDM,
  editingId,
  setEditingId,
  activeEncounterId,
  activeEncounterStatus,
  activeEncounterCombatantIds,
}: {
  label: string;
  combatants: CombatantWithInstances[];
  joinCode: string;
  emit: EmitFn;
  isDM: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  activeEncounterId?: string | null;
  activeEncounterStatus?: EncounterStatus | null;
  activeEncounterCombatantIds?: Set<string>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-text-muted text-xs uppercase tracking-wider">
        {label}
      </p>
      {combatants.map((c) => (
        <CombatantCard
          key={c.id}
          combatant={c}
          joinCode={joinCode}
          emit={emit}
          isDM={isDM}
          isEditing={editingId === c.id}
          onToggleEdit={() =>
            setEditingId(editingId === c.id ? null : c.id)
          }
          activeEncounterId={activeEncounterId}
          activeEncounterStatus={activeEncounterStatus}
          activeEncounterCombatantIds={activeEncounterCombatantIds}
        />
      ))}
    </div>
  );
}

function CombatantCard({
  combatant,
  joinCode,
  emit,
  isDM,
  isEditing,
  onToggleEdit,
  activeEncounterId,
  activeEncounterStatus,
  activeEncounterCombatantIds,
}: {
  combatant: CombatantWithInstances;
  joinCode: string;
  emit: EmitFn;
  isDM: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  activeEncounterId?: string | null;
  activeEncounterStatus?: EncounterStatus | null;
  activeEncounterCombatantIds?: Set<string>;
}) {
  const isMonster = combatant.type === "MONSTER";
  const isPC = combatant.type === "PLAYER_CHARACTER";

  const canAddToCombat =
    isDM &&
    activeEncounterId &&
    (activeEncounterStatus === "ACTIVE" || activeEncounterStatus === "ROLLING");
  const isInCombat = activeEncounterCombatantIds?.has(combatant.id) ?? false;

  const typeColor = isMonster
    ? "text-accent-red"
    : isPC
    ? "text-accent-green"
    : "text-accent-blue";

  function handleHpChange(newHp: number) {
    emit("combatant:update", {
      joinCode,
      combatantId: combatant.id,
      updates: { currentHp: newHp },
    });
  }

  return (
    <div className="card py-2 px-3 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs ${typeColor}`}>
            {isMonster ? "MON" : isPC ? "PC" : "NPC"}
          </span>
          <span className="font-medium text-sm">{combatant.name}</span>
          {isPC && (
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                combatant.playerSocketId ? "bg-accent-green" : "bg-text-muted/30"
              }`}
              title={combatant.playerSocketId ? "Online" : "Offline"}
            />
          )}
          {combatant.isHidden && isDM && (
            <span className="text-[10px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded">
              Hidden
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            AC {combatant.armorClass}
          </span>
          <span className="text-xs text-text-muted">
            Init {combatant.initiativeBonus >= 0 ? "+" : ""}
            {combatant.initiativeBonus}
          </span>
          {isDM && (
            <div className="flex gap-1">
              <button
                onClick={onToggleEdit}
                className="btn btn-ghost btn-sm text-xs"
              >
                {isEditing ? "Done" : "Edit"}
              </button>
              <button
                onClick={() =>
                  emit("combatant:remove", {
                    joinCode,
                    combatantId: combatant.id,
                  })
                }
                className="btn btn-ghost btn-sm text-xs text-accent-red"
              >
                &times;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* HP Tracker — only for PCs/NPCs (monsters are templates, HP tracked per-instance) */}
      {!isMonster && (
        <HpTracker
          currentHp={combatant.currentHp}
          maxHp={combatant.maxHp}
          onHpChange={handleHpChange}
          showControls={isDM || isPC}
          showExact={isDM || isPC}
        />
      )}

      {/* Monster template stats summary */}
      {isMonster && (
        <div className="text-xs text-text-muted">
          HP {combatant.maxHp} &middot; AC {combatant.armorClass} &middot;
          Init {combatant.initiativeBonus >= 0 ? "+" : ""}{combatant.initiativeBonus}
        </div>
      )}

      {/* Auto-join toggle for PCs/NPCs */}
      {isDM && !isMonster && (
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={combatant.autoJoin}
            onChange={(e) =>
              emit("combatant:update", {
                joinCode,
                combatantId: combatant.id,
                updates: { autoJoin: e.target.checked },
              })
            }
            className="accent-accent-gold"
          />
          Auto-join encounters
        </label>
      )}

      {/* Add to combat button */}
      {canAddToCombat && (
        <button
          onClick={() =>
            emit("encounter:addCombatant", {
              joinCode,
              encounterId: activeEncounterId,
              combatantId: combatant.id,
            })
          }
          disabled={!isMonster && isInCombat}
          className={`btn btn-sm w-full text-xs ${
            !isMonster && isInCombat
              ? "btn-ghost text-text-muted cursor-default"
              : "btn-secondary"
          }`}
        >
          {!isMonster && isInCombat ? "In combat" : "+ Combat"}
        </button>
      )}

      {/* Editing panel */}
      {isEditing && isDM && (
        <CombatantEditor
          combatant={combatant}
          joinCode={joinCode}
          emit={emit}
        />
      )}
    </div>
  );
}

function CombatantEditor({
  combatant,
  joinCode,
  emit,
}: {
  combatant: CombatantWithInstances;
  joinCode: string;
  emit: EmitFn;
}) {
  const [name, setName] = useState(combatant.name);
  const [initBonus, setInitBonus] = useState(combatant.initiativeBonus);
  const [ac, setAc] = useState(combatant.armorClass);
  const [maxHp, setMaxHp] = useState(combatant.maxHp);

  function save() {
    emit("combatant:update", {
      joinCode,
      combatantId: combatant.id,
      updates: {
        name,
        initiativeBonus: initBonus,
        armorClass: ac,
        maxHp,
        currentHp: Math.min(combatant.currentHp, maxHp),
      },
    });
  }

  return (
    <div className="space-y-2 pt-2 border-t border-border animate-fade-in">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-sm"
        placeholder="Name"
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-text-muted">Init</label>
          <input
            type="number"
            value={initBonus}
            onChange={(e) => setInitBonus(Number(e.target.value))}
            className="w-full text-sm text-center"
          />
        </div>
        <div>
          <label className="text-[10px] text-text-muted">Max HP</label>
          <input
            type="number"
            value={maxHp}
            onChange={(e) => setMaxHp(Number(e.target.value))}
            className="w-full text-sm text-center"
            min={1}
          />
        </div>
        <div>
          <label className="text-[10px] text-text-muted">AC</label>
          <input
            type="number"
            value={ac}
            onChange={(e) => setAc(Number(e.target.value))}
            className="w-full text-sm text-center"
          />
        </div>
      </div>
      <button onClick={save} className="btn btn-primary btn-sm w-full">
        Save Changes
      </button>
    </div>
  );
}
