"use client";

import { ChevronLeft, ChevronRight, StopCircle, Dice6, Swords } from "lucide-react";
import type { EncounterWithCombatants, ClientToServerEvents } from "@/types/socket";

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function CombatControls({
  encounter,
  joinCode,
  emit,
}: {
  encounter: EncounterWithCombatants;
  joinCode: string;
  emit: EmitFn;
}) {
  const allRolled = encounter.combatants.every(
    (ec) => ec.initiative !== null
  );
  const activeCount = encounter.combatants.filter(
    (ec) => ec.isActive
  ).length;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg">Combat</h3>
        {encounter.status === "ACTIVE" && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-gold/15 text-accent-gold text-xs font-bold font-[family-name:var(--font-heading)]">
            Round {encounter.roundNumber}
          </span>
        )}
      </div>

      {encounter.status === "PREPARING" && (
        <button
          onClick={() =>
            emit("combat:startRolling", {
              joinCode,
              encounterId: encounter.id,
            })
          }
          className="btn btn-primary w-full"
          disabled={encounter.combatants.length === 0}
        >
          <Dice6 size={18} />
          Start Rolling Initiative
        </button>
      )}

      {encounter.status === "ROLLING" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>
              {encounter.combatants.filter((ec) => ec.initiative !== null).length}
              /{encounter.combatants.length} rolled
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                emit("combat:rollAll", {
                  joinCode,
                  encounterId: encounter.id,
                })
              }
              className="btn btn-secondary flex-1"
            >
              <Dice6 size={16} />
              Roll All Remaining
            </button>
            <button
              onClick={() =>
                emit("combat:start", {
                  joinCode,
                  encounterId: encounter.id,
                })
              }
              disabled={!allRolled}
              className="btn btn-primary flex-1"
            >
              <Swords size={16} />
              Start Combat
            </button>
          </div>
        </div>
      )}

      {encounter.status === "ACTIVE" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() =>
                emit("combat:prevTurn", {
                  joinCode,
                  encounterId: encounter.id,
                })
              }
              className="btn btn-secondary flex-1"
            >
              <ChevronLeft size={18} />
              Prev
            </button>
            <button
              onClick={() =>
                emit("combat:nextTurn", {
                  joinCode,
                  encounterId: encounter.id,
                })
              }
              className="btn btn-primary-lg flex-[2] rounded-lg"
            >
              Next
              <ChevronRight size={20} />
            </button>
          </div>
          <button
            onClick={() =>
              emit("combat:end", {
                joinCode,
                encounterId: encounter.id,
              })
            }
            className="btn btn-danger w-full btn-sm"
            disabled={activeCount === 0}
          >
            <StopCircle size={14} />
            End Combat
          </button>
        </div>
      )}

      {encounter.status === "COMPLETED" && (
        <p className="text-text-muted text-sm text-center py-2">
          Combat ended
        </p>
      )}
    </div>
  );
}
