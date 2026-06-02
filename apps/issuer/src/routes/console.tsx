import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { fetchCurrentIssuer } from "~/lib/session";

/**
 * Console layout + auth gate. `beforeLoad` runs for every `/console/*` route:
 * it resolves the signed-in issuer from the session cookie and redirects to
 * /signin when there is none, then puts `issuer` on the route context so child
 * routes (Overview, KYC review) can read it without re-fetching. The layout
 * itself is a pass-through — each child renders its own AppShell.
 */
export const Route = createFileRoute("/console")({
  beforeLoad: async () => {
    const current = await fetchCurrentIssuer();
    if (!current.authenticated) {
      throw redirect({ to: "/signin" });
    }
    return { issuer: current.issuer };
  },
  component: () => <Outlet />,
});
