import type { ReactNode } from "react";

export interface AuthLayoutProps {
  /** The form / content column (left on desktop). */
  children: ReactNode;
}

const HIGHLIGHTS: readonly string[] = [
  "ERC-3643 / SMART compliance with on-chain identity",
  "One platform, end to end — no five-vendor stitch-up",
  "Atomic DvP settlement, T+0",
];

/**
 * Two-column brand layout for the unauthenticated auth pages (signup, verify,
 * sign-in): form on the left, brand rail on the right. Mirrors the existing
 * signup.tsx composition so every auth screen reads as one product. The brand
 * rail is hidden below `lg` to keep the form full-width on mobile.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-12 lg:py-20">
        <div className="w-full max-w-md">{children}</div>
      </section>

      <aside className="hidden bg-brand-700 text-white lg:flex lg:items-center lg:justify-center lg:px-12">
        <div className="max-w-md space-y-6">
          <span className="inline-flex items-center gap-2">
            <span className="size-8 rounded-md bg-white/90" aria-hidden="true" />
            <span className="text-base font-semibold tracking-tight text-white">Acme Capital</span>
          </span>
          <div className="text-xs uppercase tracking-widest text-white/70">
            Compliance, built in
          </div>
          <h2 className="text-pretty text-4xl font-semibold leading-tight">
            Hold regulated assets the way regulated institutions do.
          </h2>
          <p className="text-pretty text-base text-white/90">
            One signup. KYC reviewed by the issuer. An on-chain identity claim. Then every transfer
            is checked against the asset&apos;s rule engine — automatically, every time.
          </p>
          <ul className="space-y-2 text-sm text-white/90">
            {HIGHLIGHTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 rounded-full bg-white/80" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
