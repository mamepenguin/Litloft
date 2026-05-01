import type { ComponentType } from "react";
import type { LoftEmbedProps } from "./types";

export const GENERIC_PROVIDER = "generic";

// Map (rather than a plain object / Record) so that lookups for keys
// like "__proto__" or "constructor" — which could come from a malformed
// .loft file on disk — return undefined instead of resolving to a
// prototype property.
const players = new Map<string, ComponentType<LoftEmbedProps>>();

export function registerLoftPlayer(
  name: string,
  Component: ComponentType<LoftEmbedProps>,
): void {
  if (!name || name === GENERIC_PROVIDER) {
    throw new Error(
      `Invalid player name: ${name || "(empty)"}. Reserved/empty names are rejected.`,
    );
  }
  players.set(name, Component);
}

export function getLoftPlayer(
  provider: string,
): ComponentType<LoftEmbedProps> | null {
  return players.get(provider) ?? null;
}

export function registeredPlayerNames(): string[] {
  return Array.from(players.keys());
}

export function _resetPlayerRegistryForTests(): void {
  players.clear();
}
