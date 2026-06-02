import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout boundary for the tokens section. The index (`/console/tokens`), the
 * deploy wizard (`/console/tokens/new`), and the bond dashboard
 * (`/console/tokens/$id`) are full-page routes that each render their own
 * AppShell, so this layout is a pure pass-through — it only provides the
 * nesting point for the child routes via <Outlet />. Auth is enforced by the
 * parent `/console` layout's beforeLoad.
 */
export const Route = createFileRoute("/console/tokens")({
  component: () => <Outlet />,
});
