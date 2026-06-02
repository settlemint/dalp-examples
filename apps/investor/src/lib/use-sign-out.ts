import { useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { dalpForCurrentRequest, forwardSessionCookie, getIncomingCookie } from "~/lib/dalp";
import { dalpToast } from "~/lib/dalp-errors";

/**
 * Sign the current session out via Better Auth's documented `POST /sign-out`
 * route (reached through the typed `auth.$fetch` escape hatch — there is no
 * top-level `auth.signOut` on the surfaced API). The session-scoped client
 * carries the incoming session cookie; after sign-out we forward the cleared
 * Set-Cookie back to the browser so the session is dropped client-side too.
 */
const signOutServerFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean }> => {
    if (getIncomingCookie().length === 0) {
      return { ok: true };
    }
    try {
      const client = dalpForCurrentRequest();
      await client.auth.$fetch("/sign-out", { method: "POST" });
      forwardSessionCookie(client);
      return { ok: true };
    } catch {
      // Even if the server-side revoke fails, we still send the user to the
      // sign-in surface — a stale cookie is harmless and re-auth replaces it.
      return { ok: false };
    }
  },
);

/**
 * Hook for the header's "Sign out" control: tracks the in-flight state, calls
 * the sign-out server fn, and routes back to the landing/sign-in page.
 */
export function useSignOut(): { signOut: () => void; signingOut: boolean } {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  function signOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    void signOutServerFn()
      .catch((error) => {
        dalpToast(error);
      })
      .finally(() => {
        void navigate({ to: "/" });
        setSigningOut(false);
      });
  }

  return { signOut, signingOut };
}
