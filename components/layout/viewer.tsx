"use client";

// Who is signed in, as far as the header needs it, remembered in the browser for the whole visit.
//
// The header lives in each route group's layout ((marketing), (client), (provider), admin), so it
// mounts again when a navigation crosses groups. Reading the session is dynamic, so each new header
// would first show its fallback ("Sign in", "For professionals") and then swap — a flash on every
// such navigation. Instead the server sends the viewer once per render (<ViewerSync>, inside
// Suspense) and the header's client parts read it from here: a header that mounts later already
// knows. Before the first answer of a page load it is `undefined` and the visitor version shows,
// exactly what the server rendered, so hydration matches.

import { useEffect, useSyncExternalStore } from "react";

import type { Role } from "@/lib/auth/session";

export type Viewer = { name: string; email: string; role: Role } | null;

// Client-only state: written in an effect, never during a server render.
let current: Viewer | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in viewer, null when signed out, undefined while not known yet on this page load. */
export function useViewer(): Viewer | undefined {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => undefined,
  );
}

/** Rendered by the server with the session it read; keeps the browser's copy up to date. */
export function ViewerSync({ viewer }: { viewer: Viewer }) {
  const key = viewer ? `${viewer.role}|${viewer.name}|${viewer.email}` : "";
  useEffect(() => {
    const same =
      current !== undefined &&
      (current ? `${current.role}|${current.name}|${current.email}` : "") === key;
    if (same) return;
    current = viewer;
    for (const listener of listeners) listener();
    // `viewer` is read through `key`: a new object with the same values is not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
