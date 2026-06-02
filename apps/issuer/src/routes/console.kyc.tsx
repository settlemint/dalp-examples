import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout boundary for the KYC section. The queue (`/console/kyc`) and the
 * review detail (`/console/kyc/$versionId`) are full-page routes that each
 * render their own AppShell, so this layout is a pure pass-through — it only
 * provides the nesting point for the child routes via <Outlet />.
 */
export const Route = createFileRoute("/console/kyc")({
  component: () => <Outlet />,
});
