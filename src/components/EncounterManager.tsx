"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Plus,
  Minus,
  Clock,
  Dice6,
  Swords,
  CheckCircle,
} from "lucide-react";
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

const STATUS_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  PREPARING: Clock,
  ROLLING: Dice6,
  ACTIVE: Swords,
  COMPLETED: CheckCircle,
};

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

  function adjustCount(
    setter: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    id: string,
    delta: number
  ) {
    setter((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) + delta),
    }));
  }

  // Summary totals
  const totalVisible = Object.values(monsterVisible).reduce((s, n) => s + n, 0);
  const totalHidden = Object.values(monsterHidden).reduce((s, n) => s + n, 0);

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

          {/* Monster template picker with steppers */}
          {monsters.length > 0 && (
            <div className="space-y-2">
              <p className="text-text-muted text-xs uppercase tracking-wider">
                Monsters
              </p>
              {monsters.map((m) => {
                const vis = monsterVisible[m.id] ?? 0;
                const hid = monsterHidden[m.id] ?? 0;
                return (
                  <div key={m.id} className="space-y-1">
                    <span className="text-text-secondary text-sm truncate">
                      {m.name}
                    </span>
                    <div className="flex items-center gap-3 ml-2">
                      {/* Visible stepper */}
                      <div className="flex items-center gap-1">
                        <Eye size={12} className="text-accent-green" />
                        <button
                          type="button"
                          onClick={() => adjustCount(setMonsterVisible, m.id, -1)}
                          disabled={vis === 0}
                          className="btn btn-ghost btn-sm text-xs px-1.5 py-0.5"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-sm w-5 text-center">{vis}</span>
                        <button
                          type="button"
                          onClick={() => adjustCount(setMonsterVisible, m.id, 1)}
                          className="btn btn-ghost btn-sm text-xs px-1.5 py-0.5"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      {/* Hidden stepper */}
                      <div className="flex items-center gap-1">
                        <EyeOff size={12} className="text-accent-purple" />
                        <button
                          type="button"
                          onClick={() => adjustCount(setMonsterHidden, m.id, -1)}
                          disabled={hid === 0}
                          className="btn btn-ghost btn-sm text-xs px-1.5 py-0.5"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-sm w-5 text-center">{hid}</span>
                        <button
                          type="button"
                          onClick={() => adjustCount(setMonsterHidden, m.id, 1)}
                          className="btn btn-ghost btn-sm text-xs px-1.5 py-0.5"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(totalVisible > 0 || totalHidden > 0) && (
                <p className="text-text-muted text-xs mt-1">
                  Total: {totalVisible} visible{totalHidden > 0 ? `, ${totalHidden} hidden` : ""}
                </p>
              )}
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
            const StatusIcon = STATUS_ICONS[enc.status] ?? Clock;
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
                    className={`text-xs flex items-center gap-1 ${statusColors[enc.status]}`}
                  >
                    <StatusIcon size={12} />
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
