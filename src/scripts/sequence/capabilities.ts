import type { CapabilityResult } from "./types";

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function detectCapabilities(): CapabilityResult {
  const hints = navigator as NavigatorHints;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { fullMotion: false, reason: "reduced-motion" };
  }
  if (hints.connection?.saveData) return { fullMotion: false, reason: "save-data" };
  if (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2) {
    return { fullMotion: false, reason: "weak-device" };
  }
  const canvas = document.createElement("canvas");
  if (!canvas.getContext("2d")) return { fullMotion: false, reason: "no-canvas" };
  return { fullMotion: true, reason: "enabled" };
}
