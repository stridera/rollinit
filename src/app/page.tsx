"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, LogIn, Github, ArrowLeft, KeyRound } from "lucide-react";
import { D20Icon } from "@/components/D20Icon";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingJoinCode, setPendingJoinCode] = useState("");

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
        const data = await res.json();
        if (data.hasPassword) {
          setPendingJoinCode(data.joinCode);
          setNeedsPassword(true);
          setJoining(false);
        } else {
          router.push(`/session/${data.joinCode}`);
        }
      } else {
        setJoinError("Session not found. Check your code and try again.");
        setJoining(false);
      }
    } catch {
      setJoinError("Connection error. Please try again.");
      setJoining(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) return;
    setPasswordError("");
    setJoining(true);

    try {
      const res = await fetch(`/api/sessions/${pendingJoinCode}/validate-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        router.push(`/session/${pendingJoinCode}`);
      } else {
        setPasswordError("Incorrect password. Try again.");
        setJoining(false);
      }
    } catch {
      setPasswordError("Connection error. Please try again.");
      setJoining(false);
    }
  }

  function handleBackFromPassword() {
    setNeedsPassword(false);
    setPasswordInput("");
    setPasswordError("");
    setPendingJoinCode("");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 relative z-10">
      {/* Viewport vignette */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      <div className="w-full max-w-md space-y-8 relative">
        {/* Floating particles */}
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />

        {/* Logo / Title */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <D20Icon
              size={80}
              className="text-accent-gold drop-shadow-[0_0_20px_rgba(212,168,67,0.3)] hover:rotate-12 transition-transform duration-700"
            />
          </div>
          <h1 className="text-5xl tracking-wide">RollInit</h1>
          <p className="text-text-secondary text-sm tracking-widest uppercase">
            Initiative Tracker & Dice Roller
          </p>
        </div>

        {/* Create Session */}
        <div className="card space-y-4 border-t-2 border-t-accent-gold/40 shadow-[inset_0_1px_12px_rgba(212,168,67,0.04)]">
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
              <span className="flex items-center justify-center gap-2">
                <Crown size={20} /> Create Session
              </span>
            )}
          </button>
        </div>

        {/* Ornamental divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <span className="text-accent-gold/40 text-sm select-none">{"\u25C6"}</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Join Session */}
        <div className="card space-y-4 border-t-2 border-t-accent-gold/40 shadow-[inset_0_1px_12px_rgba(212,168,67,0.04)]">
          {needsPassword ? (
            <>
              <h2 className="text-xl">Enter Password</h2>
              <p className="text-text-secondary text-sm">
                This session requires a password to join.
              </p>
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <input
                  type="password"
                  placeholder="Session password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full text-center"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-accent-red text-sm text-center">{passwordError}</p>
                )}
                <button
                  type="submit"
                  disabled={joining || !passwordInput}
                  className="btn btn-secondary w-full"
                >
                  {joining ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Verifying...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <KeyRound size={18} /> Submit
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBackFromPassword}
                  className="btn btn-ghost w-full text-sm"
                >
                  <span className="flex items-center justify-center gap-2">
                    <ArrowLeft size={16} /> Back
                  </span>
                </button>
              </form>
            </>
          ) : (
            <>
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
                    <span className="flex items-center justify-center gap-2">
                      <LogIn size={18} /> Join Session
                    </span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center space-y-1">
          <p className="text-text-muted text-xs">
            No account needed. Bookmark your DM link to return later.
          </p>
          <a
            href="https://github.com/stridera/rollinit/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text-muted text-xs hover:text-text-secondary transition-colors"
          >
            <Github size={12} />
            Found a bug? Open an issue
          </a>
        </div>
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
