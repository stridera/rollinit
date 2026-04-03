"use client";

import { useState, useEffect } from "react";
import { Maximize2, Minimize2, MonitorSmartphone } from "lucide-react";
import { useSocket } from "@/lib/useSocket";
import type { CombatantWithInstances, EncounterWithCombatants } from "@/types/socket";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import { getTypeColor, getTypeLabel } from "@/lib/combatantTypes";
import { HpTracker } from "./HpTracker";
import { D20Icon } from "./D20Icon";
import { Shield } from "lucide-react";

const WAITING_MESSAGES = [
  "The DM prepares the encounter...",
  "Sharpen your blades, adventurer.",
  "Something stirs in the shadows...",
  "Roll for perception... just kidding.",
  "The tavern grows quiet...",
  "A mysterious fog rolls in...",
  "Your fate is being written...",
];

export function DashboardView({ joinCode }: { joinCode: string }) {
  const { socket, connected, sessionState, setSessionState, dmActive } =
    useSocket(joinCode, false);
  const fullscreen = useFullscreen();
  const wakeLock = useWakeLock();
  const [waitingMsgIdx, setWaitingMsgIdx] = useState(0);

  // Auto-activate wake lock on mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      wakeLock.request();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle waiting messages
  useEffect(() => {
    const interval = setInterval(() => {
      setWaitingMsgIdx((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
    function onEncounterDeleted(encounterId: string) {
      setSessionState((prev) => {
        if (!prev) return prev;
        const encounters = prev.encounters.filter((e) => e.id !== encounterId);
        const activeEncounterId =
          prev.activeEncounterId === encounterId ? null : prev.activeEncounterId;
        return { ...prev, encounters, activeEncounterId };
      });
    }

    socket.on("session:lockChanged", onLockChanged);
    socket.on("session:settingsChanged", onSettingsChanged);
    socket.on("encounter:deleted", onEncounterDeleted);

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
      socket.off("session:settingsChanged", onSettingsChanged);
      socket.off("encounter:deleted", onEncounterDeleted);
    };
  }, [socket, setSessionState]);

  const activeEncounter = sessionState?.encounters.find(
    (e) => e.id === sessionState.activeEncounterId
  );

  const isActive = activeEncounter?.status === "ACTIVE";
  const activeEntries = activeEncounter?.combatants
    .filter((ec) => ec.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  // Rotate so current turn is at top
  const displayEntries = isActive && activeEntries.length > 0 && activeEncounter!.currentTurnIdx > 0
    ? [
        ...activeEntries.slice(activeEncounter!.currentTurnIdx),
        ...activeEntries.slice(0, activeEncounter!.currentTurnIdx),
      ]
    : activeEntries;

  const showMonsterHpBar = sessionState?.showMonsterHpBar;

  // Party members for the out-of-combat view (PCs, NPCs, Companions - not monsters)
  const partyMembers = sessionState?.combatants.filter(
    (c) => c.type === "PLAYER_CHARACTER" || c.type === "NPC" || c.type === "COMPANION"
  ) ?? [];

  // Waiting state (DM not connected or no active encounter)
  if (dmActive === false || !activeEncounter) {
    return (
      <div className="h-dvh flex flex-col bg-bg-primary relative z-10">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-secondary/80">
          <h1 className="text-2xl">RollInit</h1>
          <div className="flex items-center gap-3">
            {wakeLock.isSupported && (
              <button
                onClick={wakeLock.toggle}
                className={`p-2 rounded transition-colors ${
                  wakeLock.isActive ? "text-accent-gold" : "text-text-muted hover:text-text-secondary"
                }`}
                title={wakeLock.isActive ? "Disable wake lock" : "Keep screen on"}
              >
                <MonitorSmartphone size={20} />
              </button>
            )}
            {fullscreen.isSupported && (
              <button
                onClick={fullscreen.toggle}
                className="p-2 rounded text-text-muted hover:text-text-secondary transition-colors"
              >
                {fullscreen.isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            )}
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`} />
          </div>
        </div>

        {/* Party list or waiting content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {partyMembers.length > 0 ? (
            <div className="flex-1 overflow-auto px-6 py-4">
              <p className="text-text-muted text-xs uppercase tracking-wider mb-3">Party</p>
              <div className="space-y-2">
                {partyMembers.map((c) => {
                  const typeColor = getTypeColor(c.type);
                  const typeLabel = getTypeLabel(c.type);
                  const ownerName = c.type === "COMPANION" && c.ownerId
                    ? partyMembers.find((p) => p.id === c.ownerId)?.name ?? null
                    : null;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-4 px-4 py-2 rounded-xl bg-bg-secondary border border-border"
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-bg-tertiary shrink-0">
                        <Shield size={20} className="text-text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${typeColor}`}>{typeLabel}</span>
                          <span className="text-xl font-medium truncate">{c.name}</span>
                          {ownerName && (
                            <span className="text-xs text-text-muted shrink-0">({ownerName})</span>
                          )}
                        </div>
                        <div className="mt-1">
                          <HpTracker
                            currentHp={c.currentHp}
                            maxHp={c.maxHp}
                            onHpChange={() => {}}
                            showControls={false}
                            showExact={true}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 text-center">
                <p
                  key={waitingMsgIdx}
                  className="text-text-muted text-lg italic animate-fade-in"
                >
                  {WAITING_MESSAGES[waitingMsgIdx]}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <D20Icon size={80} className="text-accent-gold mx-auto mb-6 opacity-30" />
                <p
                  key={waitingMsgIdx}
                  className="text-text-secondary text-3xl italic animate-fade-in"
                >
                  {WAITING_MESSAGES[waitingMsgIdx]}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-bg-primary relative z-10">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-secondary/80 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl">RollInit</h1>
          <span className="text-text-secondary text-lg">{activeEncounter.name}</span>
          {isActive && (
            <span className="text-text-muted text-sm">
              Round {activeEncounter.roundNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {wakeLock.isSupported && (
            <button
              onClick={wakeLock.toggle}
              className={`p-2 rounded transition-colors ${
                wakeLock.isActive ? "text-accent-gold" : "text-text-muted hover:text-text-secondary"
              }`}
              title={wakeLock.isActive ? "Disable wake lock" : "Keep screen on"}
            >
              <MonitorSmartphone size={20} />
            </button>
          )}
          {fullscreen.isSupported && (
            <button
              onClick={fullscreen.toggle}
              className="p-2 rounded text-text-muted hover:text-text-secondary transition-colors"
            >
              {fullscreen.isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          )}
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`} />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-2">
        {displayEntries.map((entry, idx) => {
          const originalIdx = activeEntries.indexOf(entry);
          const isCurrent = isActive && originalIdx === activeEncounter!.currentTurnIdx;

          const typeColor = getTypeColor(entry.combatant.type);
          const typeLabel = getTypeLabel(entry.combatant.type);

          const ownerName = entry.combatant.type === "COMPANION" && entry.combatant.ownerId
            ? activeEncounter!.combatants.find((ec) => ec.combatantId === entry.combatant.ownerId)?.displayName ?? null
            : null;

          const hideHpBar = entry.combatant.type === "MONSTER" && showMonsterHpBar === false;
          const showExact = entry.combatant.type !== "MONSTER";

          return (
            <div
              key={entry.id}
              className={`flex items-center gap-4 px-4 py-2 rounded-xl transition-all duration-300 shrink ${
                isCurrent
                  ? "bg-accent-gold/10 border-2 border-accent-gold"
                  : "bg-bg-secondary border border-border"
              }`}
              style={{ minHeight: 0 }}
            >
              {/* Initiative circle */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${
                isCurrent ? "bg-accent-gold text-bg-primary" : "bg-bg-tertiary"
              }`}>
                {entry.initiative ?? "?"}
              </div>

              {/* Name + type */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${typeColor}`}>{typeLabel}</span>
                  <span className={`text-xl font-medium truncate ${isCurrent ? "text-accent-gold" : entry.combatant.type === "MONSTER" ? "text-accent-red" : ""}`}>
                    {entry.displayName}
                  </span>
                  {ownerName && (
                    <span className="text-xs text-text-muted shrink-0">({ownerName})</span>
                  )}
                  {isCurrent && (
                    <span className="text-xs bg-accent-gold text-bg-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                      NOW
                    </span>
                  )}
                  {idx === 1 && isActive && (
                    <span className="text-xs text-text-muted uppercase tracking-wider shrink-0">
                      On Deck
                    </span>
                  )}
                </div>
                {/* HP bar */}
                <div className="mt-1">
                  <HpTracker
                    currentHp={entry.currentHp}
                    maxHp={entry.maxHp}
                    onHpChange={() => {}}
                    showControls={false}
                    showExact={showExact}
                    hideBar={hideHpBar}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
