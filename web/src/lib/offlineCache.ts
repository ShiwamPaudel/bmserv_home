// Keeps the last loaded data readable offline (PRD F15): saved to localStorage, restored on start.
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";

// Tied to the build: data saved by an older version of BMServ may not match the screens any more.
const PREFIX = "bmserv-cache-";
const KEY = `${PREFIX}${__APP_BUILD__}`;
const MAX_CHARS = 3_000_000;

export function restoreCache(qc: QueryClient) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== KEY) localStorage.removeItem(k);
    }
    const raw = localStorage.getItem(KEY);
    if (raw) hydrate(qc, JSON.parse(raw));
  } catch {
    localStorage.removeItem(KEY);
  }
}

export function persistCache(qc: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    try {
      const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === "success" });
      const text = JSON.stringify(state);
      if (text.length < MAX_CHARS) localStorage.setItem(KEY, text);
    } catch {
      // Storage full or unavailable: offline view just shows less.
    }
  };
  return qc.getQueryCache().subscribe(() => {
    if (!timer) timer = setTimeout(save, 1500);
  });
}

export function clearCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // unavailable: nothing to clear
  }
}
