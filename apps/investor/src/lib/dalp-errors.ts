import { DalpSdkError } from "@settlemint/dalp-sdk";
import { toast } from "sonner";

/**
 * Client-SAFE DALP error helpers. This module deliberately imports nothing
 * server-only (no `@tanstack/react-start/server`), so React components can pull
 * `normalizeDalpError` / `dalpToast` into the browser bundle without dragging a
 * server import across the client boundary. `~/lib/dalp` re-exports these for
 * server-side callers, so there is a single public surface either way.
 *
 * `DalpSdkError` and `sonner`'s `toast` are both browser-safe.
 */
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

/**
 * The documented compliance-block signal on a transfer: HTTP 409 with the
 * `TRANSFER_BLOCKED_BY_COMPLIANCE` id (references/token.md). `dapi.*` is
 * untyped and the public id surface uses opaque `DALP-XXXX` codes, so we detect
 * defensively: a 409 whose id / message points at the compliance rule engine.
 * This is the one error the transfer flow must never surface as a raw crash —
 * it means "your KYC claim hasn't landed yet, or the recipient isn't eligible".
 */
export function isComplianceBlock(error: NormalizedDalpError): boolean {
  if (error.status !== 409) {
    return false;
  }
  const haystack = `${error.errorId ?? ""} ${error.message ?? ""} ${error.why ?? ""}`.toLowerCase();
  return (
    haystack.includes("transfer_blocked_by_compliance") ||
    haystack.includes("compliance") ||
    haystack.includes("not eligible")
  );
}
