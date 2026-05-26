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
