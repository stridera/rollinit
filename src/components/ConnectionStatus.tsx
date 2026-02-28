"use client";

import { Wifi, WifiOff } from "lucide-react";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {connected ? (
        <Wifi size={14} className="text-accent-green" />
      ) : (
        <WifiOff size={14} className="text-accent-red animate-pulse" />
      )}
      <span className="text-xs text-text-muted">
        {connected ? "Connected" : "Reconnecting..."}
      </span>
    </div>
  );
}
