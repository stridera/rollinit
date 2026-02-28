"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket, type AppSocket } from "./socketClient";
import type { SessionState, ClientToServerEvents } from "@/types/socket";

export function useSocket(joinCode: string, isDM: boolean = false) {
  const socketRef = useRef<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    if (!socket.connected) {
      socket.connect();
    }

    function onConnect() {
      setConnected(true);
      setError(null);
      socket.emit("session:join", { joinCode, isDM });
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onState(state: SessionState) {
      setSessionState(state);
    }

    let errorTimer: ReturnType<typeof setTimeout>;
    function onError(msg: string) {
      setError(msg);
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => setError(null), 5000);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("session:state", onState);
    socket.on("error", onError);

    // If already connected, join immediately
    if (socket.connected) {
      socket.emit("session:join", { joinCode, isDM });
    }

    return () => {
      clearTimeout(errorTimer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("session:state", onState);
      socket.off("error", onError);
      socket.emit("session:leave", { joinCode });
    };
  }, [joinCode, isDM]);

  const emit = useCallback(
    <E extends keyof ClientToServerEvents>(
      event: E,
      ...args: Parameters<ClientToServerEvents[E]>
    ) => {
      socketRef.current?.emit(event, ...args);
    },
    []
  );

  return { socket: socketRef.current, connected, sessionState, setSessionState, error, emit };
}
