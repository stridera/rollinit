"use client";

import { useState, useCallback, useEffect } from "react";

export function useFullscreen() {
  const [isSupported, setIsSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setIsSupported(!!document.documentElement.requestFullscreen);
  }, []);

  const toggle = useCallback(async () => {
    if (!document.documentElement.requestFullscreen) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  return { isSupported, isFullscreen, toggle };
}
