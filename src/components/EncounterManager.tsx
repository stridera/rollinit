"use client";

import { useState } from "react";
import type {
  EncounterWithCombatants,
  CombatantWithInstances,
  ClientToServerEvents,
  MonsterEntry,
} from "@/types/socket";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function EncounterManager({
  encounters,
  activeEncounterId,
  combatants,
  joinCode,
  emit,
  selectedEncounterId,
  onSelectEncounter,
}: {
  encounters: EncounterWithCombatants[];
  activeEncounterId: string | null;
  combatants: CombatantWithInstances[];
  joinCode: string;
  emit: EmitFn;
  selectedEncounterId?: string | null;
  onSelectEncounter?: (id: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [monsterVisible, setMonsterVisible] = useState<Record<string, number>>({});
  const [monsterHidden, setMonsterHidden] = useState<Record<string, number>>({});
  const [excludedPcIds, setExcludedPcIds] = useState<Set<string>>(new Set());

  const monsters = combatants.filter((c) => c.type === "MONSTER");
  const pcsAndNpcs = combatants.filter(
    (c) => c.type === "PLAYER_CHARACTER" || c.type === "NPC"
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const monstersPayload: MonsterEntry[] = [];

    for (const [combatantId, count] of Object.entries(monsterVisible)) {
      if (count > 0) {
        monstersPayload.push({ combatantId, count, isHidden: false });
      }
    }
    for (const [combatantId, count] of Object.entries(monsterHidden)) {
      if (count > 0) {
        monstersPayload.push({ combatantId, count, isHidden: true });
      }
    }

    emit("encounter:create", {
      joinCode,
      name: newName.trim(),
      monsters: monstersPayload,
      excludePcIds: Array.from(excludedPcIds),
    });

    setNewName("");
    setMonsterVisible({});
    setMonsterHidden({});
    setExcludedPcIds(new Set());
    setCreating(false);
  }

  function toggleExcludePc(id: string) {
    setExcludedPcIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function addVisible(id: string) {
    setMonsterVisible((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }

  function addHidden(id: string) {
    setMonsterHidden((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }

  function clearMonster(id: string) {
    setMonsterVisible((prev) => ({ ...prev, [id]: 0 }));
    setMonsterHidden((prev) => ({ ...prev, [id]: 0 }));
  }

  const statusColors: Record<string, string> = {
    PREPARING: "text-text-muted",
    ROLLING: "text-accent-blue",
    ACTIVE: "text-accent-green",
    COMPLETED: "text-text-muted",
  };

  const statusLabels: Record<string, string> = {
    PREPARING: "Preparing",
    ROLLING: "Rolling Initiative",
    ACTIVE: "In Combat",
    COMPLETED: "Completed",
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">Encounters</h3>
        <button
          onClick={() => setCreating(!creating)}
          className="btn btn-ghost btn-sm text-xs"
        >
          {creating ? "Cancel" : "+ New"}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="space-y-3 animate-fade-in">
          <input
            type="text"
            placeholder="Encounter name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full text-sm"
            autoFocus
          />

          {/* Monster template picker with counts */}
          {monsters.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-text-muted text-xs uppercase tracking-wider">
                Monsters
              </p>
              {monsters.map((m) => {
                const vis = monsterVisible[m.id] ?? 0;
                const hid = monsterHidden[m.id] ?? 0;
                const total = vis + hid;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-text-secondary truncate flex-1">
                      {m.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => addVisible(m.id)}
                        className="btn btn-ghost btn-sm text-[10px] px-1.5 text-accent-green"
                        title="Add visible"
                      >
                        + Add
                      </button>
                      <button
                        type="button"
                        onClick={() => addHidden(m.id)}
                        className="btn btn-ghost btn-sm text-[10px] px-1.5 text-accent-purple"
                        title="Add hidden"
                      >
                        + Hidden
                      </button>
                      <span className="w-auto min-w-[1.5rem] text-center text-sm px-1">
                        {total === 0
                          ? "0"
                          : hid === 0
                          ? `${vis}`
                          : vis === 0
                          ? `${hid} hidden`
                          : `${vis} + ${hid} hidden`}
                      </span>
                      {total > 0 && (
                        <button
                          type="button"
                          onClick={() => clearMonster(m.id)}
                          className="btn btn-ghost btn-sm text-xs px-1.5 text-accent-red"
                          title="Clear"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PC inclusion checkboxes */}
          {pcsAndNpcs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-text-muted text-xs uppercase tracking-wider">
                Party Members
              </p>
              {pcsAndNpcs.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!excludedPcIds.has(c.id) && c.autoJoin}
                    disabled={!c.autoJoin}
                    onChange={() => toggleExcludePc(c.id)}
                    className="accent-accent-gold"
                  />
                  <span className={!c.autoJoin ? "line-through text-text-muted" : ""}>
                    {c.name}
                  </span>
                  {!c.autoJoin && (
                    <span className="text-[10px] text-text-muted">(auto-join off)</span>
                  )}
                </label>
              ))}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full btn-sm">
            Create Encounter
          </button>
        </form>
      )}

      {encounters.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-4">
          No encounters yet
        </p>
      ) : (
        <div className="space-y-1">
          {encounters.map((enc) => {
            const isSelected = enc.id === (selectedEncounterId ?? activeEncounterId);
            return (
              <button
                key={enc.id}
                onClick={() => {
                  if (enc.status === "COMPLETED") {
                    onSelectEncounter?.(
                      selectedEncounterId === enc.id ? null : enc.id
                    );
                  } else {
                    emit("encounter:select", {
                      joinCode,
                      encounterId: enc.id,
                    });
                    onSelectEncounter?.(null);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? "bg-bg-tertiary border border-accent-gold/30"
                    : "hover:bg-bg-tertiary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{enc.name}</span>
                  <span
                    className={`text-xs ${statusColors[enc.status]}`}
                  >
                    {statusLabels[enc.status]}
                  </span>
                </div>
                {enc.status === "ACTIVE" && (
                  <p className="text-text-muted text-xs mt-0.5">
                    Round {enc.roundNumber} &middot;{" "}
                    {enc.combatants.filter((ec) => ec.isActive).length}{" "}
                    combatants
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
