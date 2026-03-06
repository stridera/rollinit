"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export function useWakeLock() {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const releaseHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIsSupported("wakeLock" in navigator);
  }, []);

  const release = useCallback(async () => {
    if (wakeLockRef.current) {
      if (releaseHandlerRef.current) {
        wakeLockRef.current.removeEventListener("release", releaseHandlerRef.current);
        releaseHandlerRef.current = null;
      }
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setIsActive(false);
    }
  }, []);

  const request = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      // Clean up any existing sentinel before requesting a new one
      if (wakeLockRef.current && releaseHandlerRef.current) {
        wakeLockRef.current.removeEventListener("release", releaseHandlerRef.current);
      }
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setIsActive(true);
      const handler = () => {
        wakeLockRef.current = null;
        releaseHandlerRef.current = null;
        setIsActive(false);
      };
      releaseHandlerRef.current = handler;
      wakeLockRef.current.addEventListener("release", handler, { once: true });
    } catch {
      // Wake lock request failed (e.g. low battery)
    }
  }, []);

  const toggle = useCallback(async () => {
    if (isActive) {
      await release();
    } else {
      await request();
    }
  }, [isActive, release, request]);

  // Re-acquire on visibility change
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && wakeLockRef.current === null && isActive) {
        request();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isActive, request]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        if (releaseHandlerRef.current) {
          wakeLockRef.current.removeEventListener("release", releaseHandlerRef.current);
        }
        wakeLockRef.current.release();
      }
    };
  }, []);

  return { isSupported, isActive, toggle, request, release };
}
