import { createServerFn } from "@tanstack/react-start";
import { dalpForMutation, normalizeDalpError, type NormalizedDalpError } from "~/lib/dalp";
import { dalpForCurrentRequest, getIncomingCookie } from "~/lib/dalp.server";

/* -------------------------------------------------------------------------- */
/*  Typed boundaries for `dapi.*` (which resolves to `any`).                   */
/*                                                                            */
/*  Every field below is sourced from the real oRPC contract schemas mined    */
/*  from the SDK bundle (kyc-profile-version.*.schema.ts, user.list.schema.ts, */
/*  transaction.status.schema.ts). The reference docs paraphrase some of      */
/*  these (e.g. `fullName`/`reason`); the wire shapes here are authoritative.  */
/* -------------------------------------------------------------------------- */

/** KYC version lifecycle — `kycVersionStatuses` in the contract. */
export type KycVersionStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected";

/** A row in `dapi.user.kyc.versions.list({ ... }).items`. */
interface KycVersionListItem {
  id: string;
  versionNumber: number;
  status: KycVersionStatus;
  createdAt: string;
  submittedAt: string | null;
  submittedBy: string | null;
  reviewedAt: string | null;
  reviewOutcome: "approved" | "rejected" | "changes_requested" | null;
  isUnderReview: boolean;
}

interface KycVersionsListResponse {
  items: KycVersionListItem[];
  total: number;
  limit: number;
  offset: number;
}

/** A row in `dapi.user.list({ ... }).items`. */
interface UserListItem {
  id: string;
  name: string;
  email?: string;
  wallet: string | null;
  participantId: string;
  country?: string | null;
}

interface UserListResponse {
  items: UserListItem[];
  total: number;
  offset: number;
  limit?: number;
}

/** Full version payload — `dapi.user.kyc.version.read(...)`. */
interface KycVersionReadResponse {
  id: string;
  userId: string;
  versionNumber: number;
  status: KycVersionStatus;
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  country: string | null;
  residencyStatus: "resident" | "non_resident" | "dual_resident" | "unknown" | null;
  nationalId: string | null;
  createdAt: string;
  submittedAt: string | null;
  submittedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewOutcome: "approved" | "rejected" | "changes_requested" | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  documentsCount: number;
  canReview: boolean;
}

/**
 * Async-accepted envelope returned by `approve` (and every async mutation):
 * `{ transactionId, status, statusUrl }`. `statusUrl` is the poll URL; the
 * embedded UUID is the `transactionId` we feed to the queue-status read.
 */
interface AsyncAcceptedResponse {
  transactionId?: string;
  status?: string;
  statusUrl?: string;
}

/**
 * Queue-status poll payload — `dapi.transaction.read({ ... })` against the
 * approval's `statusUrl`. The terminal states are `COMPLETED` / `FAILED`
 * (`transactionRequestStates` in the contract). The reference doc shows a
 * lowercase `completed`/`failed` shape and a v1 `receipt` shape, so we treat
 * any of those as terminal to stay robust across backend versions.
 */
interface TransactionStatusResponse {
  transactionId?: string;
  status?: string;
  subStatus?: string | null;
  transactionHash?: string | null;
  errorMessage?: string | null;
  receipt?: { status?: string } | null;
}

/* -------------------------------------------------------------------------- */
/*  The shapes the UI consumes.                                               */
/* -------------------------------------------------------------------------- */

/** One submitted profile awaiting review, joined to its submitter. */
export interface KycQueueEntry {
  versionId: string;
  versionNumber: number;
  status: KycVersionStatus;
  submittedAt: string | null;
  userId: string;
  userName: string;
  userEmail: string | null;
  wallet: string | null;
  country: string | null;
}

export type KycQueueResult =
  | { ok: true; entries: KycQueueEntry[]; scannedUsers: number }
  | { ok: false; error: NormalizedDalpError };

export interface KycReviewProfile {
  versionId: string;
  userId: string;
  versionNumber: number;
  status: KycVersionStatus;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  country: string | null;
  residencyStatus: string | null;
  nationalId: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewOutcome: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  documentsCount: number;
  canReview: boolean;
}

export type KycReviewResult =
  | { ok: true; profile: KycReviewProfile; submitter: KycSubmitter | null }
  | { ok: false; error: NormalizedDalpError };

export interface KycSubmitter {
  id: string;
  name: string;
  email: string | null;
  wallet: string | null;
  country: string | null;
}

/** Terminal-aware claim poll state surfaced to the live status UI. */
export type ClaimPhase = "queued" | "processing" | "completed" | "failed";

export interface ClaimStatus {
  ok: boolean;
  phase: ClaimPhase;
  /** Raw backend status string (e.g. "CONFIRMING") for the detail line. */
  rawStatus: string | null;
  subStatus: string | null;
  transactionHash: string | null;
  errorMessage: string | null;
  /** Present only when the poll call itself failed. */
  error?: NormalizedDalpError;
}

/* -------------------------------------------------------------------------- */
/*  Helpers.                                                                  */
/* -------------------------------------------------------------------------- */

/** The statuses that belong in the review queue (awaiting an issuer decision). */
const PENDING_STATUSES: KycVersionStatus[] = ["submitted", "under_review"];

/** How many users to scan per queue build. Capped to keep the fan-out bounded. */
const USER_SCAN_LIMIT = 50;

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Pull the transaction id out of an async-accepted envelope. Prefer the
 * explicit `transactionId`; otherwise take the last path segment of
 * `statusUrl` (e.g. `/api/transaction/tx_123` → `tx_123`).
 */
function transactionIdFrom(accepted: AsyncAcceptedResponse): string | null {
  if (accepted.transactionId && accepted.transactionId.length > 0) {
    return accepted.transactionId;
  }
  if (accepted.statusUrl && accepted.statusUrl.length > 0) {
    const trimmed = accepted.statusUrl.split("?")[0]?.replace(/\/$/, "") ?? "";
    const segment = trimmed.split("/").pop();
    if (segment && segment.length > 0) {
      return segment;
    }
  }
  return null;
}

/**
 * Order queue entries newest-submitted first. Implemented as an insertion sort
 * (rather than `Array#sort`) so the result is a fresh, non-mutating array and
 * stays within the ES2022 lib (no `toSorted`).
 */
function sortBySubmittedDesc(entries: KycQueueEntry[]): KycQueueEntry[] {
  const result: KycQueueEntry[] = [];
  for (const entry of entries) {
    const key = entry.submittedAt ?? "";
    let index = result.length;
    while (index > 0 && (result[index - 1]?.submittedAt ?? "") < key) {
      index -= 1;
    }
    result.splice(index, 0, entry);
  }
  return result;
}

/** Map any backend transaction-status string to a coarse claim phase. */
function phaseFor(raw: string | null | undefined, receiptStatus?: string | null): ClaimPhase {
  const value = (raw ?? "").toUpperCase();
  if (value === "COMPLETED" || value === "CONFIRMED") {
    return "completed";
  }
  if (value === "FAILED" || value === "DEAD_LETTER" || value === "CANCELLED") {
    return "failed";
  }
  // v1 receipt shape: a non-null receipt means the tx mined.
  if (receiptStatus) {
    return receiptStatus.toLowerCase() === "success" ? "completed" : "failed";
  }
  if (value === "QUEUED" || value === "RECEIVED" || value === "") {
    return "queued";
  }
  return "processing";
}

/* -------------------------------------------------------------------------- */
/*  Server functions.                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Build the issuer review queue. There is no cross-user "incoming" endpoint,
 * so we page the org's users (`user.list`) and, for each, list their KYC
 * versions filtered to the pending statuses (`user.kyc.versions.list`). The
 * dapp holds the iteration — exactly as the SDK reference prescribes.
 */
export const fetchKycQueue = createServerFn({ method: "GET" }).handler(
  async (): Promise<KycQueueResult> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: { message: "Your session has expired. Sign in again." } };
    }

    try {
      const client = dalpForCurrentRequest();
      const users = (await client.dapi.user.list({
        limit: USER_SCAN_LIMIT,
        offset: 0,
        orderBy: "createdAt",
        orderDirection: "desc",
      })) as UserListResponse;

      const userList = users.items ?? [];

      // Fan out per-user version lists, then flatten the submitted ones.
      const perUser = await Promise.all(
        userList.map(async (user): Promise<KycQueueEntry[]> => {
          try {
            const versions = (await client.dapi.user.kyc.versions.list({
              userId: user.id,
              statuses: PENDING_STATUSES,
              limit: 25,
              offset: 0,
              orderDirection: "desc",
            })) as KycVersionsListResponse;

            return (versions.items ?? [])
              .filter((version) => PENDING_STATUSES.includes(version.status))
              .map((version) => ({
                versionId: version.id,
                versionNumber: version.versionNumber,
                status: version.status,
                submittedAt: version.submittedAt,
                userId: user.id,
                userName: user.name,
                userEmail: user.email ?? null,
                wallet: user.wallet,
                country: user.country ?? null,
              }));
          } catch {
            // A single user we can't read (e.g. cross-tenant 404) must not
            // sink the whole queue — skip them.
            return [];
          }
        }),
      );

      const entries = sortBySubmittedDesc(perUser.flat());

      return { ok: true, entries, scannedUsers: userList.length };
    } catch (error) {
      return { ok: false, error: normalizeDalpError(error) };
    }
  },
);

/** Read a single submitted version + its submitter for the review detail. */
export const fetchKycReview = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown): { versionId: string } => {
    const input = (raw ?? {}) as { versionId?: unknown };
    const versionId = String(input.versionId ?? "").trim();
    if (versionId.length === 0) {
      throw new Error("A version id is required.");
    }
    return { versionId };
  })
  .handler(async ({ data }): Promise<KycReviewResult> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: { message: "Your session has expired. Sign in again." } };
    }

    try {
      const client = dalpForCurrentRequest();
      const version = (await client.dapi.user.kyc.version.read({
        versionId: data.versionId,
      })) as KycVersionReadResponse;

      const profile: KycReviewProfile = {
        versionId: version.id,
        userId: version.userId,
        versionNumber: version.versionNumber,
        status: version.status,
        firstName: version.firstName,
        lastName: version.lastName,
        dateOfBirth: version.dob,
        country: version.country,
        residencyStatus: version.residencyStatus,
        nationalId: version.nationalId,
        submittedAt: version.submittedAt,
        reviewedAt: version.reviewedAt,
        reviewOutcome: version.reviewOutcome,
        reviewNotes: version.reviewNotes,
        rejectionReason: version.rejectionReason,
        documentsCount: version.documentsCount,
        canReview: version.canReview,
      };

      // Best-effort submitter lookup — surfaces wallet + contact on the detail.
      let submitter: KycSubmitter | null = null;
      try {
        const user = (await client.dapi.user.readByUserId({
          userId: version.userId,
        })) as UserListItem;
        submitter = {
          id: user.id,
          name: user.name,
          email: user.email ?? null,
          wallet: user.wallet,
          country: user.country ?? null,
        };
      } catch {
        submitter = null;
      }

      return { ok: true, profile, submitter };
    } catch (error) {
      return { ok: false, error: normalizeDalpError(error) };
    }
  });

/**
 * Approve a KYC version — the DALP moment. Async: the response is an
 * accepted envelope carrying a `transactionId` / `statusUrl`. Approval kicks
 * off the on-chain workflow that lands the `KYC_APPROVED` claim. We return
 * the transaction id so the client can poll it to "claim issued / done".
 *
 * A fresh `Idempotency-Key` is set per call via `dalpForMutation`. The pincode
 * the reviewer types is forwarded as `walletVerification` (the real DALP
 * `UserVerificationSchema`: `{ secretVerificationCode, verificationType }`).
 */
export const approveKycVersion = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): { versionId: string; pincode: string; reviewNotes?: string } => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const versionId = String(input.versionId ?? "").trim();
    const pincode = String(input.pincode ?? "").trim();
    const reviewNotes = String(input.reviewNotes ?? "").trim();
    if (versionId.length === 0) {
      throw new Error("A version id is required.");
    }
    if (pincode.length < 4) {
      throw new Error("Enter your wallet verification code to approve.");
    }
    return reviewNotes.length > 0 ? { versionId, pincode, reviewNotes } : { versionId, pincode };
  })
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; transactionId: string | null } | { ok: false; error: NormalizedDalpError }
    > => {
      const cookie = getIncomingCookie();
      if (cookie.length === 0) {
        return { ok: false, error: { message: "Your session has expired. Sign in again." } };
      }

      try {
        const client = dalpForMutation(cookie, uuid());
        const accepted = (await client.dapi.user.kyc.version.approve({
          versionId: data.versionId,
          ...(data.reviewNotes ? { reviewNotes: data.reviewNotes } : {}),
          walletVerification: {
            secretVerificationCode: data.pincode,
            verificationType: "PINCODE",
          },
        })) as AsyncAcceptedResponse;

        return { ok: true, transactionId: transactionIdFrom(accepted) };
      } catch (error) {
        return { ok: false, error: normalizeDalpError(error) };
      }
    },
  );

/** Reject a version with a reason (sync). Reason must be ≥ 10 chars. */
export const rejectKycVersion = createServerFn({ method: "POST" })
  .inputValidator(
    (raw: unknown): { versionId: string; rejectionReason: string; pincode: string } => {
      const input = (raw ?? {}) as Record<string, unknown>;
      const versionId = String(input.versionId ?? "").trim();
      const rejectionReason = String(input.rejectionReason ?? "").trim();
      const pincode = String(input.pincode ?? "").trim();
      if (versionId.length === 0) {
        throw new Error("A version id is required.");
      }
      if (rejectionReason.length < 10) {
        throw new Error("Give a rejection reason of at least 10 characters.");
      }
      if (pincode.length < 4) {
        throw new Error("Enter your wallet verification code to reject.");
      }
      return { versionId, rejectionReason, pincode };
    },
  )
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: NormalizedDalpError }> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: { message: "Your session has expired. Sign in again." } };
    }

    try {
      const client = dalpForMutation(cookie, uuid());
      await client.dapi.user.kyc.version.reject({
        versionId: data.versionId,
        rejectionReason: data.rejectionReason,
        walletVerification: {
          secretVerificationCode: data.pincode,
          verificationType: "PINCODE",
        },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: normalizeDalpError(error) };
    }
  });

/**
 * Request changes (sync). Creates a fresh draft on the investor's profile
 * with the issuer's note + the specific fields to fix attached.
 */
export const requestKycUpdate = createServerFn({ method: "POST" })
  .inputValidator(
    (
      raw: unknown,
    ): { versionId: string; reason: string; requiredFields: string[]; pincode: string } => {
      const input = (raw ?? {}) as Record<string, unknown>;
      const versionId = String(input.versionId ?? "").trim();
      const reason = String(input.reason ?? "").trim();
      const pincode = String(input.pincode ?? "").trim();
      const requiredFields = Array.isArray(input.requiredFields)
        ? input.requiredFields.map((f) => String(f)).filter((f) => f.length > 0)
        : [];
      if (versionId.length === 0) {
        throw new Error("A version id is required.");
      }
      if (reason.length < 10) {
        throw new Error("Describe the requested changes in at least 10 characters.");
      }
      if (pincode.length < 4) {
        throw new Error("Enter your wallet verification code to request changes.");
      }
      return { versionId, reason, requiredFields, pincode };
    },
  )
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: NormalizedDalpError }> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { ok: false, error: { message: "Your session has expired. Sign in again." } };
    }

    try {
      const client = dalpForMutation(cookie, uuid());
      await client.dapi.user.kyc.version.requestUpdate({
        versionId: data.versionId,
        reason: data.reason,
        requiredFields: data.requiredFields,
        walletVerification: {
          secretVerificationCode: data.pincode,
          verificationType: "PINCODE",
        },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: normalizeDalpError(error) };
    }
  });

/** The minimal untyped surface of the transaction namespace we touch. */
interface TransactionNamespace {
  status?: (input: { transactionId: string }) => Promise<unknown>;
  read?: (input: { transactionId?: string; transactionHash?: string }) => Promise<unknown>;
}

/**
 * Resolve the approval's queue status. The async-accepted envelope carries a
 * UUIDv7 `transactionId`, so the canonical lookup is the queue-status read
 * (`/transaction-requests/{transactionId}`), which the SDK surfaces as
 * `transaction.status`. We prefer it, then fall back to `transaction.read`
 * (the reference doc's name) so this works whichever the live SDK wires.
 */
async function pollTransaction(
  transaction: TransactionNamespace,
  transactionId: string,
): Promise<TransactionStatusResponse> {
  if (typeof transaction.status === "function") {
    return (await transaction.status({ transactionId })) as TransactionStatusResponse;
  }
  if (typeof transaction.read === "function") {
    return (await transaction.read({ transactionId })) as TransactionStatusResponse;
  }
  throw new Error("The transaction status endpoint is unavailable.");
}

/**
 * One poll tick against the approval transaction. The client calls this on an
 * interval after approve resolves, until `phase` is terminal. We keep the loop
 * in the browser (one request per tick) so the live status UI can react.
 */
export const readClaimStatus = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown): { transactionId: string } => {
    const input = (raw ?? {}) as { transactionId?: unknown };
    const transactionId = String(input.transactionId ?? "").trim();
    if (transactionId.length === 0) {
      throw new Error("A transaction id is required.");
    }
    return { transactionId };
  })
  .handler(async ({ data }): Promise<ClaimStatus> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return {
        ok: false,
        phase: "failed",
        rawStatus: null,
        subStatus: null,
        transactionHash: null,
        errorMessage: "Your session has expired. Sign in again.",
        error: { message: "Your session has expired. Sign in again." },
      };
    }

    try {
      const client = dalpForCurrentRequest();
      const transaction = client.dapi.transaction as TransactionNamespace;
      const tx = await pollTransaction(transaction, data.transactionId);

      return {
        ok: true,
        phase: phaseFor(tx.status, tx.receipt?.status),
        rawStatus: tx.status ?? (tx.receipt ? "MINED" : null),
        subStatus: tx.subStatus ?? null,
        transactionHash: tx.transactionHash ?? null,
        errorMessage: tx.errorMessage ?? null,
      };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      return {
        ok: false,
        phase: "processing",
        rawStatus: null,
        subStatus: null,
        transactionHash: null,
        errorMessage: normalized.message,
        error: normalized,
      };
    }
  });
