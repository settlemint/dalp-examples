import type { DalpPlatformClient } from "@settlemint/dalp-sdk";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { dalpForRequest } from "~/lib/dalp";

/**
 * Server-only DALP request/response helpers. Kept out of `dalp.ts` so that
 * isomorphic modules (and the client bundle) can import the error/normalize
 * helpers and client factories without pulling in `@tanstack/react-start/server`,
 * which the Start import-protection plugin (correctly) bars from client code.
 * Only ever import this file from inside `createServerFn().handler(...)`.
 */

/**
 * Read the Cookie header off the current server request. Returns an empty
 * string when there is no cookie (anonymous request) so callers can branch
 * on `.length`.
 *
 * `getRequestHeader` is the verified export in this @tanstack/react-start
 * version (the older `getWebRequest`/`getHeaders` names are not present).
 */
export function getIncomingCookie(): string {
  return getRequestHeader("cookie") ?? "";
}

/**
 * Build a session-scoped client from the current request's Cookie header.
 * The everyday entry point for authenticated server fns — pairs with
 * `getIncomingCookie()` + `dalpForRequest()`.
 */
export function dalpForCurrentRequest(): DalpPlatformClient {
  return dalpForRequest(getIncomingCookie());
}

/**
 * Forward a Set-Cookie header captured from a DalpCookieStore back to the
 * browser on the current response. Pass `client.cookieStore.header` after an
 * auth op so the session cookie is persisted client-side. No-op when empty.
 */
export function forwardSessionCookie(setCookieHeader: string): void {
  if (setCookieHeader.length === 0) {
    return;
  }
  setResponseHeader("set-cookie", setCookieHeader);
}
