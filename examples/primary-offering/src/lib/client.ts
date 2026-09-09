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

/** Read a variable that only some deployments need. */
function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Build the client for one service account.
 *
 * `organizationId` is only sent when the environment names one. A key that
 * belongs to a single organization already carries that context; an account
 * with access to more than one has to say which.
 *
 * `DALP_EXECUTOR` picks which wallet signs the chain writes. Leave it unset and
 * the platform chooses. Set it to `eoa` when the account's smart wallet has not
 * been deployed yet: the queue cannot route a user operation through a
 * counterfactual wallet and every write dead-letters with "counterfactual but
 * missing participant identity metadata".
 *
 * `Prefer: respond-async` is what makes a write answer with the 202 handle
 * these examples follow. The SDK sends `Prefer: wait=99` on every mutation
 * unless you say otherwise, which holds the request open until the chain
 * settles and returns the finished resource instead of a transaction id. Both
 * are correct; asking for the handle is what lets one settlement job submit
 * many writes and follow them all.
 */
export function clientFor(account: ServiceAccount): DalpClient {
  const executor = optionalEnv("DALP_EXECUTOR");
  return createDalpClient({
    url: requireEnv("DALP_URL"),
    apiKey: requireEnv(KEY_VARIABLE[account]),
    organizationId: optionalEnv("DALP_ORG_ID"),
    headers: {
      Prefer: "respond-async",
      ...(executor === undefined ? {} : { "X-Executor": executor }),
    },
  });
}

/** Print which flow is running, so a run of all nine reads as one transcript. */
export function heading(flow: string, account: ServiceAccount | "read-only"): void {
  console.log(`\n=== ${flow}  (${account}) ===`);
}
