"use client";

import { useState, useEffect, useCallback } from "react";
import { useSocket } from "@/lib/useSocket";
import type { CombatantWithInstances, EncounterWithCombatants } from "@/types/socket";
import { ConnectionStatus } from "./ConnectionStatus";
import { InitiativeList } from "./InitiativeList";
import { CurrentTurnBanner } from "./CurrentTurnBanner";
import { DiceRoller } from "./DiceRoller";
import { DiceLog } from "./DiceLog";
import { NotificationPermission } from "./NotificationPermission";

const STORAGE_KEY_PREFIX = "rollinit:player:";

export function PlayerView({ joinCode }: { joinCode: string }) {
  const [playerName, setPlayerName] = useState("");
  const [combatantId, setCombatantId] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(true);

  // Form inputs
  const [nameInput, setNameInput] = useState("");
  const [maxHpInput, setMaxHpInput] = useState(10);
  const [initBonusInput, setInitBonusInput] = useState(0);
  const [acInput, setAcInput] = useState(10);

  const { socket, connected, sessionState, setSessionState, error, emit } =
    useSocket(joinCode, false);

  // Handle player:registered response
  const onPlayerRegistered = useCallback(
    (data: { combatantId: string; name: string }) => {
      setCombatantId(data.combatantId);
      setPlayerName(data.name);
      setHasJoined(true);
      setIsReconnecting(false);
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${joinCode}`,
        JSON.stringify({ combatantId: data.combatantId, name: data.name })
      );
    },
    [joinCode]
  );

  // Reconnect on mount
  useEffect(() => {
    if (!socket || !connected) return;

    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${joinCode}`);
    if (stored) {
      try {
        const { combatantId: storedId } = JSON.parse(stored);
        if (storedId) {
          emit("player:reconnect", { joinCode, combatantId: storedId });
          // Listen for error during reconnect
          const onError = () => {
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${joinCode}`);
            setIsReconnecting(false);
          };
          socket.once("error", onError);
          // If registered event comes, the error listener is no longer needed
          const onRegistered = (data: { combatantId: string; name: string }) => {
            socket.off("error", onError);
            onPlayerRegistered(data);
          };
          socket.once("player:registered", onRegistered);
          return () => {
            socket.off("error", onError);
            socket.off("player:registered", onRegistered);
          };
        }
      } catch {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${joinCode}`);
      }
    }
    setIsReconnecting(false);
  }, [socket, connected, joinCode, emit, onPlayerRegistered]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    function onCombatantAdded(combatant: CombatantWithInstances) {
      setSessionState((prev) => {
        if (!prev) return prev;
        if (prev.combatants.some((c) => c.id === combatant.id)) return prev;
        return { ...prev, combatants: [...prev.combatants, combatant] };
      });
    }

    function onCombatantUpdated(combatant: CombatantWithInstances) {
      setSessionState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          combatants: prev.combatants.map((c) =>
            c.id === combatant.id ? combatant : c
          ),
        };
      });
    }

    function onCombatantRemoved(combatantId: string) {
      setSessionState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          combatants: prev.combatants.filter((c) => c.id !== combatantId),
        };
      });
    }

    function onEncounterUpdate(encounter: EncounterWithCombatants) {
      setSessionState((prev) => {
        if (!prev) return prev;
        const existing = prev.encounters.findIndex(
          (e) => e.id === encounter.id
        );
        let encounters;
        if (existing >= 0) {
          encounters = prev.encounters.map((e) =>
            e.id === encounter.id ? encounter : e
          );
        } else {
          encounters = [...prev.encounters, encounter];
        }
        const activeEncounterId =
          encounter.status === "COMPLETED"
            ? encounter.id === prev.activeEncounterId
              ? null
              : prev.activeEncounterId
            : encounter.id;

        return { ...prev, encounters, activeEncounterId };
      });
    }

    function onLockChanged(data: { isLocked: boolean }) {
      setSessionState((prev) => {
        if (!prev) return prev;
        return { ...prev, isLocked: data.isLocked };
      });
    }

    function onYourTurn(name: string) {
      if (Notification.permission === "granted") {
        new Notification("RollInit - Your Turn!", {
          body: `It's ${name}'s turn to act!`,
          icon: "/favicon.ico",
        });
      }
    }

    socket.on("combatant:added", onCombatantAdded);
    socket.on("combatant:updated", onCombatantUpdated);
    socket.on("combatant:removed", onCombatantRemoved);
    socket.on("encounter:created", onEncounterUpdate);
    socket.on("encounter:updated", onEncounterUpdate);
    socket.on("combat:started", onEncounterUpdate);
    socket.on("combat:turnChanged", onEncounterUpdate);
    socket.on("combat:ended", onEncounterUpdate);
    socket.on("session:lockChanged", onLockChanged);
    socket.on("notify:yourTurn", onYourTurn);

    return () => {
      socket.off("combatant:added", onCombatantAdded);
      socket.off("combatant:updated", onCombatantUpdated);
      socket.off("combatant:removed", onCombatantRemoved);
      socket.off("encounter:created", onEncounterUpdate);
      socket.off("encounter:updated", onEncounterUpdate);
      socket.off("combat:started", onEncounterUpdate);
      socket.off("combat:turnChanged", onEncounterUpdate);
      socket.off("combat:ended", onEncounterUpdate);
      socket.off("session:lockChanged", onLockChanged);
      socket.off("notify:yourTurn", onYourTurn);
    };
  }, [socket, setSessionState]);

  const activeEncounter = sessionState?.encounters.find(
    (e) => e.id === sessionState.activeEncounterId
  );

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;

    // Listen for registration response
    socket?.once("player:registered", onPlayerRegistered);

    emit("player:register", {
      joinCode,
      name: nameInput.trim(),
      maxHp: maxHpInput,
      initiativeBonus: initBonusInput,
      armorClass: acInput,
    });
  }

  function handleSpectate() {
    setHasJoined(true);
    setPlayerName("Spectator");
    setIsReconnecting(false);
  }

  // Show reconnecting state
  if (isReconnecting) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 relative z-10">
        <div className="card w-full max-w-sm text-center py-8">
          <p className="text-text-secondary">Reconnecting...</p>
        </div>
      </div>
    );
  }

  // Show registration form
  if (!hasJoined) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 relative z-10">
        <div className="card w-full max-w-sm space-y-4">
          <div className="text-center">
            <h1 className="text-3xl">RollInit</h1>
            <p className="text-text-secondary text-sm mt-1">
              Session <span className="text-accent-gold tracking-wider">{joinCode}</span>
            </p>
          </div>

          {error && (
            <div className="bg-accent-red/20 border border-accent-red/40 rounded-lg px-4 py-2 text-accent-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="block text-sm text-text-secondary">
                Character Name
              </label>
              <input
                type="text"
                placeholder="e.g. Gandalf"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-text-muted">Max HP</label>
                <input
                  type="number"
                  value={maxHpInput}
                  onChange={(e) => setMaxHpInput(Number(e.target.value))}
                  className="w-full text-sm text-center"
                  min={1}
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">Init Bonus</label>
                <input
                  type="number"
                  value={initBonusInput}
                  onChange={(e) => setInitBonusInput(Number(e.target.value))}
                  className="w-full text-sm text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">AC</label>
                <input
                  type="number"
                  value={acInput}
                  onChange={(e) => setAcInput(Number(e.target.value))}
                  className="w-full text-sm text-center"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="btn btn-primary w-full"
            >
              Join Session
            </button>
          </form>

          <button
            type="button"
            onClick={handleSpectate}
            className="btn btn-ghost w-full text-xs text-text-muted"
          >
            Spectate Only
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh relative z-10">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl">RollInit</h1>
            <p className="text-text-muted text-xs">
              {combatantId ? playerName : "Spectator"} &middot; {joinCode}
            </p>
          </div>
          <ConnectionStatus connected={connected} />
        </div>
      </header>

      {error && (
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="bg-accent-red/20 border border-accent-red/40 rounded-lg px-4 py-2 text-accent-red text-sm">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Current Turn Banner */}
        {activeEncounter && activeEncounter.status === "ACTIVE" && (
          <CurrentTurnBanner encounter={activeEncounter} />
        )}

        {/* Initiative List */}
        {activeEncounter && (
          <InitiativeList
            encounter={activeEncounter}
            isDM={false}
            joinCode={joinCode}
            emit={emit}
          />
        )}

        {!activeEncounter && (
          <div className="card text-center py-12">
            <p className="text-text-secondary">
              Waiting for the DM to start an encounter...
            </p>
          </div>
        )}

        {/* Notification permission */}
        <NotificationPermission />

        {/* Dice Roller + Log — only for registered players */}
        {combatantId && (
          <DiceRoller
            joinCode={joinCode}
            rollerName={playerName}
            isDM={false}
            emit={emit}
            setSessionState={setSessionState}
            socket={socket}
          />
        )}
        <DiceLog diceRolls={sessionState?.diceRolls ?? []} />
      </main>
    </div>
  );
}
