// Installing BMServ on a phone. The browser's install event can fire on any screen (often sign-in), so it is
// caught as soon as the app starts and kept here until the install popup asks for it.
import { useSyncExternalStore } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const LATER_KEY = "bmserv-install-later";
/** "Not now" hides the popup for a week; "Got it" after the steps for a day (in case they did not finish). */
const WEEK_MS = 7 * 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

export function startInstallCapture(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The browser's install offer (Android, desktop Chrome and Edge), or null. */
export function useInstallOffer(): InstallEvent | null {
  return useSyncExternalStore(subscribe, () => (installed ? null : deferred));
}

/** Shows the browser's own install question. True when the person installed. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return choice.outcome === "accepted";
}

/** Already opened from the home screen. */
export function isInstalled(): boolean {
  return installed || window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad: no install event; Add to Home Screen from the Share menu. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** A phone or tablet, in any orientation (an iPad in landscape is wider than the desktop layout). */
export function isMobileDevice(): boolean {
  if (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || isIos()) return true;
  return window.matchMedia("(max-width: 959px)").matches && window.matchMedia("(pointer: coarse)").matches;
}

/** A fresh sign-in always offers the install popup again, even after "Not now". */
export function installAfterSignIn(): void {
  try {
    localStorage.removeItem(LATER_KEY);
  } catch {
    /* nothing stored */
  }
}

/** True while the popup is snoozed. The stored value is the time it may show again. */
export function installLaterActive(): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(LATER_KEY) ?? 0);
  } catch {
    return false;
  }
}

export function installLater(span: "week" | "day" = "week"): void {
  try {
    localStorage.setItem(LATER_KEY, String(Date.now() + (span === "week" ? WEEK_MS : DAY_MS)));
  } catch {
    /* private window: the popup simply comes back next time */
  }
}
