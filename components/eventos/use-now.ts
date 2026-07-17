"use client";

import { useEffect, useState } from "react";

/** Relógio partilhado dos countdowns (hero do canal e timer do checkout). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
