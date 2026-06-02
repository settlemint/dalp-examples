import { createServerFn } from "@tanstack/react-start";
import { dalpForCurrentRequest, getIncomingCookie } from "~/lib/dalp.server";
import type { IssuerSession } from "~/components/app-shell";

/**
 * Explicit shape for the slice of `dapi.user.me` we consume. `dapi.*` resolves
 * to `any` (the oRPC contract isn't type-resolvable + skipLibCheck), so we
 * annotate the boundary here instead of letting `any` leak into the app.
 * Field names are sourced from references/user-kyc.md (`user.me` recipe).
 */
interface UserMeResponse {
  data: {
    id: string;
    email: string;
    name?: string | null;
    participantId?: string | null;
    kycStatus?: string | null;
  } | null;
}

export type CurrentIssuer =
  | { authenticated: true; issuer: IssuerSession }
  | { authenticated: false };

/**
 * Route-guard server fn: reads the signed-in issuer from the incoming session
 * cookie via `dapi.user.me`. Returns `{ authenticated: false }` when there is
 * no cookie or the call rejects (e.g. UNAUTHORIZED) so routes can redirect to
 * /signin rather than crashing. Never throws.
 */
export const fetchCurrentIssuer = createServerFn({ method: "GET" }).handler(
  async (): Promise<CurrentIssuer> => {
    const cookie = getIncomingCookie();
    if (cookie.length === 0) {
      return { authenticated: false };
    }

    try {
      const client = dalpForCurrentRequest();
      const me = (await client.dapi.user.me({})) as UserMeResponse;
      if (!me.data) {
        return { authenticated: false };
      }
      return {
        authenticated: true,
        issuer: {
          id: me.data.id,
          email: me.data.email,
          name: me.data.name ?? null,
        },
      };
    } catch {
      // 401 / expired session / unreachable backend → treat as signed out.
      return { authenticated: false };
    }
  },
);
