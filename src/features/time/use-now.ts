"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

function idle() {
  return () => {};
}

let cached = 0;

function snapshot() {
  const seconds = Math.floor(Date.now() / 1000);
  if (seconds !== cached) cached = seconds;
  return cached;
}

/** No servidor o relógio ainda não existe. Zero, e o cliente corrige. */
function serverSnapshot() {
  return 0;
}

/**
 * Segundos do relógio do navegador, mudando de segundo em segundo.
 * Ler `Date.now()` durante a renderização é impuro; isto é a forma que o
 * React oferece para acompanhar algo que muda fora dele.
 */
export function useNowSeconds(active: boolean) {
  return useSyncExternalStore(active ? subscribe : idle, snapshot, serverSnapshot);
}
