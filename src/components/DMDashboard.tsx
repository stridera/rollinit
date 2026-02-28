"use client";

import { useSocket } from "@/lib/useSocket";
import { useState, useEffect } from "react";
import {
  Lock,
  Unlock,
  RefreshCw,
  Link,
  Users,
  Swords,
  Dice6,
  Github,
  Eye,
  Settings,
} from "lucide-react";
import type { CombatantWithInstances, EncounterWithCombatants } from "@/types/socket";
import { ConnectionStatus } from "./ConnectionStatus";
import { AddCombatantForm } from "./AddCombatantForm";
import { CombatantList } from "./CombatantList";
import { EncounterManager } from "./EncounterManager";
import { CombatControls } from "./CombatControls";
import { InitiativeList } from "./InitiativeList";
import { DiceRoller } from "./DiceRoller";
import { DiceLog } from "./DiceLog";
import { DMSettingsModal } from "./DMSettingsModal";

type MobileTab = "combatants" | "combat" | "dice";

export function DMDashboard({
  joinCode,
  dmToken,
}: {
  joinCode: string;
  dmToken: string;
}) {
  const { socket, connected, sessionState, setSessionState, error, emit } =
    useSocket(joinCode, true);

  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("combat");
  const [viewerCount, setViewerCount] = useState<{ spectators: number; players: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleCopyCode() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(joinCode);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = joinCode;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleToggleLock() {
    emit("session:toggleLock", { joinCode, dmToken });
  }

  function handleRegenerate() {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      setTimeout(() => setConfirmRegenerate(false), 3000);
      return;
    }
    emit("session:regenerateCode", { joinCode, dmToken });
    setConfirmRegenerate(false);
  }

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

    function onCodeRegenerated() {
      window.location.reload();
    }

    function onViewerCount(data: { spectators: number; players: number }) {
      setViewerCount(data);
    }

    function onSettingsChanged(data: { hasPassword: boolean; physicalDice: boolean }) {
      setSessionState((prev) => {
        if (!prev) return prev;
        return { ...prev, hasPassword: data.hasPassword, physicalDice: data.physicalDice };
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
    socket.on("session:codeRegenerated", onCodeRegenerated);
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
      socket.off("session:codeRegenerated", onCodeRegenerated);
      socket.off("session:viewerCount", onViewerCount);
      socket.off("session:settingsChanged", onSettingsChanged);
    };
  }, [socket, setSessionState]);

  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);

  const activeEncounter = sessionState?.encounters.find(
    (e) => e.id === sessionState.activeEncounterId
  );

  const displayEncounter = selectedEncounterId
    ? sessionState?.encounters.find((e) => e.id === selectedEncounterId)
    : activeEncounter;

  const isViewingCompleted = displayEncounter?.status === "COMPLETED";

  const activeEncounterCombatantIds = new Set(
    activeEncounter?.combatants.map((ec) => ec.combatantId) ?? []
  );

  // Reset selected encounter when active encounter changes
  useEffect(() => {
    setSelectedEncounterId(null);
  }, [sessionState?.activeEncounterId]);

  // Auto-switch to combat tab when encounter becomes ACTIVE
  useEffect(() => {
    if (activeEncounter?.status === "ACTIVE") {
      setMobileTab("combat");
    }
  }, [activeEncounter?.status]);

  return (
    <div className="min-h-dvh relative z-10">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl">RollInit</h1>
            <p className="text-text-muted text-xs">Dungeon Master View</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-text-secondary text-xs">Join Code</p>
              <button
                onClick={handleCopyCode}
                className="text-accent-gold text-xl tracking-[0.2em] hover:text-accent-gold/80 transition-colors"
                style={{ fontFamily: "var(--font-heading)" }}
                title="Click to copy"
              >
                {copied ? "Copied!" : joinCode}
              </button>
            </div>
            <button
              onClick={handleToggleLock}
              className={`p-1.5 rounded transition-colors ${
                sessionState?.isLocked
                  ? "text-accent-red bg-accent-red/10"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              title={sessionState?.isLocked ? "Unlock session" : "Lock session"}
            >
              {sessionState?.isLocked ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
            <button
              onClick={handleRegenerate}
              className={`p-1.5 rounded transition-colors ${
                confirmRegenerate
                  ? "text-accent-red bg-accent-red/10"
                  : "text-text-muted hover:text-text-secondary"
              }`}
              title={confirmRegenerate ? "Click again to confirm" : "Regenerate join code (kicks all players)"}
            >
              <RefreshCw size={16} className={confirmRegenerate ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded text-text-muted hover:text-text-secondary transition-colors"
              title="Session settings"
            >
              <Settings size={16} />
            </button>
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
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="bg-accent-red/20 border border-accent-red/40 rounded-lg px-4 py-2 text-accent-red text-sm">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 pb-20 lg:pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Combatants + Add Form */}
          <div className={`space-y-6 ${mobileTab !== "combatants" ? "hidden lg:block" : ""}`}>
            <AddCombatantForm joinCode={joinCode} emit={emit} />
            <CombatantList
              combatants={sessionState?.combatants ?? []}
              joinCode={joinCode}
              emit={emit}
              isDM={true}
              activeEncounterId={sessionState?.activeEncounterId}
              activeEncounterStatus={activeEncounter?.status}
              activeEncounterCombatantIds={activeEncounterCombatantIds}
              viewerCount={viewerCount}
            />
          </div>

          {/* Center column: Initiative / Combat */}
          <div className={`space-y-6 ${mobileTab !== "combat" ? "hidden lg:block" : ""}`}>
            <EncounterManager
              encounters={sessionState?.encounters ?? []}
              activeEncounterId={sessionState?.activeEncounterId ?? null}
              combatants={sessionState?.combatants ?? []}
              joinCode={joinCode}
              emit={emit}
              selectedEncounterId={selectedEncounterId}
              onSelectEncounter={setSelectedEncounterId}
            />
            {displayEncounter && (
              <>
                {!isViewingCompleted && (
                  <CombatControls
                    encounter={displayEncounter}
                    joinCode={joinCode}
                    emit={emit}
                  />
                )}
                <InitiativeList
                  encounter={displayEncounter}
                  isDM={true}
                  joinCode={joinCode}
                  emit={emit}
                  readOnly={isViewingCompleted}
                  physicalDice={sessionState?.physicalDice}
                />
              </>
            )}
          </div>

          {/* Right column: Dice Roller + Log */}
          <div className={`space-y-6 ${mobileTab !== "dice" ? "hidden lg:block" : ""}`}>
            <DiceRoller
              joinCode={joinCode}
              rollerName="DM"
              isDM={true}
              emit={emit}
              setSessionState={setSessionState}
              socket={socket}
            />
            <DiceLog diceRolls={sessionState?.diceRolls ?? []} />
          </div>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-border bg-bg-secondary/95 backdrop-blur-sm">
        <div className="flex">
          <button
            onClick={() => setMobileTab("combatants")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
              mobileTab === "combatants"
                ? "text-accent-gold"
                : "text-text-muted"
            }`}
          >
            <Users size={20} />
            Party
          </button>
          <button
            onClick={() => setMobileTab("combat")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors relative ${
              mobileTab === "combat"
                ? "text-accent-gold"
                : "text-text-muted"
            }`}
          >
            <Swords size={20} />
            Combat
            {activeEncounter?.status === "ACTIVE" && (
              <span className="absolute top-1.5 right-1/4 w-2 h-2 bg-accent-gold rounded-full" />
            )}
          </button>
          <button
            onClick={() => setMobileTab("dice")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
              mobileTab === "dice"
                ? "text-accent-gold"
                : "text-text-muted"
            }`}
          >
            <Dice6 size={20} />
            Dice
          </button>
        </div>
      </div>

      {/* DM Token reminder */}
      <div className="fixed bottom-16 lg:bottom-4 left-4 z-30">
        <details className="group">
          <summary className="cursor-pointer text-text-muted text-xs hover:text-text-secondary flex items-center gap-1">
            <Link size={12} />
            DM Link
          </summary>
          <div className="mt-2 card text-xs max-w-sm">
            <p className="text-text-secondary mb-1">
              Bookmark this link to return to your session:
            </p>
            <code className="text-accent-gold break-all text-[11px]" suppressHydrationWarning>
              {typeof window !== "undefined" ? window.location.href : `/dm/${dmToken}`}
            </code>
          </div>
        </details>
      </div>

      <DMSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        socket={socket}
        emit={emit}
        joinCode={joinCode}
        dmToken={dmToken}
      />
    </div>
  );
}
