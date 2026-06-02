import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Coins, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "~/components/app-shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export const Route = createFileRoute("/console/")({
  loader: ({ context }) => ({ issuer: context.issuer }),
  component: ConsolePage,
});

interface NextStep {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  /** When present, the card is a live link to this route. */
  to?: "/console/kyc" | "/console/tokens";
  cta?: string;
}

const NEXT_STEPS: NextStep[] = [
  {
    icon: ShieldCheck,
    title: "Review investor KYC",
    description:
      "Approve submitted profiles to issue an on-chain identity claim. Approval is what unblocks compliant transfers for that holder.",
    to: "/console/kyc",
    cta: "Open review queue",
  },
  {
    icon: Coins,
    title: "Design a token",
    description:
      "Configure an ERC-3643 / SMART asset — supply, decimals, and the compliance modules that gate every transfer.",
    to: "/console/tokens",
    cta: "Go to tokens",
  },
  {
    icon: Users,
    title: "Manage holders",
    description:
      "Look up holders by wallet, inspect their identity status, and act on compliance events as they arrive.",
  },
];

function ConsolePage() {
  const { issuer } = Route.useLoaderData();
  const greetingName = issuer.name?.trim() || issuer.email;

  return (
    <AppShell issuer={issuer}>
      <div className="space-y-8">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              Welcome back, {greetingName}
            </h2>
            <Badge variant="success">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Signed in
            </Badge>
          </div>
          <p className="max-w-2xl text-pretty text-sm text-neutral-600">
            This is your issuer console. KYC review and token design are both live — approve an
            investor's submission to issue their on-chain identity claim, then configure and manage
            your ERC-3643 assets. Holder management lands in an upcoming slice.
          </p>
        </section>

        <section
          aria-label="Next steps"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {NEXT_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title}>
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-md bg-brand-50 ring-1 ring-brand-500/20">
                    <Icon className="size-5 text-brand-700" aria-hidden="true" />
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {step.to ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={step.to}>
                        {step.cta ?? "Open"}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400">
                      Coming soon
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
