"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, LogIn, Github, Users, Maximize2, Minimize2, MonitorSmartphone, ChevronDown, ChevronUp } from "lucide-react";
import { NumericInput } from "./NumericInput";
import { useSocket } from "@/lib/useSocket";
import type { CombatantWithInstances, EncounterWithCombatants } from "@/types/socket";
import { ConnectionStatus } from "./ConnectionStatus";
import { InitiativeList } from "./InitiativeList";
import { CurrentTurnBanner } from "./CurrentTurnBanner";
import { DiceRoller } from "./DiceRoller";
import { DiceLog } from "./DiceLog";
import { NotificationPermission } from "./NotificationPermission";
import { D20Icon } from "./D20Icon";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";

const STORAGE_KEY_PREFIX = "rollinit:player:";

const WAITING_MESSAGES = [
  "The DM prepares the encounter...",
  "Sharpen your blades, adventurer.",
  "Something stirs in the shadows...",
  "Roll for perception... just kidding.",
  "The tavern grows quiet...",
  "A mysterious fog rolls in...",
  "Your fate is being written...",
];

export function PlayerView({ joinCode }: { joinCode: string }) {
  const [playerName, setPlayerName] = useState("");
  const [combatantId, setCombatantId] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [waitingMsgIdx, setWaitingMsgIdx] = useState(0);
  const [removedMessage, setRemovedMessage] = useState("");
  const [viewerCount, setViewerCount] = useState<{ spectators: number; players: number } | null>(null);

  // Form inputs
  const [nameInput, setNameInput] = useState("");
  const [maxHpInput, setMaxHpInput] = useState(10);
  const [initBonusInput, setInitBonusInput] = useState(0);
  const [acInput, setAcInput] = useState(10);

  const { socket, connected, sessionState, setSessionState, dmActive, error, emit } =
    useSocket(joinCode, false);
  const fullscreen = useFullscreen();
  const wakeLock = useWakeLock();

  // Companion form state
  const [showCompanionForm, setShowCompanionForm] = useState(false);
  const [companionName, setCompanionName] = useState("");
  const [companionHp, setCompanionHp] = useState(10);
  const [companionInit, setCompanionInit] = useState(0);
  const [companionAc, setCompanionAc] = useState(10);

  // Cycle waiting messages
  useEffect(() => {
    const interval = setInterval(() => {
      setWaitingMsgIdx((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
          let settled = false;
          const cleanup = () => {
            settled = true;
            clearTimeout(timeout);
            socket.off("error", onError);
            socket.off("player:registered", onRegistered);
          };
          const onError = () => {
            if (settled) return;
            cleanup();
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${joinCode}`);
            setIsReconnecting(false);
          };
          const onRegistered = (data: { combatantId: string; name: string }) => {
            if (settled) return;
            cleanup();
            onPlayerRegistered(data);
          };
          // Timeout: if server never responds, fall back to join form
          const timeout = setTimeout(() => {
            if (settled) return;
            cleanup();
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${joinCode}`);
            setIsReconnecting(false);
          }, 5000);
          socket.once("error", onError);
          socket.once("player:registered", onRegistered);
          return cleanup;
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

    function onCombatantRemoved(removedId: string) {
      setSessionState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          combatants: prev.combatants.filter((c) => c.id !== removedId),
        };
      });
    }

    function onPlayerRemoved() {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${joinCode}`);
      setCombatantId(null);
      setPlayerName("");
      setHasJoined(false);
      setRemovedMessage("Your character was removed by the DM. You may rejoin.");
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

    function onViewerCount(data: { spectators: number; players: number }) {
      setViewerCount(data);
    }

    function onSettingsChanged(data: { hasPassword: boolean; physicalDice: boolean; showMonsterHpBar: boolean }) {
      setSessionState((prev) => {
        if (!prev) return prev;
        return { ...prev, hasPassword: data.hasPassword, physicalDice: data.physicalDice, showMonsterHpBar: data.showMonsterHpBar };
      });
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
    socket.on("player:removed", onPlayerRemoved);
    socket.on("session:viewerCount", onViewerCount);
    socket.on("session:settingsChanged", onSettingsChanged);

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
      socket.off("player:removed", onPlayerRemoved);
      socket.off("session:viewerCount", onViewerCount);
      socket.off("session:settingsChanged", onSettingsChanged);
    };
  }, [socket, setSessionState, joinCode]);

  const activeEncounter = sessionState?.encounters.find(
    (e) => e.id === sessionState.activeEncounterId
  );

  const totalViewers = viewerCount ? viewerCount.players + viewerCount.spectators : 0;

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setRemovedMessage("");

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

  // Show waiting screen when DM is not connected
  if (dmActive === false && !hasJoined) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 relative z-10">
        <div className="card w-full max-w-sm text-center py-12 relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(212, 168, 67, 0.06) 0%, transparent 60%)",
              animation: "torchFlicker 3s ease-in-out infinite",
            }}
          />
          <div className="relative">
            <D20Icon size={48} className="text-accent-gold mx-auto mb-4 opacity-30" />
            <h2 className="text-xl mb-2">Waiting for DM</h2>
            <p className="text-text-secondary text-sm mb-1">
              Session <span className="text-accent-gold tracking-wider">{joinCode}</span>
            </p>
            <p
              key={waitingMsgIdx}
              className="text-text-muted text-xs italic mt-4 animate-fade-in"
            >
              {WAITING_MESSAGES[waitingMsgIdx]}
            </p>
            <ConnectionStatus connected={connected} />
          </div>
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

          {removedMessage && (
            <div className="bg-accent-red/20 border border-accent-red/40 rounded-lg px-4 py-2 text-accent-red text-sm text-center">
              {removedMessage}
            </div>
          )}

          {error && !removedMessage && (
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
                <NumericInput
                  value={maxHpInput}
                  onChange={setMaxHpInput}
                  defaultValue={1}
                  className="w-full text-sm text-center"
                  min={1}
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">Init Bonus</label>
                <NumericInput
                  value={initBonusInput}
                  onChange={setInitBonusInput}
                  className="w-full text-sm text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">AC</label>
                <NumericInput
                  value={acInput}
                  onChange={setAcInput}
                  className="w-full text-sm text-center"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="btn btn-primary w-full"
            >
              <LogIn size={18} />
              Join Session
            </button>
          </form>

          <button
            type="button"
            onClick={handleSpectate}
            className="btn btn-ghost w-full text-xs text-text-muted"
          >
            <Eye size={14} />
            Spectate Only
          </button>

          <a
            href={`?mode=dashboard`}
            className="btn btn-ghost w-full text-xs text-text-muted"
          >
            <Maximize2 size={14} />
            Dashboard Mode
          </a>
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
          <div className="flex items-center gap-3">
            {wakeLock.isSupported && (
              <button
                onClick={wakeLock.toggle}
                className={`p-1.5 rounded transition-colors ${
                  wakeLock.isActive ? "text-accent-gold" : "text-text-muted hover:text-text-secondary"
                }`}
                title={wakeLock.isActive ? "Disable wake lock" : "Keep screen on"}
              >
                <MonitorSmartphone size={16} />
              </button>
            )}
            {fullscreen.isSupported && (
              <button
                onClick={fullscreen.toggle}
                className="p-1.5 rounded text-text-muted hover:text-text-secondary transition-colors"
                title={fullscreen.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {fullscreen.isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
            <a
              href="https://github.com/stridera/rollinit/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted hover:text-text-secondary transition-colors"
              title="Report an issue"
            >
              <Github size={16} />
            </a>
            <ConnectionStatus connected={connected} />
          </div>
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
          <CurrentTurnBanner
            encounter={activeEncounter}
            showMonsterHpBar={sessionState?.showMonsterHpBar}
            showHpControls={(() => {
              const activeEntries = activeEncounter.combatants.filter((ec) => ec.isActive);
              const current = activeEntries[activeEncounter.currentTurnIdx];
              if (!current) return false;
              return !!(combatantId && (current.combatantId === combatantId || current.combatant.ownerId === combatantId));
            })()}
            onHpChange={(instanceId, newHp) => {
              emit("instance:update", {
                joinCode,
                encounterId: activeEncounter.id,
                instanceId,
                updates: { currentHp: newHp },
              });
            }}
          />
        )}

        {/* Initiative List */}
        {activeEncounter && (
          <InitiativeList
            encounter={activeEncounter}
            isDM={false}
            joinCode={joinCode}
            emit={emit}
            playerCombatantId={combatantId}
            physicalDice={sessionState?.physicalDice}
            showMonsterHpBar={sessionState?.showMonsterHpBar}
            hideCurrentTurn
          />
        )}

        {/* Atmospheric waiting state */}
        {!activeEncounter && (
          <div className="card text-center py-12 relative overflow-hidden">
            {/* Torch flicker glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center, rgba(212, 168, 67, 0.06) 0%, transparent 60%)",
                animation: "torchFlicker 3s ease-in-out infinite",
              }}
            />
            <div className="relative">
              <D20Icon
                size={48}
                className="text-accent-gold mx-auto mb-4 opacity-40"
                key="waiting-d20"
              />
              <p
                key={waitingMsgIdx}
                className="text-text-secondary italic animate-fade-in"
              >
                {WAITING_MESSAGES[waitingMsgIdx]}
              </p>
              {totalViewers > 0 && (
                <p className="text-text-muted text-xs mt-3 flex items-center justify-center gap-1">
                  <Users size={12} />
                  {viewerCount!.players} player{viewerCount!.players !== 1 ? "s" : ""}
                  {viewerCount!.spectators > 0 && (
                    <>, {viewerCount!.spectators} spectator{viewerCount!.spectators !== 1 ? "s" : ""}</>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Notification permission */}
        <NotificationPermission />

        {/* Companion form -- only for registered players */}
        {combatantId && (
          <div className="card space-y-3">
            <button
              onClick={() => setShowCompanionForm(!showCompanionForm)}
              className="flex items-center justify-between w-full text-sm text-text-secondary"
            >
              <span>Companions / Familiars</span>
              {showCompanionForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showCompanionForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!companionName.trim()) return;
                  emit("player:addCompanion", {
                    joinCode,
                    ownerCombatantId: combatantId,
                    name: companionName.trim(),
                    maxHp: companionHp,
                    initiativeBonus: companionInit,
                    armorClass: companionAc,
                  });
                  setCompanionName("");
                  setCompanionHp(10);
                  setCompanionInit(0);
                  setCompanionAc(10);
                }}
                className="space-y-2 animate-fade-in"
              >
                <input
                  type="text"
                  placeholder="Companion name"
                  value={companionName}
                  onChange={(e) => setCompanionName(e.target.value)}
                  className="w-full text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-text-muted">Max HP</label>
                    <NumericInput
                      value={companionHp}
                      onChange={setCompanionHp}
                      defaultValue={10}
                      className="w-full text-sm text-center"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted">Init Bonus</label>
                    <NumericInput
                      value={companionInit}
                      onChange={setCompanionInit}
                      className="w-full text-sm text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted">AC</label>
                    <NumericInput
                      value={companionAc}
                      onChange={setCompanionAc}
                      defaultValue={10}
                      className="w-full text-sm text-center"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!companionName.trim()}
                  className="btn btn-secondary btn-sm w-full"
                >
                  Add Companion
                </button>
                {/* Show existing companions */}
                {sessionState?.combatants
                  .filter((c) => c.type === "COMPANION" && c.ownerId === combatantId)
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm text-text-secondary py-1 px-2 bg-bg-tertiary rounded">
                      <span className="text-amber-400 text-[10px] mr-1.5">CMP</span>
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs text-text-muted">{c.currentHp}/{c.maxHp} HP</span>
                    </div>
                  ))}
              </form>
            )}
          </div>
        )}

        {/* Dice Roller + Log -- only for registered players */}
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
