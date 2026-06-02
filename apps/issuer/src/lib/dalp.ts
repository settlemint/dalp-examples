import {
  createDalpPlatformClient,
  DalpSdkError,
  type DalpPlatformClient,
} from "@settlemint/dalp-sdk";
import { toast } from "sonner";

function requireEnv(key: "DALP_API_URL" | "DALP_API_KEY" | "DALP_ORG_ID"): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`Missing env var ${key}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

let adminClient: DalpPlatformClient | undefined;

/**
 * API-key-authenticated client for org-admin / platform reads (e.g. the
 * landing connection check). Cached because the credential never changes.
 */
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

/**
 * Session-scoped client built from an incoming Cookie header. Use this for
 * every authenticated read/write on behalf of the signed-in issuer — the
 * Better Auth session cookie travels with each request.
 */
export function dalpForRequest(cookieHeader: string): DalpPlatformClient {
  return createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    organizationId: requireEnv("DALP_ORG_ID"),
    cookie: cookieHeader,
  });
}

/**
 * Session-scoped client for a SINGLE async mutation that needs a fresh
 * idempotency key. The key is supplied through the per-request `headers`
 * callback as `Idempotency-Key` — deliberately NOT via the client-level
 * `idempotencyKey` config, which would dedupe every request on a reused
 * client (see SKILL.md "Idempotency-key discipline"). Build one of these
 * per mutation with a fresh UUID.
 */
export function dalpForMutation(cookieHeader: string, idempotencyKey: string): DalpPlatformClient {
  return createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    organizationId: requireEnv("DALP_ORG_ID"),
    cookie: cookieHeader,
    headers: () => ({ "Idempotency-Key": idempotencyKey }),
  });
}

/**
 * Anonymous platform client — no apiKey, no cookie. Used for the front of
 * the auth chain (`auth.signIn.email`, `auth.signUp.email`, OTP verify).
 * The returned client owns its own DalpCookieStore which captures the
 * session cookies Better Auth sets on success; read `client.cookieStore.header`
 * after the call and forward it to the browser via `forwardSessionCookie()`.
 */
export function dalpAnonymous(): DalpPlatformClient {
  return createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    organizationId: requireEnv("DALP_ORG_ID"),
  });
}

export interface NormalizedDalpError {
  message: string;
  why?: string;
  fix?: string;
  status?: number;
  retryable?: boolean;
  errorId?: string;
}

export function normalizeDalpError(error: unknown): NormalizedDalpError {
  if (error instanceof DalpSdkError) {
    return {
      message: error.message,
      why: error.why,
      fix: error.fix,
      status: error.status,
      retryable: error.retryable,
      errorId: error.id,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

export function dalpToast(error: unknown): void {
  const normalized = normalizeDalpError(error);
  const description = [normalized.why, normalized.fix].filter(Boolean).join(" — ");
  toast.error(normalized.message, description ? { description } : undefined);
}
