"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (data.dmToken) {
        router.push(`/dm/${data.dmToken}`);
      }
    } catch {
      setCreating(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch(`/api/sessions/${code}`);
      if (res.ok) {
        router.push(`/session/${code}`);
      } else {
        setJoinError("Session not found. Check your code and try again.");
        setJoining(false);
      }
    } catch {
      setJoinError("Connection error. Please try again.");
      setJoining(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative z-10">
      <div className="w-full max-w-md space-y-8">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl tracking-wide">RollInit</h1>
          <p className="text-text-secondary text-sm tracking-widest uppercase">
            Initiative Tracker & Dice Roller
          </p>
        </div>

        {/* Create Session */}
        <div className="card space-y-4">
          <h2 className="text-xl">Dungeon Master</h2>
          <p className="text-text-secondary text-sm">
            Create a new session and invite your players with a join code.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn btn-primary w-full text-lg"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <Spinner /> Creating...
              </span>
            ) : (
              "Create Session"
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-muted text-xs uppercase tracking-wider">
            or
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Join Session */}
        <div className="card space-y-4">
          <h2 className="text-xl">Player</h2>
          <p className="text-text-secondary text-sm">
            Enter the code your DM shared to join the session.
          </p>
          <form onSubmit={handleJoin} className="space-y-3">
            <input
              type="text"
              placeholder="Enter join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full text-center text-2xl tracking-[0.3em] uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            />
            {joinError && (
              <p className="text-accent-red text-sm text-center">{joinError}</p>
            )}
            <button
              type="submit"
              disabled={joining || joinCode.trim().length === 0}
              className="btn btn-secondary w-full"
            >
              {joining ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Joining...
                </span>
              ) : (
                "Join Session"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs">
          No account needed. Bookmark your DM link to return later.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
