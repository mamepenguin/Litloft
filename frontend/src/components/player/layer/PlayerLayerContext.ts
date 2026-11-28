"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { FindMarksValue } from "@/components/FileDetail/find/types";
import type { QueuePageState } from "@/components/queue/QueuePageContext";

export interface PlayerSlotRegistration {
  id: string;
  slotEl: HTMLElement | null;
  player: ReactNode;
  queuePage: QueuePageState | null;
  findMarks: FindMarksValue;
}

/**
 * The layer's slots, and which one of them the layer serves. Exactly one slot
 * is served at a time: the player element belongs to one slot's mount, so
 * handing it to another slot would be the re-parent that restarts an iframe or
 * a `<video>`.
 */
export class PlayerLayerStore {
  private readonly slots = new Map<string, PlayerSlotRegistration>();
  private readonly listeners = new Set<() => void>();
  private servedId: string | null = null;
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  getServedId = (): string | null => this.servedId;

  getServed = (): PlayerSlotRegistration | null =>
    this.servedId === null ? null : (this.slots.get(this.servedId) ?? null);

  register = (registration: PlayerSlotRegistration): void => {
    this.slots.set(registration.id, registration);
    if (this.servedId === null) this.servedId = registration.id;
    this.publish();
  };

  update = (registration: PlayerSlotRegistration): void => {
    this.slots.set(registration.id, registration);
    if (registration.id === this.servedId) this.publish();
  };

  unregister = (id: string): void => {
    if (!this.slots.delete(id)) return;
    if (this.servedId === id) {
      const next = this.slots.keys().next();
      this.servedId = next.done ? null : next.value;
    }
    this.publish();
  };

  private publish(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export const PlayerLayerContext = createContext<PlayerLayerStore | null>(null);

export function usePlayerLayerStore(): PlayerLayerStore | null {
  return useContext(PlayerLayerContext);
}
