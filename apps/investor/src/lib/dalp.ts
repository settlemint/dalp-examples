import {
  createDalpPlatformClient,
  DalpSdkError,
  type DalpPlatformClient,
} from "@settlemint/dalp-sdk";

function requireEnv(key: "DALP_API_URL" | "DALP_API_KEY" | "DALP_ORG_ID"): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`Missing env var ${key}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

let cached: DalpPlatformClient | undefined;

export function dalp(): DalpPlatformClient {
  if (cached) {
    return cached;
  }
  cached = createDalpPlatformClient({
    url: requireEnv("DALP_API_URL"),
    apiKey: requireEnv("DALP_API_KEY"),
    organizationId: requireEnv("DALP_ORG_ID"),
  });
  return cached;
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
