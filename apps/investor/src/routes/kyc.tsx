import { createFileRoute, Link, type LinkProps, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppShell } from "~/components/app-shell";
import {
  EMPTY_KYC_VALUES,
  KycForm,
  type KycFormValues,
  type ResidencyStatus,
} from "~/components/kyc-form";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { StatusBadge } from "~/components/ui/status-badge";
// Server-only helpers — used inside `.handler()` bodies, extracted to a server
// chunk so they never reach the browser.
import {
  dalpForCurrentRequest,
  dalpForCurrentRequestWithIdempotency,
  getIncomingCookie,
} from "~/lib/dalp";
// Client-safe error helpers / types — read in the component too.
import { dalpToast, normalizeDalpError, type NormalizedDalpError } from "~/lib/dalp-errors";

// ===========================================================================
// dapi.* is untyped (resolves to `any`) — every response is annotated with an
// explicit local interface and cast at the boundary. Shapes are sourced from
// the REAL oRPC contract (verified against the issuer review app); the
// reference docs paraphrase several of these WRONG, so the wire names below
// are authoritative:
//   user.me                       → id, email, name, kycStatus
//   user.kyc.profile.read         → latestStatus, latestVersionId, approvedVersionId
//   user.kyc.version.read         → firstName, lastName, dob, country,
//                                   residencyStatus, nationalId + review metadata
//                                   (reviewNotes, rejectionReason, requiredFields)
//   user.kyc.versions.create      → { id }   (new draft version id)
//   user.kyc.version.update       → (draft fields PATCH)
//   user.kyc.version.submit       → (draft → submitted)
// ===========================================================================

type KycLatestStatus = "draft" | "submitted" | "approved" | "rejected" | "changes_requested";

interface UserMeResponse {
  data: {
    id: string;
    email?: string | null;
    name?: string | null;
    kycStatus?: string | null;
  } | null;
}

interface KycProfileResponse {
  data: {
    approvedVersionId: string | null;
    latestVersionId: string | null;
    latestStatus: KycLatestStatus | null;
  } | null;
}

/**
 * Full version row read back from `user.kyc.version.read`. The submission
 * fields are the REAL contract names (firstName, lastName, dob, country,
 * residencyStatus, nationalId); the review fields (`rejectionReason`,
 * `requiredFields`, `reviewNotes`) are written by the issuer's `reject` /
 * `requestUpdate` calls. All optional — a fresh draft has none of the review
 * fields.
 */
interface KycVersionResponse {
  data: {
    id: string;
    status?: KycLatestStatus | null;
    firstName?: string | null;
    lastName?: string | null;
    dob?: string | null;
    country?: string | null;
    residencyStatus?: ResidencyStatus | null;
    nationalId?: string | null;
    rejectionReason?: string | null;
    requiredFields?: string[] | null;
    reviewNotes?: string | null;
  } | null;
}

interface CreateVersionResponse {
  data: { id: string } | null;
}

/** The form-relevant subset of a version, ready to prefill the <KycForm>. */
interface KycVersionView {
  versionId: string;
  values: KycFormValues;
  /** Why the version was rejected (issuer's `reject` call). */
  rejectionReason: string | null;
  /** The issuer's free-text note (issuer's `requestUpdate` reason). */
  reviewNotes: string | null;
  /** The specific fields the issuer asked the investor to revisit. */
  requiredFields: FormFieldKey[];
}

interface KycOverview {
  userId: string;
  email: string | null;
  name: string | null;
  latestStatus: KycLatestStatus | null;
  latestVersion: KycVersionView | null;
}

type KycLoaderResult =
  | { ok: true; data: KycOverview }
  | { ok: false; authed: boolean; error: NormalizedDalpError };

/**
 * `/portfolio` is added by a later feature slice, so it isn't in the generated
 * route tree yet — the typed `Link` would reject it. We narrow it to the
 * router's own `to` type at the single render boundary, the same documented
 * forward-reference the header nav uses. Once the route exists this cast
 * becomes a no-op and TanStack type-checks the path for real.
 */
const PORTFOLIO_TO = "/portfolio" as LinkProps["to"];

// ---------------------------------------------------------------------------
// Field-name allow-list: the issuer's `requiredFields` are raw strings; narrow
// them to the form's keys so the highlight prop stays typed.
// ---------------------------------------------------------------------------
const FORM_FIELD_KEYS = [
  "firstName",
  "lastName",
  "dob",
  "country",
  "residencyStatus",
  "nationalId",
] as const;
type FormFieldKey = (typeof FORM_FIELD_KEYS)[number];

function isFormFieldKey(value: string): value is FormFieldKey {
  return (FORM_FIELD_KEYS as readonly string[]).includes(value);
}

function toFormValues(version: KycVersionResponse["data"]): KycFormValues {
  if (!version) {
    return EMPTY_KYC_VALUES;
  }
  return {
    firstName: version.firstName ?? "",
    lastName: version.lastName ?? "",
    dob: version.dob ?? "",
    country: version.country ?? "",
    residencyStatus: version.residencyStatus ?? "",
    nationalId: version.nationalId ?? "",
  };
}

// ===========================================================================
// Loader — read the user + their KYC profile + (when present) the latest
// version's fields. Runs against the session-scoped client built from the
// incoming Cookie header.
// ===========================================================================

const loadKycOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<KycLoaderResult> => {
    if (getIncomingCookie().length === 0) {
      return {
        ok: false,
        authed: false,
        error: { message: "You need to sign in to continue." },
      };
    }

    try {
      const client = dalpForCurrentRequest();

      const me = (await client.dapi.user.me({})) as UserMeResponse;
      if (!me.data) {
        return {
          ok: false,
          authed: false,
          error: { message: "Your session has expired. Sign in again." },
        };
      }

      let latestStatus: KycLatestStatus | null = null;
      let latestVersionId: string | null = null;
      try {
        const profile = (await client.dapi.user.kyc.profile.read({
          params: { userId: me.data.id },
        })) as KycProfileResponse;
        latestStatus = profile.data?.latestStatus ?? null;
        latestVersionId = profile.data?.latestVersionId ?? null;
      } catch {
        // No KYC profile yet (first run) — treat as "not started", not a failure.
        latestStatus = null;
        latestVersionId = null;
      }

      let latestVersion: KycVersionView | null = null;
      if (latestVersionId) {
        try {
          const version = (await client.dapi.user.kyc.version.read({
            params: { versionId: latestVersionId },
          })) as KycVersionResponse;
          if (version.data) {
            latestVersion = {
              versionId: version.data.id,
              values: toFormValues(version.data),
              rejectionReason: version.data.rejectionReason ?? null,
              reviewNotes: version.data.reviewNotes ?? null,
              requiredFields: (version.data.requiredFields ?? []).filter(isFormFieldKey),
            };
          }
        } catch {
          // Version unreadable (e.g. superseded) — fall back to status-only UI.
          latestVersion = null;
        }
      }

      return {
        ok: true,
        data: {
          userId: me.data.id,
          email: me.data.email ?? null,
          name: me.data.name ?? null,
          latestStatus,
          latestVersion,
        },
      };
    } catch (error) {
      const normalized = normalizeDalpError(error);
      return {
        ok: false,
        authed: normalized.status !== 401,
        error: normalized,
      };
    }
  },
);

// ===========================================================================
// Mutations
// ===========================================================================

type MutationResult = { ok: true; versionId: string } | { ok: false; error: NormalizedDalpError };

const RESIDENCY_VALUES: readonly ResidencyStatus[] = [
  "resident",
  "non_resident",
  "dual_resident",
  "unknown",
];

function isResidencyStatus(value: string): value is ResidencyStatus {
  return (RESIDENCY_VALUES as readonly string[]).includes(value);
}

/**
 * Build the REAL `version.update` / `versions.create` body from the form
 * values. The wire field names come straight from the oRPC contract:
 * firstName, lastName, dob (ISO date), country (ISO code), residencyStatus,
 * nationalId.
 */
function updateBody(values: KycFormValues): Record<string, unknown> {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    dob: values.dob,
    country: values.country,
    residencyStatus: values.residencyStatus,
    nationalId: values.nationalId,
  };
}

function asTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function validateFormInput(raw: unknown): KycFormValues {
  const input = (raw ?? {}) as Partial<Record<keyof KycFormValues, unknown>>;
  const str = asTrimmedString;
  const residency = str(input.residencyStatus);
  const values: KycFormValues = {
    firstName: str(input.firstName),
    lastName: str(input.lastName),
    dob: str(input.dob),
    country: str(input.country),
    residencyStatus: isResidencyStatus(residency) ? residency : "",
    nationalId: str(input.nationalId),
  };
  if (!values.firstName || !values.lastName) {
    throw new Error("Your legal first and last name are required.");
  }
  if (!values.dob) {
    throw new Error("Your date of birth is required.");
  }
  if (!values.country) {
    throw new Error("Your country of residence is required.");
  }
  if (!values.residencyStatus) {
    throw new Error("Your residency status is required.");
  }
  if (!values.nationalId) {
    throw new Error("Your national ID is required.");
  }
  return values;
}

/**
 * Friendlier copy for the KYC workflow error codes documented in
 * references/user-kyc.md, so async failures never surface as a raw crash.
 */
function friendlyKycError(error: NormalizedDalpError): NormalizedDalpError {
  switch (error.errorId) {
    case "KYC_INVALID_TRANSITION":
      return {
        ...error,
        message: "Your KYC status changed since this page loaded.",
        fix: "Refresh to see your current status, then try again.",
      };
    case "KYC_VALIDATION_FAILED":
      return {
        ...error,
        message: "Some required details are missing or invalid.",
        fix: error.fix ?? "Check the highlighted fields and resubmit.",
      };
    case "WALLET_VERIFICATION_FAILED":
      return {
        ...error,
        message: "We couldn't verify your wallet.",
        fix: "Confirm your wallet pincode or passkey, then submit again.",
      };
    default:
      return error;
  }
}

interface SubmitKycInput {
  /** Existing draft version id to reuse, when the investor is editing. */
  versionId: string | null;
  values: KycFormValues;
}

/**
 * Create-or-reuse a draft, save the fields, and submit it for review — the
 * documented `versions.create → version.update → version.submit` chain.
 *
 * Each idempotency-required step (`versions.create`, `version.submit`) gets its
 * OWN fresh `Idempotency-Key` via a per-mutation client, so a retried submit
 * never double-creates a version or double-submits.
 */
const submitKyc = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): SubmitKycInput => {
    const input = (raw ?? {}) as { versionId?: unknown; values?: unknown };
    const versionId =
      typeof input.versionId === "string" && input.versionId.length > 0 ? input.versionId : null;
    return { versionId, values: validateFormInput(input.values) };
  })
  .handler(async ({ data }): Promise<MutationResult> => {
    if (getIncomingCookie().length === 0) {
      return { ok: false, error: { message: "You need to sign in to continue." } };
    }

    try {
      // 1. Resolve the target version id — reuse the open draft, or create one.
      let versionId = data.versionId;
      if (!versionId) {
        const me = (await dalpForCurrentRequest().dapi.user.me({})) as UserMeResponse;
        if (!me.data) {
          return {
            ok: false,
            error: { message: "Your session has expired. Sign in again." },
          };
        }
        const createClient = dalpForCurrentRequestWithIdempotency(crypto.randomUUID());
        const created = (await createClient.dapi.user.kyc.versions.create({
          params: { userId: me.data.id },
          body: updateBody(data.values),
        })) as CreateVersionResponse;
        if (!created.data?.id) {
          return {
            ok: false,
            error: { message: "We couldn't start your KYC submission. Please try again." },
          };
        }
        versionId = created.data.id;
      }

      // 2. Save the latest field values onto the draft (PATCH, optional idem).
      await dalpForCurrentRequest().dapi.user.kyc.version.update({
        params: { versionId },
        body: updateBody(data.values),
      });

      // 3. Submit for review (draft → submitted). Fresh idempotency key.
      const submitClient = dalpForCurrentRequestWithIdempotency(crypto.randomUUID());
      await submitClient.dapi.user.kyc.version.submit({
        params: { versionId },
        body: {},
      });

      return { ok: true, versionId };
    } catch (error) {
      return { ok: false, error: friendlyKycError(normalizeDalpError(error)) };
    }
  });

interface StartFreshInput {
  values: KycFormValues;
}

/**
 * Start a brand-new draft from scratch (used after a rejection — a rejected
 * version is immutable, so the investor resubmits as a NEW version). Creates +
 * fills + submits, each idempotency-required step with its own key.
 */
const startFreshKyc = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): StartFreshInput => {
    const input = (raw ?? {}) as { values?: unknown };
    return { values: validateFormInput(input.values) };
  })
  .handler(async ({ data }): Promise<MutationResult> => {
    if (getIncomingCookie().length === 0) {
      return { ok: false, error: { message: "You need to sign in to continue." } };
    }

    try {
      const me = (await dalpForCurrentRequest().dapi.user.me({})) as UserMeResponse;
      if (!me.data) {
        return {
          ok: false,
          error: { message: "Your session has expired. Sign in again." },
        };
      }

      const createClient = dalpForCurrentRequestWithIdempotency(crypto.randomUUID());
      const created = (await createClient.dapi.user.kyc.versions.create({
        params: { userId: me.data.id },
        body: updateBody(data.values),
      })) as CreateVersionResponse;
      if (!created.data?.id) {
        return {
          ok: false,
          error: { message: "We couldn't start your KYC submission. Please try again." },
        };
      }
      const versionId = created.data.id;

      const submitClient = dalpForCurrentRequestWithIdempotency(crypto.randomUUID());
      await submitClient.dapi.user.kyc.version.submit({
        params: { versionId },
        body: {},
      });

      return { ok: true, versionId };
    } catch (error) {
      return { ok: false, error: friendlyKycError(normalizeDalpError(error)) };
    }
  });

export const Route = createFileRoute("/kyc")({
  loader: () => loadKycOverview(),
  component: KycPage,
  pendingComponent: KycPending,
});

// ===========================================================================
// Page
// ===========================================================================

function KycPage() {
  const result = Route.useLoaderData();

  if (!result.ok) {
    return <KycError authed={result.authed} error={result.error} />;
  }

  const { latestStatus, latestVersion, name, email } = result.data;

  return (
    <AppShell
      userName={name ?? email ?? undefined}
      kycStatus={latestStatus ?? undefined}
      currentPath="/kyc"
      title="Identity & KYC"
      description="Your verification status with the issuer. This is the gate to holding compliant assets."
    >
      <KycBody status={latestStatus} version={latestVersion} />
    </AppShell>
  );
}

interface KycBodyProps {
  status: KycLatestStatus | null;
  version: KycVersionView | null;
}

function KycBody({ status, version }: KycBodyProps) {
  switch (status) {
    case "approved":
      return <ApprovedState />;
    case "submitted":
      return <SubmittedState />;
    case "changes_requested":
      return <ChangesRequestedState version={version} />;
    case "rejected":
      return <RejectedState version={version} />;
    case "draft":
      return (
        <EditableState
          version={version}
          mode="edit"
          intro={{
            title: "Finish your KYC submission",
            body: "You started a draft but haven't submitted it yet. Review your details below and submit them for the issuer to verify.",
          }}
        />
      );
    default:
      return (
        <EditableState
          version={null}
          mode="create"
          intro={{
            title: "Verify your identity to get started",
            body: "Before you can hold a regulated asset, the issuer needs to verify who you are. It takes a few minutes — fill in your details below and submit them for review.",
          }}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Form states (create / edit drafts, changes-requested, rejected)
// ---------------------------------------------------------------------------

interface EditableStateProps {
  version: KycVersionView | null;
  /** "create" → start a new draft; "edit" → reuse the open draft. */
  mode: "create" | "edit" | "fresh";
  intro: { title: string; body: string };
  banner?: ReactNode;
}

function EditableState({ version, mode, intro, banner }: EditableStateProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(values: KycFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      const result =
        mode === "fresh"
          ? await startFreshKyc({ data: { values } })
          : await submitKyc({ data: { versionId: version?.versionId ?? null, values } });

      if (!result.ok) {
        setFormError([result.error.message, result.error.fix].filter(Boolean).join(" "));
        dalpToast(result.error);
        return;
      }
      setDone(true);
      // Re-run the loader so the page re-renders into the "submitted" state.
      await router.invalidate();
    } catch (error) {
      const normalized = normalizeDalpError(error);
      setFormError(normalized.message);
      dalpToast(error);
    } finally {
      setSubmitting(false);
    }
  }

  // While the loader re-runs after a successful submit, show the optimistic
  // "submitted" confirmation rather than a flash of the empty form.
  if (done) {
    return <SubmittedState />;
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-brand-50 ring-1 ring-brand-500/20">
          <ShieldCheck className="size-5 text-brand-700" aria-hidden="true" />
        </span>
        <CardTitle className="text-xl">{intro.title}</CardTitle>
        <CardDescription className="text-pretty text-sm text-neutral-600">
          {intro.body}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {banner}
        <KycForm
          defaultValues={version?.values}
          highlightFields={version?.requiredFields}
          submitting={submitting}
          formError={formError}
          onSubmit={(values) => void handleSubmit(values)}
        />
      </CardContent>
    </Card>
  );
}

function ChangesRequestedState({ version }: { version: KycVersionView | null }) {
  return (
    <EditableState
      version={version}
      mode="edit"
      intro={{
        title: "The issuer requested changes",
        body: "A reviewer asked you to revisit part of your submission. Update the highlighted details below and resubmit — everything else is preserved.",
      }}
      banner={
        version?.reviewNotes ? (
          <ReviewNote
            tone="warning"
            heading="What the issuer asked for"
            body={version.reviewNotes}
            fields={version.requiredFields}
          />
        ) : null
      }
    />
  );
}

function RejectedState({ version }: { version: KycVersionView | null }) {
  // A rejected version is immutable — the investor resubmits as a NEW version,
  // so we prefill the form from the rejected one but submit via `startFresh`.
  return (
    <EditableState
      version={version}
      mode="fresh"
      intro={{
        title: "Your KYC was not approved",
        body: "Your previous submission was rejected. Correct the details below and submit a fresh application — we've carried over what you entered to save you time.",
      }}
      banner={
        version?.rejectionReason ? (
          <ReviewNote tone="danger" heading="Why it was rejected" body={version.rejectionReason} />
        ) : null
      }
    />
  );
}

interface ReviewNoteProps {
  tone: "warning" | "danger";
  heading: string;
  body: string;
  fields?: string[];
}

function ReviewNote({ tone, heading, body, fields }: ReviewNoteProps) {
  const styles =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-lg border p-4 ${styles}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{heading}</p>
          <p className="text-pretty text-sm">{body}</p>
          {fields && fields.length > 0 ? (
            <p className="text-xs opacity-80">Fields to revisit: {fields.join(", ")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal / waiting states
// ---------------------------------------------------------------------------

function SubmittedState() {
  const router = useRouter();
  return (
    <Card className="max-w-2xl">
      <CardHeader className="gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-sky-50 ring-1 ring-sky-200">
          <Clock className="size-5 text-sky-700" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-xl">Your KYC is under review</CardTitle>
          <StatusBadge status="submitted" />
        </div>
        <CardDescription className="text-pretty text-sm text-neutral-600" aria-live="polite">
          We've sent your details to the issuer for review. You'll be able to hold compliant assets
          as soon as it's approved — there's nothing you need to do right now. We'll update this
          page the moment your status changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void router.invalidate()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Check for an update
        </Button>
      </CardContent>
    </Card>
  );
}

function ApprovedState() {
  return (
    <Card className="max-w-2xl">
      <CardHeader className="gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
          <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-xl">Your identity is verified</CardTitle>
          <StatusBadge status="approved" />
        </div>
        <CardDescription className="text-pretty text-sm text-neutral-600">
          Your KYC has been approved and your on-chain identity claim is in place. You can now hold
          and transfer compliant assets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="brand">
          <Link to={PORTFOLIO_TO}>
            Go to your portfolio
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading + error states
// ---------------------------------------------------------------------------

function KycPending() {
  return (
    <AppShell
      currentPath="/kyc"
      title="Identity & KYC"
      description="Your verification status with the issuer. This is the gate to holding compliant assets."
    >
      <Card className="max-w-3xl">
        <CardHeader className="gap-3">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    </AppShell>
  );
}

function KycError({ authed, error }: { authed: boolean; error: NormalizedDalpError }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
        <ShieldQuestion className="size-5 text-amber-700" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {authed ? "We couldn't load your identity" : "Please sign in"}
        </h1>
        <p className="text-pretty text-sm text-neutral-600" aria-live="polite">
          {error.message}
        </p>
        {error.fix ? <p className="text-pretty text-xs text-neutral-500">{error.fix}</p> : null}
      </div>
      <Button asChild variant="brand">
        <Link to={authed ? "/kyc" : "/signup"}>{authed ? "Try again" : "Go to sign in"}</Link>
      </Button>
    </main>
  );
}
