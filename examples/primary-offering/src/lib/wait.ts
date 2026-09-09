/**
 * The settlement barrier every write in these examples goes through.
 *
 * A v2 mutation answers either with its result or with a 202 handle
 * `{ transactionId, status, statusUrl }`. A handle is a receipt, not an
 * outcome: the write is done only when the transaction reaches COMPLETED.
 * `waitForTransaction` polls to a terminal state and throws on a terminal
 * failure; this wrapper additionally refuses anything that is not COMPLETED,
 * so a caller can never mistake PENDING_APPROVAL for success.
 */

import { waitForTransaction } from "@settlemint/dalp-sdk";
import type { DalpClient } from "@settlemint/dalp-sdk";

/** The async-accepted envelope a queued mutation returns. */
interface AsyncAccepted {
  readonly transactionId: string;
  readonly status: string;
  readonly statusUrl: string;
}

function asyncHandle(response: unknown): AsyncAccepted | undefined {
  if (typeof response !== "object" || response === null) {
    return undefined;
  }
  const candidate = response as Partial<AsyncAccepted>;
  return typeof candidate.transactionId === "string" ? (candidate as AsyncAccepted) : undefined;
}

/**
 * Follow one write to its terminal state and print it.
 *
 * Returns the transaction id for a queued write, or `undefined` for a write the
 * platform answered inline. Throws unless the transaction reached COMPLETED.
 */
export async function settle(
  dalp: DalpClient,
  response: unknown,
  label: string,
): Promise<string | undefined> {
  const handle = asyncHandle(response);
  if (handle === undefined) {
    console.log(`  ${label}: answered inline, no transaction handle`);
    return undefined;
  }
  const status = await waitForTransaction(dalp, handle.transactionId);
  console.log(`  ${label}: ${handle.transactionId} -> ${status.status}`);
  if (status.status !== "COMPLETED") {
    throw new Error(
      `${label} ended ${status.status}${status.subStatus === null ? "" : ` / ${status.subStatus}`}` +
        `${status.errorMessage === null ? "" : `: ${status.errorMessage}`}`,
    );
  }
  return handle.transactionId;
}
