"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only. The SW is a progressive
 * enhancement — registration failures are ignored so the app always works
 * without it.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore: the app works fine without a service worker.
    });
  }, []);
  return null;
}
