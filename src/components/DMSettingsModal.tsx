"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";

type SocketInstance = Socket<ServerToClientEvents, ClientToServerEvents>;

type EmitFn = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

export function DMSettingsModal({
  open,
  onClose,
  socket,
  emit,
  joinCode,
  dmToken,
}: {
  open: boolean;
  onClose: () => void;
  socket: SocketInstance | null;
  emit: EmitFn;
  joinCode: string;
  dmToken: string;
}) {
  const [password, setPassword] = useState("");
  const [physicalDice, setPhysicalDice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !socket) return;

    setLoaded(false);

    function onDmSettings(data: { password: string | null; physicalDice: boolean }) {
      setPassword(data.password ?? "");
      setPhysicalDice(data.physicalDice);
      setLoaded(true);
    }

    socket.on("session:dmSettings", onDmSettings);
    emit("session:getSettings", { joinCode, dmToken });

    return () => {
      socket.off("session:dmSettings", onDmSettings);
    };
  }, [open, socket, emit, joinCode, dmToken]);

  function handleSave() {
    setSaving(true);
    emit("session:updateSettings", {
      joinCode,
      dmToken,
      settings: {
        password: password || null,
        physicalDice,
      },
    });
    setTimeout(() => {
      setSaving(false);
      onClose();
    }, 200);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Session Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {!loaded ? (
          <p className="text-text-secondary text-sm text-center py-4">Loading...</p>
        ) : (
          <>
            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-sm text-text-secondary">
                Session Password
              </label>
              <p className="text-text-muted text-xs">
                Players must enter this password after the join code. Leave blank for no password.
              </p>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="No password set"
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Physical Dice */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-text-secondary">
                  Physical Dice Mode
                </label>
                <button
                  type="button"
                  onClick={() => setPhysicalDice(!physicalDice)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    physicalDice ? "bg-accent-gold" : "bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      physicalDice ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <p className="text-text-muted text-xs">
                When enabled, players can manually enter their d20 roll result for initiative instead of only using the auto-roller.
              </p>
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary w-full"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
