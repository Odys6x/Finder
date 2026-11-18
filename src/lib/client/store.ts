"use client";
/**
 * Browser-only state (spec §5.1 PDPA): the profile and shortlist never leave the
 * device except as the body of a single match/chat request, and are never stored
 * server-side. Backed by localStorage with a tiny pub/sub for React.
 */
import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_PROFILE, type Profile } from "../types";

const KEYS = { profile: "sp.profile.v1", shortlist: "sp.shortlist.v1" } as const;
type Key = (typeof KEYS)[keyof typeof KEYS];

const listeners = new Set<() => void>();
const memo = new Map<Key, { raw: string | null; value: unknown }>();

function read<T>(key: Key, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    /* private mode */
  }
  const m = memo.get(key);
  if (m && m.raw === raw) return m.value as T;
  let value: T = fallback;
  if (raw) {
    try {
      value = { ...(fallback as object), ...JSON.parse(raw) } as T;
      if (Array.isArray(fallback)) value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  memo.set(key, { raw, value });
  return value;
}

function write(key: Key, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota/private mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY_LIST: string[] = [];

export function useProfile(): [Profile, (p: Profile | ((p: Profile) => Profile)) => void, boolean] {
  const profile = useSyncExternalStore(
    subscribe,
    () => read(KEYS.profile, EMPTY_PROFILE),
    () => EMPTY_PROFILE,
  );
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const set = useCallback((p: Profile | ((p: Profile) => Profile)) => {
    const cur = read(KEYS.profile, EMPTY_PROFILE);
    write(KEYS.profile, typeof p === "function" ? p(cur) : p);
  }, []);
  return [profile, set, hydrated];
}

export function useShortlist(): [string[], (codes: string[]) => void] {
  const list = useSyncExternalStore(
    subscribe,
    () => read<string[]>(KEYS.shortlist, EMPTY_LIST),
    () => EMPTY_LIST,
  );
  const set = useCallback((codes: string[]) => write(KEYS.shortlist, [...new Set(codes)]), []);
  return [list, set];
}

export function clearAllLocalData() {
  try {
    localStorage.removeItem(KEYS.profile);
    localStorage.removeItem(KEYS.shortlist);
    localStorage.removeItem("sp.chat.v1");
  } catch {
    /* ignore */
  }
  memo.clear();
  listeners.forEach((l) => l());
}

export function profileIsReady(p: Profile) {
  return p.psleScore !== null && p.postingGroup !== null;
}
