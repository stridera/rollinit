"use client";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-accent-green" : "bg-accent-red animate-pulse"
        }`}
      />
      <span className="text-xs text-text-muted">
        {connected ? "Connected" : "Reconnecting..."}
      </span>
    </div>
  );
}
