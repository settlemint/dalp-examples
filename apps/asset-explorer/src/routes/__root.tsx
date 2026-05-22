import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";
import { DalpProvider } from "@dalp-examples/dalp-client/react";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DALP Asset Explorer" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <DalpProvider url={import.meta.env.VITE_DALP_API_URL ?? ""} apiKey={import.meta.env.VITE_DALP_API_KEY}>
        <div className="min-h-screen">
          <header className="border-b border-brand-100 bg-brand-50/60 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link to="/" className="text-lg font-semibold text-brand-700">
                Asset Explorer
              </Link>
              <nav className="flex gap-4 text-sm">
                <Link to="/" className="hover:underline" activeProps={{ className: "font-semibold underline" }}>
                  Assets
                </Link>
              </nav>
            </div>
          </header>
          <Outlet />
        </div>
      </DalpProvider>
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
