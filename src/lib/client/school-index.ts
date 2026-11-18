"use client";
import { useEffect, useState } from "react";
import type { SchoolIndexEntry } from "../types";

let cache: Promise<{ index: SchoolIndexEntry[]; dataAsOf: string | null }> | null = null;

export function loadIndex() {
  cache ??= fetch("/api/schools/index").then((r) => {
    if (!r.ok) throw new Error("index failed");
    return r.json();
  });
  return cache;
}

export function useSchoolIndex() {
  const [data, setData] = useState<{ index: SchoolIndexEntry[]; dataAsOf: string | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadIndex()
      .then(setData)
      .catch(() => {
        cache = null;
        setError(true);
      });
  }, []);
  return { data, error };
}
