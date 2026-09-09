/**
 * One DALP client per service account, built from the environment.
 *
 * Each service account holds its own API key and its own roles, so the key you
 * construct with decides what the call is allowed to do. There is no
 * X-Participant header anywhere in these examples: the party a call concerns is
 * named in the body.
 */

import { createDalpClient } from "@settlemint/dalp-sdk";
import type { DalpClient } from "@settlemint/dalp-sdk";

/** The five service accounts of the primary offering flow, and the key each reads. */
const KEY_VARIABLE = {
  operator: "DALP_OPERATOR_KEY",
  issuer: "DALP_ISSUER_KEY",
  kyc: "DALP_KYC_KEY",
  settlement: "DALP_SETTLEMENT_KEY",
  reporting: "DALP_REPORTING_KEY",
} as const;

export type ServiceAccount = keyof typeof KEY_VARIABLE;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

/** Build the client for one service account. */
export function clientFor(account: ServiceAccount): DalpClient {
  return createDalpClient({
    url: requireEnv("DALP_URL"),
    apiKey: requireEnv(KEY_VARIABLE[account]),
    organizationId: requireEnv("DALP_ORG_ID"),
  });
}

/** Print which flow is running, so a run of all nine reads as one transcript. */
export function heading(flow: string, account: ServiceAccount | "read-only"): void {
  console.log(`\n=== ${flow}  (${account}) ===`);
}
