/**
 * The response shapes these examples read.
 *
 * They are written by hand rather than imported from the SDK. The published
 * 3.1 line ships `dist/contract.d.ts` re-exporting `@dalp/api-contract/contract`,
 * a workspace package that is not on npm, so under `skipLibCheck` the client
 * type collapses to `any` and nothing about a call is checked. Every shape below
 * was read off the v2 contract carried inside the SDK bundle, and each one names
 * only the fields the flow actually uses.
 */

/** POST /users — the three ids to store on your own party record. */
export interface CreatedUser {
  readonly data: { readonly id: string; readonly wallet: string; readonly identity: string };
}

/** GET /users/me */
export interface CurrentUser {
  readonly data: { readonly wallet: string };
}

/** GET /system/identity-registration-statuses */
export interface RegistrationStatus {
  readonly data: { readonly status: string };
}

/** GET /system/identities/{identityAddress}/claim-events */
export interface ClaimEvents {
  readonly data: readonly {
    readonly eventName: string;
    readonly topic: string;
    readonly blockNumber: string;
  }[];
}

/** GET /directory/topic-schemes */
export interface TopicSchemes {
  readonly data: readonly { readonly topicId: string; readonly name: string }[];
}

/** GET /directory/trusted-issuers */
export interface TrustedIssuers {
  readonly data: readonly {
    readonly id: string;
    readonly claimTopics: readonly { readonly topicId: string; readonly name: string }[];
  }[];
}

/** GET /system/compliance-modules — the deployed module contracts. */
export interface SystemComplianceModules {
  readonly data: readonly {
    readonly typeId: string;
    readonly module: string;
    readonly name: string;
  }[];
}

/** GET /tokens/{tokenAddress}/compliance-modules — what is installed on one token. */
export interface TokenComplianceModules {
  readonly data: {
    readonly complianceModuleConfigs: readonly {
      readonly complianceModule: { readonly typeId: string };
      readonly isActive: boolean;
    }[];
  };
}

/** GET /transaction-requests/{transactionId} */
export interface TransactionStatus {
  readonly data: {
    readonly transactionId: string;
    readonly status: string;
    readonly blockNumber: string | null;
    readonly transactionHash: string | null;
    readonly result?: { readonly tokenAddress?: string };
  };
}

/** POST /tokens/{tokenAddress}/document-uploads */
export interface UploadTarget {
  readonly data: { readonly uploadUrl: string; readonly objectKey: string };
}

/** GET /tokens/{tokenAddress}/price */
export interface TokenPrice {
  readonly data: { readonly price: string; readonly currency: string; readonly source: string };
}

/** GET /tokens/{tokenAddress}/recipient-eligibility — registry membership, not a transfer verdict. */
export interface RecipientEligibility {
  readonly data: { readonly eligible: boolean; readonly address: string; readonly action: string };
}

/** GET /tokens/{tokenAddress}/holder-balances */
export interface HolderBalance {
  readonly data: {
    readonly holder: {
      readonly value: string;
      readonly frozen: string;
      readonly isFrozen: boolean;
    } | null;
  };
}

/** GET /tokens/{tokenAddress}/historical-balances/{holderAddress} */
export interface HistoricalBalance {
  readonly data: { readonly balance: string; readonly asOfBlockNumber: string };
}

/** GET /user-asset-balances — the balances of the calling account. */
export interface UserAssets {
  readonly data: readonly {
    readonly id: string;
    readonly value: string;
    readonly frozen: string;
    readonly available: string;
  }[];
}

/** GET /tokens/{tokenAddress}/transfer-simulate — DALP 3.2 and later. */
export interface TransferSimulation {
  readonly data: {
    readonly verdict: "will-clear" | "will-revert";
    readonly blockers: readonly {
      readonly code: string;
      readonly party: string;
      readonly reason: string;
      readonly remediationClass: string;
    }[];
  };
}
