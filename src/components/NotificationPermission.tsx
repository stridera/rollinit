"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";

export function NotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  if (permission === "granted" || permission === "unsupported") return null;

  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  if (permission === "denied") {
    return (
      <div className="bg-bg-tertiary rounded-lg px-3 py-2 text-xs text-text-muted">
        Turn notifications are blocked. Enable them in your browser settings.
      </div>
    );
  }

  return (
    <button
      onClick={requestPermission}
      className="btn btn-secondary btn-sm text-xs w-full"
    >
      <Bell size={14} />
      Enable &quot;Your Turn!&quot; Notifications
    </button>
  );
}
