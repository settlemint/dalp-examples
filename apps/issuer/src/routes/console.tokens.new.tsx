import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Coins,
  KeyRound,
  Layers,
  Rocket,
  ShieldCheck,
  Sliders,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "~/components/app-shell";
import { TokenTxTracker } from "~/components/token-tx-tracker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { dalpToast } from "~/lib/dalp";
import {
  deployToken,
  fetchWizardConfig,
  type AssetTypeOption,
  type ComplianceModuleOption,
  type ComplianceTemplateOption,
  type TokenType,
  type WizardConfig,
} from "~/lib/tokens";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/console/tokens/new")({
  loader: async ({ context }) => ({
    issuer: context.issuer,
    config: await fetchWizardConfig(),
  }),
  component: TokenWizardPage,
});

type StepKey = "type" | "params" | "compliance" | "review";

const STEPS: { key: StepKey; label: string; icon: typeof Coins }[] = [
  { key: "type", label: "Asset type", icon: Layers },
  { key: "params", label: "Parameters", icon: Sliders },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "review", label: "Review & deploy", icon: Rocket },
];

interface FormState {
  type: TokenType | null;
  name: string;
  symbol: string;
  decimals: string;
  countryCode: string;
  basePrice: string;
  priceCurrency: string;
  cap: string;
  modules: string[];
  pincode: string;
}

const INITIAL_FORM: FormState = {
  type: null,
  name: "",
  symbol: "",
  decimals: "18",
  countryCode: "840",
  basePrice: "",
  priceCurrency: "USD",
  cap: "",
  modules: [],
  pincode: "",
};

function TokenWizardPage() {
  const { issuer, config } = Route.useLoaderData();
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [deploying, setDeploying] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);

  const step = STEPS[stepIndex]?.key ?? "type";
  const selectedAsset = useMemo(
    () => config.assetTypes.find((a) => a.type === form.type) ?? null,
    [config.assetTypes, form.type],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function pickAssetType(asset: AssetTypeOption) {
    setForm((current) => ({
      ...current,
      type: asset.type,
      decimals: String(asset.defaultDecimals),
    }));
  }

  function toggleModule(typeId: string) {
    setForm((current) => ({
      ...current,
      modules: current.modules.includes(typeId)
        ? current.modules.filter((m) => m !== typeId)
        : [...current.modules, typeId],
    }));
  }

  function applyTemplate(template: ComplianceTemplateOption) {
    setForm((current) => {
      const merged = new Set([...current.modules, ...template.moduleTypeIds]);
      return { ...current, modules: Array.from(merged) };
    });
    toast.success(`Applied "${template.name}" — ${template.moduleTypeIds.length} modules added.`);
  }

  const typeValid = form.type !== null;
  const paramsValid =
    form.name.trim().length >= 2 &&
    form.symbol.trim().length >= 2 &&
    form.symbol.trim().length <= 12 &&
    /^\d{3}$/.test(form.countryCode.trim()) &&
    Number.isInteger(Number(form.decimals)) &&
    Number(form.decimals) >= 0 &&
    Number(form.decimals) <= 18;
  const canDeploy = typeValid && paramsValid && form.pincode.trim().length >= 4;

  function goNext() {
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  async function onDeploy() {
    if (!form.type || !canDeploy) {
      return;
    }
    setDeploying(true);
    try {
      const result = await deployToken({
        data: {
          type: form.type,
          name: form.name.trim(),
          symbol: form.symbol.trim(),
          decimals: Number(form.decimals),
          countryCode: form.countryCode.trim(),
          pincode: form.pincode.trim(),
          basePrice: form.basePrice.trim() || undefined,
          priceCurrency: form.priceCurrency.trim() || undefined,
          cap: form.cap.trim() || undefined,
          complianceModules: form.modules,
        },
      });

      if (!result.ok) {
        dalpToast(result.error);
        return;
      }

      setDeployedAddress(result.tokenAddress);
      if (result.transactionId) {
        setTxId(result.transactionId);
        toast.success("Deployment submitted — provisioning your token on-chain.");
      } else if (result.tokenAddress) {
        toast.success("Token deployed.");
        await navigate({ to: "/console/tokens/$id", params: { id: result.tokenAddress } });
      } else {
        toast.success("Deployment submitted.");
      }
    } catch (error) {
      dalpToast(error);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <AppShell issuer={issuer}>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-neutral-500">
            <Link to="/console/tokens">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to tokens
            </Link>
          </Button>
        </div>

        <header className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Deploy a token</h2>
          <p className="max-w-2xl text-pretty text-sm text-neutral-600">
            Configure an ERC-3643 / SMART asset and deploy it on-chain. The compliance modules you
            attach here gate every future transfer of this token.
          </p>
        </header>

        {config.notices.length > 0 ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800"
            role="status"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{config.notices.join(" ")}</span>
          </div>
        ) : null}

        {txId ? (
          <DeployTracker
            transactionId={txId}
            tokenAddress={deployedAddress}
            onOpen={() => {
              if (deployedAddress) {
                void navigate({ to: "/console/tokens/$id", params: { id: deployedAddress } });
              } else {
                void navigate({ to: "/console/tokens" });
              }
            }}
          />
        ) : (
          <>
            <Stepper stepIndex={stepIndex} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {step === "type" ? (
                  <AssetTypeStep
                    assetTypes={config.assetTypes}
                    selected={form.type}
                    onSelect={pickAssetType}
                  />
                ) : null}

                {step === "params" ? (
                  <ParamsStep form={form} update={update} asset={selectedAsset} />
                ) : null}

                {step === "compliance" ? (
                  <ComplianceStep
                    config={config}
                    selected={form.modules}
                    onToggle={toggleModule}
                    onApplyTemplate={applyTemplate}
                  />
                ) : null}

                {step === "review" ? (
                  <ReviewStep
                    form={form}
                    asset={selectedAsset}
                    modules={config.complianceModules}
                    onPincode={(value) => update("pincode", value)}
                  />
                ) : null}
              </div>

              <Summary form={form} asset={selectedAsset} modules={config.complianceModules} />
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0 || deploying}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>

              {step === "review" ? (
                <Button variant="brand" onClick={onDeploy} disabled={!canDeploy || deploying}>
                  {deploying ? (
                    <Spinner label="Deploying" />
                  ) : (
                    <Rocket className="size-4" aria-hidden="true" />
                  )}
                  {deploying ? "Deploying…" : "Deploy token"}
                </Button>
              ) : (
                <Button
                  variant="brand"
                  onClick={goNext}
                  disabled={(step === "type" && !typeValid) || (step === "params" && !paramsValid)}
                >
                  Continue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

function Stepper({ stepIndex }: { stepIndex: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Deploy progress">
      {STEPS.map((step, index) => {
        const done = index < stepIndex;
        const current = index === stepIndex;
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                current
                  ? "bg-brand-50 text-brand-700 ring-brand-500/30"
                  : done
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-white text-neutral-500 ring-neutral-200",
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Icon className="size-3.5" aria-hidden="true" />
              )}
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="hidden h-px w-6 bg-neutral-200 sm:block" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function AssetTypeStep({
  assetTypes,
  selected,
  onSelect,
}: {
  assetTypes: AssetTypeOption[];
  selected: TokenType | null;
  onSelect: (asset: AssetTypeOption) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <CardTitle>Choose an asset type</CardTitle>
        <CardDescription>
          Each type maps to a SMART factory with its own lifecycle. A bond is the default for
          fixed-income issuance.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2">
        {assetTypes.map((asset) => {
          const active = selected === asset.type;
          return (
            <button
              key={asset.type}
              type="button"
              onClick={() => onSelect(asset)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                active
                  ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/20"
                  : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-semibold text-neutral-900">{asset.name}</span>
                {active ? (
                  <CheckCircle2 className="size-4 text-brand-600" aria-hidden="true" />
                ) : null}
              </div>
              <span className="text-xs text-neutral-500">{asset.description}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ParamsStep({
  form,
  update,
  asset,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  asset: AssetTypeOption | null;
}) {
  const symbolValue = form.symbol.toUpperCase();
  const countryValid =
    form.countryCode.trim().length === 0 || /^\d{3}$/.test(form.countryCode.trim());

  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <CardTitle>{asset ? `${asset.name} parameters` : "Parameters"}</CardTitle>
        <CardDescription>The on-chain identity and economics of your token.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. Acme 2030 Senior Bond"
              autoComplete="off"
            />
          )}
        </Field>

        <Field label="Symbol" required hint="2–12 characters, uppercase.">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={symbolValue}
              onChange={(event) => update("symbol", event.target.value.toUpperCase())}
              placeholder="ACME30"
              maxLength={12}
              className="font-mono uppercase"
              autoComplete="off"
            />
          )}
        </Field>

        <Field label="Decimals" required hint="Smallest divisible unit (0–18).">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.decimals}
              onChange={(event) => update("decimals", event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="18"
            />
          )}
        </Field>

        <Field
          label="Country code"
          required
          error={countryValid ? undefined : "Use the ISO 3166-1 numeric code (3 digits)."}
          hint={countryValid ? "ISO 3166-1 numeric — 840 = US, 276 = DE." : undefined}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.countryCode}
              onChange={(event) =>
                update("countryCode", event.target.value.replace(/[^\d]/g, "").slice(0, 3))
              }
              inputMode="numeric"
              placeholder="840"
            />
          )}
        </Field>

        <Field label="Supply cap" hint="Optional. Max total supply, in whole tokens.">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.cap}
              onChange={(event) => update("cap", event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="No cap"
            />
          )}
        </Field>

        <Field label="Base price" hint="Optional. Initial unit price.">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.basePrice}
              onChange={(event) => update("basePrice", event.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="1.00"
            />
          )}
        </Field>

        <Field label="Price currency" hint="Optional. 3-letter ISO code.">
          {(controlProps) => (
            <Input
              {...controlProps}
              value={form.priceCurrency}
              onChange={(event) =>
                update("priceCurrency", event.target.value.toUpperCase().slice(0, 3))
              }
              placeholder="USD"
              className="uppercase"
            />
          )}
        </Field>
      </CardContent>
    </Card>
  );
}

function ComplianceStep({
  config,
  selected,
  onToggle,
  onApplyTemplate,
}: {
  config: WizardConfig;
  selected: string[];
  onToggle: (typeId: string) => void;
  onApplyTemplate: (template: ComplianceTemplateOption) => void;
}) {
  return (
    <div className="space-y-6">
      {config.complianceTemplates.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-neutral-100">
            <CardTitle>Start from a template</CardTitle>
            <CardDescription>
              Pre-built compliance bundles from your platform settings. Applying one selects its
              modules — you can fine-tune below.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-5">
            {config.complianceTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onApplyTemplate(template)}
                className="flex flex-col items-start gap-0.5 rounded-lg border border-neutral-200 px-3 py-2 text-left transition-colors hover:border-brand-500 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className="text-sm font-medium text-neutral-900">{template.name}</span>
                <span className="text-xs text-neutral-500">
                  {template.moduleTypeIds.length}{" "}
                  {template.moduleTypeIds.length === 1 ? "module" : "modules"}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b border-neutral-100">
          <CardTitle>Compliance modules</CardTitle>
          <CardDescription>
            Each module is a rule the engine enforces on every transfer. Leave all unchecked for an
            unrestricted token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-5">
          {config.complianceModules.map((module) => {
            const checked = selected.includes(module.typeId);
            return (
              <label
                key={module.typeId}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  checked
                    ? "border-brand-500 bg-brand-50/50"
                    : "border-neutral-200 hover:bg-neutral-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(module.typeId)}
                  className="mt-0.5 size-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900">{module.name}</span>
                  <span className="block text-xs text-neutral-500">{module.description}</span>
                </span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      {config.claimTopics.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-neutral-100">
            <CardTitle>Identity claim topics</CardTitle>
            <CardDescription>
              Claims a holder's on-chain identity can carry. Identity-based modules check these when
              clearing a transfer.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-5">
            {config.claimTopics.map((topic) => (
              <Badge key={topic.id} variant="neutral">
                {topic.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReviewStep({
  form,
  asset,
  modules,
  onPincode,
}: {
  form: FormState;
  asset: AssetTypeOption | null;
  modules: ComplianceModuleOption[];
  onPincode: (value: string) => void;
}) {
  const selectedModules = modules.filter((m) => form.modules.includes(m.typeId));

  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <CardTitle>Review & deploy</CardTitle>
        <CardDescription>
          Confirm the configuration, then authorize the deployment with your wallet verification
          code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <ReviewRow label="Asset type" value={asset?.name ?? "—"} />
          <ReviewRow label="Name" value={form.name || "—"} />
          <ReviewRow label="Symbol" value={form.symbol || "—"} mono />
          <ReviewRow label="Decimals" value={form.decimals || "—"} />
          <ReviewRow label="Country code" value={form.countryCode || "—"} />
          <ReviewRow label="Supply cap" value={form.cap || "No cap"} />
          {form.basePrice ? (
            <ReviewRow
              label="Base price"
              value={`${form.basePrice} ${form.priceCurrency || ""}`.trim()}
            />
          ) : null}
        </dl>

        <div className="space-y-1.5">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Compliance modules
          </div>
          {selectedModules.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedModules.map((module) => (
                <Badge key={module.typeId} variant="brand">
                  {module.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              None — this token will not restrict transfers by compliance.
            </p>
          )}
        </div>

        <div className="border-t border-neutral-100 pt-4">
          <Field
            label="Wallet verification code"
            required
            hint="The pincode that authorizes this on-chain deployment."
          >
            {(controlProps) => (
              <div className="relative max-w-xs">
                <KeyRound
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden="true"
                />
                <Input
                  {...controlProps}
                  value={form.pincode}
                  onChange={(event) => onPincode(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  className="pl-8 tracking-[0.3em]"
                />
              </div>
            )}
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className={cn("text-sm text-neutral-900", mono ? "font-mono" : undefined)}>{value}</dd>
    </div>
  );
}

function Summary({
  form,
  asset,
  modules,
}: {
  form: FormState;
  asset: AssetTypeOption | null;
  modules: ComplianceModuleOption[];
}) {
  const selectedCount = modules.filter((m) => form.modules.includes(m.typeId)).length;
  return (
    <Card className="h-fit lg:sticky lg:top-6">
      <CardHeader className="border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-brand-700" aria-hidden="true" />
          <CardTitle>Summary</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-5 text-sm">
        <SummaryLine label="Type" value={asset?.name ?? "Not chosen"} />
        <SummaryLine label="Name" value={form.name || "—"} />
        <SummaryLine label="Symbol" value={form.symbol || "—"} mono />
        <SummaryLine label="Decimals" value={form.decimals || "—"} />
        <SummaryLine
          label="Compliance"
          value={
            selectedCount > 0
              ? `${selectedCount} ${selectedCount === 1 ? "module" : "modules"}`
              : "Unrestricted"
          }
        />
      </CardContent>
    </Card>
  );
}

function SummaryLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className={cn("truncate font-medium text-neutral-900", mono ? "font-mono" : undefined)}>
        {value}
      </span>
    </div>
  );
}

function DeployTracker({
  transactionId,
  tokenAddress,
  onOpen,
}: {
  transactionId: string;
  tokenAddress: string | null;
  onOpen: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-4">
      <TokenTxTracker
        transactionId={transactionId}
        title="Deploying your token…"
        completedTitle="Token deployed"
        steps={[
          {
            phase: "queued",
            label: "Deployment queued",
            description: "Request accepted by the platform.",
          },
          {
            phase: "processing",
            label: "Provisioning on-chain",
            description: "Deploying the token, identity registry binding, and compliance modules.",
          },
          {
            phase: "completed",
            label: "Live on-chain",
            description: "Your token is deployed and ready to mint.",
          },
        ]}
        onCompleted={() => setDone(true)}
      />
      {done ? (
        <Button variant="brand" onClick={onOpen}>
          {tokenAddress ? "Open dashboard" : "Back to tokens"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
