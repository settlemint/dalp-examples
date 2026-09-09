/**
 * The ids one flow writes and the next one reads.
 *
 * The flows run in order and each appends what it created to `state.json`, so
 * flow 08 can mint to the investors flow 03 onboarded without anyone pasting an
 * address between terminals. The file is local scratch, not a datastore: delete
 * it to start a fresh run.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A user the platform created: the three ids to store on your own record. */
export interface Party {
  readonly email: string;
  readonly userId: string;
  readonly wallet: string;
  readonly identity: string;
}

/** One line of the allocation the issuer approved, in whole display units. */
export interface Allocation {
  readonly wallet: string;
  readonly units: string;
}

export interface FlowState {
  readonly issuer?: Party;
  readonly investors?: readonly Party[];
  readonly token?: { readonly address: string; readonly decimals: number };
  readonly allocations?: readonly Allocation[];
  readonly mint?: { readonly transactionId: string; readonly blockNumber: string | null };
}

const STATE_PATH = fileURLToPath(new URL("./state.json", import.meta.url));

export function readState(): FlowState {
  if (!existsSync(STATE_PATH)) {
    return {};
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as FlowState;
}

/** Merge one flow's output into the file the next flow reads. */
export function writeState(patch: FlowState): FlowState {
  const merged: FlowState = { ...readState(), ...patch };
  writeFileSync(STATE_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

/** Read a value an earlier flow must have written, and say which flow if it did not. */
export function requireState<Key extends keyof FlowState>(
  key: Key,
  producedBy: string,
): NonNullable<FlowState[Key]> {
  const value = readState()[key];
  if (value === undefined) {
    throw new Error(`state.json has no "${key}". Run ${producedBy} first.`);
  }
  return value as NonNullable<FlowState[Key]>;
}
