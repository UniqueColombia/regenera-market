"use client";

import { useSyncExternalStore } from "react";
import type { CartLine } from "@/lib/types";

/**
 * Carrito del comprador.
 *
 * localStorage es un sistema externo a React, así que se modela como store
 * externo y se lee con useSyncExternalStore en vez de sincronizarlo con
 * efectos. Eso evita el render en cascada y hace que dos pestañas abiertas
 * vean el mismo carrito.
 *
 * Solo guarda identificadores y cantidades, nunca precios: el precio se resuelve
 * siempre contra el catálogo del servidor, para que un carrito viejo no permita
 * comprar a un precio que ya no existe.
 */

const STORAGE_KEY = "regenera.cart.v1";

/** Referencia estable para el caso vacío: useSyncExternalStore compara por identidad. */
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    // Carrito corrupto o storage bloqueado: se empieza vacío en vez de romper.
    return EMPTY;
  }
}

if (typeof window !== "undefined") {
  lines = read();
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(next: CartLine[]) {
  lines = next.length === 0 ? EMPTY : next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Modo incógnito con storage lleno: el carrito sigue vivo en memoria.
  }
  emit();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  // Otra pestaña del mismo navegador tocó el carrito.
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_KEY) return;
    lines = read();
    emit();
  }
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => lines;
const getServerSnapshot = () => EMPTY;

/** Una experiencia en dos fechas distintas son dos líneas separadas. */
function sameLine(l: CartLine, listingId: string, date?: string) {
  return l.listingId === listingId && l.date === date;
}

export function addLine(line: CartLine) {
  const existing = lines.find((l) => sameLine(l, line.listingId, line.date));
  commit(
    existing
      ? lines.map((l) =>
          sameLine(l, line.listingId, line.date)
            ? { ...l, qty: l.qty + line.qty }
            : l,
        )
      : [...lines, line],
  );
}

export function updateQty(listingId: string, qty: number, date?: string) {
  commit(
    qty <= 0
      ? lines.filter((l) => !sameLine(l, listingId, date))
      : lines.map((l) => (sameLine(l, listingId, date) ? { ...l, qty } : l)),
  );
}

export function removeLine(listingId: string, date?: string) {
  commit(lines.filter((l) => !sameLine(l, listingId, date)));
}

export function clearCart() {
  commit([]);
}

/** Líneas del carrito. Vacío durante el render del servidor y la hidratación. */
export function useCartLines(): CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * false hasta que el componente monta en el cliente. Sirve para distinguir
 * "todavía no sé qué hay en el carrito" de "el carrito está vacío", que se ven
 * igual pero no significan lo mismo.
 */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function useCartCount(): number {
  const lines = useCartLines();
  return lines.reduce((n, l) => n + l.qty, 0);
}
