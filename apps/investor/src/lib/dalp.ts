import { createDalpPlatformClient, type DalpPlatformClient } from "@settlemint/dalp-sdk";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

// Error helpers live in a client-safe module (no server-only imports) so React
// components can use them without dragging `@tanstack/react-start/server` into
// the browser bundle. Re-exported here so server-side callers keep one import.
export {
  dalpToast,
  normalizeDalpError,
  isComplianceBlock,
  type NormalizedDalpError,
} from "./dalp-errors";

import type { TransactionReadResponse, TransactionStatus } from "./dalp-types";

function requireEnv(key: "DALP_API_URL" | "DALP_API_KEY" | "DALP_ORG_ID"): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`Missing env var ${key}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

let adminClient: DalpPlatformClient | undefined;

export function dalpAdmin(): DalpPlatformClient {
  if (adminClient) {
    return adminClient;
  }
  adminClient = createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    apiKey: requireEnv("DALP_API_KEY"),
    organizationId: requireEnv("DALP_ORG_ID"),
  });
  return adminClient;
}

export function dalpForRequest(cookieHeader: string): DalpPlatformClient {
  return createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    organizationId: requireEnv("DALP_ORG_ID"),
    cookie: cookieHeader,
  });
}

/**
 * Session-scoped client for a single mutation, carrying a fresh
 * `Idempotency-Key` header. DALP's idempotency-required writes (KYC
 * versions.create / version.submit, transfers, token mints …) dedupe on this
 * key, so each logical mutation must send its own.
 *
 * The SDK's own type doc warns AGAINST the client-level `idempotencyKey`
 * config (it would pin the SAME key onto every request made through a reused
 * client) and points at the per-request `headers` callback instead — which is
 * exactly what we use here. Build one of these per mutation; never reuse it
 * across two writes.
 */
export function dalpForRequestWithIdempotency(
  cookieHeader: string,
  idempotencyKey: string,
): DalpPlatformClient {
  return createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    organizationId: requireEnv("DALP_ORG_ID"),
    cookie: cookieHeader,
    headers: () => ({ "Idempotency-Key": idempotencyKey }),
  });
}

/**
 * Anonymous platform client — no apiKey, no cookie. Used for the signup
 * landing of the auth chain (`platform.auth.signUp.email`, `signIn.email`,
 * OTP verify). The returned client owns its own DalpCookieStore which
 * captures the session cookies set by Better Auth on success; read
 * `client.cookieStore.header` after the call to forward Set-Cookie to
 * the browser.
 */
export function dalpAnonymous(): DalpPlatformClient {
  return createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    organizationId: requireEnv("DALP_ORG_ID"),
  });
}

/**
 * Read the Cookie header off the current server request. Returns an empty
 * string when there is no cookie (anonymous request) so callers can branch
 * on `.length`.
 *
 * `getRequestHeader` is the verified export in this @tanstack/react-start
 * version (the older `getWebRequest`/`getHeaders` names are not present —
 * confirmed against `@tanstack/start-server-core`'s request-response.d.ts).
 */
export function getIncomingCookie(): string {
  return getRequestHeader("cookie") ?? "";
}

/**
 * Build a session-scoped client from the current request's Cookie header.
 * The everyday entry point for authenticated server fns — pairs with
 * `getIncomingCookie()` + `dalpForRequest()`. The Better Auth session cookie
 * travels with every DAPI call made through the returned client.
 */
export function dalpForCurrentRequest(): DalpPlatformClient {
  return dalpForRequest(getIncomingCookie());
}

/**
 * `dalpForCurrentRequest()` for a single idempotency-required mutation: scopes
 * to the incoming session cookie AND attaches a fresh `Idempotency-Key`. Pass a
 * new key (e.g. `crypto.randomUUID()`) for each distinct write.
 */
export function dalpForCurrentRequestWithIdempotency(idempotencyKey: string): DalpPlatformClient {
  return dalpForRequestWithIdempotency(getIncomingCookie(), idempotencyKey);
}

/**
 * Forward the Set-Cookie header captured by a client's DalpCookieStore back to
 * the browser on the current response. Call this after an auth op (signUp /
 * signIn / OTP verify) so the rotated session cookie is persisted client-side.
 *
 * Reads `client.cookieStore.header` (a Set-Cookie string the store accumulates
 * from Better Auth) and writes it to the response. No-op when the store is
 * empty, so it is always safe to call.
 */
export function forwardSessionCookie(client: DalpPlatformClient): void {
  const setCookieHeader = client.cookieStore.header;
  if (setCookieHeader.length === 0) {
    return;
  }
  setResponseHeader("set-cookie", setCookieHeader);
}

const TERMINAL_TX_STATUSES: ReadonlySet<TransactionStatus> = new Set(["completed", "failed"]);

export interface PollResult {
  status: TransactionStatus;
  transactionHash: string | null;
  timedOut: boolean;
}

/**
 * Poll `transaction.read` until the async mutation settles, per the documented
 * recipe in references/account-reads.md. Async writes (token.transfer, mint,
 * KYC approve, …) return before the on-chain side lands; we read the transaction
 * by id until its status is terminal (`completed` | `failed`).
 *
 * Uses gentle backoff (1.5s → 3s → 6s, capped) and bounds total wait so a stuck
 * workflow surfaces a "still settling" state instead of hanging the request.
 * Returns `timedOut: true` (never throws on timeout) so the caller can render a
 * "we're still confirming this" UI rather than a crash.
 *
 * `client` must be the SAME session-scoped client used for the mutation (cookie
 * forwarding), and `dapi.transaction.read` is untyped — cast to
 * `TransactionReadResponse` at the boundary.
 */
export async function pollTransaction(
  client: DalpPlatformClient,
  transactionId: string,
  options: { intervalMs?: number; timeoutMs?: number; maxIntervalMs?: number } = {},
): Promise<PollResult> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const maxIntervalMs = options.maxIntervalMs ?? 6_000;
  let interval = options.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  // A poll loop is inherently sequential: each read depends on the previous
  // result (we stop the moment status is terminal) and the backoff wait must
  // happen BETWEEN reads. Promise.all parallelization doesn't apply here, so
  // the await-in-loop is intentional.
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop
    const tx = (await client.dapi.transaction.read({
      params: { transactionId },
    })) as TransactionReadResponse;

    const status = tx.data?.status ?? null;
    if (status && TERMINAL_TX_STATUSES.has(status)) {
      return {
        status,
        transactionHash: tx.data?.transactionHash ?? null,
        timedOut: false,
      };
    }

    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, interval));
    interval = Math.min(interval * 2, maxIntervalMs);
  }

  return { status: "processing", transactionHash: null, timedOut: true };
}
