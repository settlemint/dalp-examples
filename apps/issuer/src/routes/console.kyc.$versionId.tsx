import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  MailX,
  PencilLine,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "~/components/app-shell";
import { ApproveDialog, RejectDialog, RequestUpdateDialog } from "~/components/kyc-action-dialogs";
import { KycClaimTracker } from "~/components/kyc-claim-tracker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { StatusBadge } from "~/components/ui/status-badge";
import { formatDate, humanize, shortWallet } from "~/lib/format";
import {
  approveKycVersion,
  fetchKycReview,
  rejectKycVersion,
  requestKycUpdate,
  type KycReviewProfile,
  type KycReviewResult,
  type KycSubmitter,
} from "~/lib/kyc";
import { dalpToast } from "~/lib/dalp";

export const Route = createFileRoute("/console/kyc/$versionId")({
  // Auth is enforced by the parent /console layout's beforeLoad, which also
  // puts `issuer` on the context consumed here.
  loader: async ({ context, params }) => ({
    issuer: context.issuer,
    review: await fetchKycReview({ data: { versionId: params.versionId } }),
  }),
  component: KycReviewPage,
});

type ActiveDialog = "approve" | "reject" | "request" | null;

function KycReviewPage() {
  const { issuer, review } = Route.useLoaderData();
  const { versionId } = Route.useParams();
  const router = useRouter();

  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [busy, setBusy] = useState(false);
  const [claimTxId, setClaimTxId] = useState<string | null>(null);

  if (!review.ok) {
    return (
      <AppShell issuer={issuer}>
        <ReviewError review={review} />
      </AppShell>
    );
  }

  const { profile, submitter } = review;
  const investorName = displayName(profile, submitter);
  const decided = profile.status === "approved" || profile.status === "rejected";
  const reviewable = profile.canReview && !decided;

  async function onApprove(input: { pincode: string; reviewNotes: string }) {
    setBusy(true);
    try {
      const result = await approveKycVersion({
        data: { versionId, pincode: input.pincode, reviewNotes: input.reviewNotes },
      });
      if (!result.ok) {
        dalpToast(buildError(result.error));
        return;
      }
      setDialog(null);
      if (result.transactionId) {
        setClaimTxId(result.transactionId);
        toast.success("Approval submitted — issuing the on-chain claim.");
      } else {
        toast.success("Approval submitted.");
        await router.invalidate();
      }
    } catch (error) {
      dalpToast(error);
    } finally {
      setBusy(false);
    }
  }

  async function onReject(input: { pincode: string; rejectionReason: string }) {
    setBusy(true);
    try {
      const result = await rejectKycVersion({
        data: { versionId, pincode: input.pincode, rejectionReason: input.rejectionReason },
      });
      if (!result.ok) {
        dalpToast(buildError(result.error));
        return;
      }
      setDialog(null);
      toast.success("Submission rejected. The investor can resubmit.");
      await router.invalidate();
    } catch (error) {
      dalpToast(error);
    } finally {
      setBusy(false);
    }
  }

  async function onRequest(input: { pincode: string; reason: string; requiredFields: string[] }) {
    setBusy(true);
    try {
      const result = await requestKycUpdate({
        data: {
          versionId,
          pincode: input.pincode,
          reason: input.reason,
          requiredFields: input.requiredFields,
        },
      });
      if (!result.ok) {
        dalpToast(buildError(result.error));
        return;
      }
      setDialog(null);
      toast.success("Changes requested. A fresh draft is on its way to the investor.");
      await router.invalidate();
    } catch (error) {
      dalpToast(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell issuer={issuer}>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-neutral-500">
            <Link to="/console/kyc">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to queue
            </Link>
          </Button>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
                {investorName}
              </h2>
              <StatusBadge status={profile.status} />
              <Badge variant="neutral">v{profile.versionNumber}</Badge>
            </div>
            <p className="text-sm text-neutral-600">
              {submitter?.email ? (
                <span>{submitter.email}</span>
              ) : (
                <span className="text-neutral-400">No email on file</span>
              )}
              {profile.submittedAt ? (
                <span className="text-neutral-400">
                  {" "}
                  · Submitted {formatDate(profile.submittedAt)}
                </span>
              ) : null}
            </p>
          </div>

          {reviewable && !claimTxId ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog("request")}>
                <PencilLine className="size-4" aria-hidden="true" />
                Request changes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog("reject")}
                className="text-red-700 hover:bg-red-50"
              >
                <XCircle className="size-4" aria-hidden="true" />
                Reject
              </Button>
              <Button variant="brand" size="sm" onClick={() => setDialog("approve")}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Approve
              </Button>
            </div>
          ) : null}
        </header>

        {claimTxId ? (
          <KycClaimTracker
            transactionId={claimTxId}
            onCompleted={() => {
              void router.invalidate();
            }}
          />
        ) : (
          <DecisionBanner profile={profile} reviewable={reviewable} />
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ProfileCard profile={profile} className="lg:col-span-2" />
          <SubmitterCard submitter={submitter} profile={profile} />
        </div>
      </div>

      <ApproveDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        investorName={investorName}
        busy={busy}
        onConfirm={onApprove}
      />
      <RejectDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        investorName={investorName}
        busy={busy}
        onConfirm={onReject}
      />
      <RequestUpdateDialog
        open={dialog === "request"}
        onClose={() => setDialog(null)}
        investorName={investorName}
        busy={busy}
        onConfirm={onRequest}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */

function displayName(profile: KycReviewProfile, submitter: KycSubmitter | null): string {
  const fromVersion = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  if (fromVersion.length > 0) {
    return fromVersion;
  }
  if (submitter?.name && submitter.name.trim().length > 0) {
    return submitter.name;
  }
  return submitter?.email ?? "Unnamed investor";
}

/** Surface the compliance-block case (409) as a friendly state, not a crash. */
function buildError(error: { message: string; status?: number; errorId?: string }) {
  if (error.status === 409 || error.errorId === "TRANSFER_BLOCKED_BY_COMPLIANCE") {
    return {
      message: "This holder isn't eligible yet",
      why: "Compliance hasn't cleared this identity for the action.",
      fix: "Make sure KYC is approved and the on-chain claim has landed, then retry.",
    };
  }
  return error;
}

function DecisionBanner({
  profile,
  reviewable,
}: {
  profile: KycReviewProfile;
  reviewable: boolean;
}) {
  if (profile.status === "approved") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-emerald-900">Approved — claim issued</p>
          <p className="text-sm text-emerald-800">
            {profile.reviewedAt ? `Reviewed ${formatDate(profile.reviewedAt)}. ` : ""}
            This holder's on-chain identity carries the KYC_APPROVED claim, so compliant transfers
            are unblocked.
          </p>
          {profile.reviewNotes ? (
            <p className="mt-1 text-xs text-emerald-700">Notes: {profile.reviewNotes}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (profile.status === "rejected") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 p-4">
        <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-red-900">Rejected</p>
          {profile.rejectionReason ? (
            <p className="text-sm text-red-800">{profile.rejectionReason}</p>
          ) : null}
          <p className="mt-1 text-xs text-red-700">
            The investor can address the reason and resubmit a new version.
          </p>
        </div>
      </div>
    );
  }

  if (!reviewable) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-amber-900">Not actionable right now</p>
          <p className="text-sm text-amber-800">
            This version is in <span className="font-medium">{humanize(profile.status)}</span> and
            can't be reviewed from here yet. Refresh the queue for the latest state.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function ProfileCard({ profile, className }: { profile: KycReviewProfile; className?: string }) {
  const rows: { label: string; value: string }[] = [
    { label: "First name", value: profile.firstName ?? "—" },
    { label: "Last name", value: profile.lastName ?? "—" },
    { label: "Date of birth", value: formatDate(profile.dateOfBirth) },
    { label: "Country", value: profile.country ?? "—" },
    { label: "Residency status", value: humanize(profile.residencyStatus) },
    { label: "National ID", value: profile.nationalId ?? "—" },
  ];

  return (
    <Card className={className}>
      <CardHeader className="border-b border-neutral-100">
        <CardTitle>Submitted profile</CardTitle>
        <CardDescription>The KYC data this investor submitted for review.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="space-y-0.5">
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {row.label}
              </dt>
              <dd className="text-sm text-neutral-900">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex items-center gap-2 border-t border-neutral-100 pt-4 text-sm text-neutral-600">
          <FileText className="size-4 text-neutral-400" aria-hidden="true" />
          {profile.documentsCount > 0 ? (
            <span>
              {profile.documentsCount} supporting{" "}
              {profile.documentsCount === 1 ? "document" : "documents"} attached
            </span>
          ) : (
            <span className="text-neutral-500">No documents attached to this version</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SubmitterCard({
  submitter,
  profile,
}: {
  submitter: KycSubmitter | null;
  profile: KycReviewProfile;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-neutral-100">
        <CardTitle>Holder</CardTitle>
        <CardDescription>Account this submission belongs to.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-0.5">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">Wallet</div>
          {submitter?.wallet ? (
            <div className="flex items-center gap-1.5 font-mono text-sm text-neutral-900">
              <Wallet className="size-3.5 text-neutral-400" aria-hidden="true" />
              {shortWallet(submitter.wallet)}
            </div>
          ) : (
            <div className="text-sm text-neutral-400">No wallet on file</div>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">Email</div>
          {submitter?.email ? (
            <div className="text-sm text-neutral-900">{submitter.email}</div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-neutral-400">
              <MailX className="size-3.5" aria-hidden="true" />
              None
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Submitted
          </div>
          <div className="text-sm text-neutral-900">{formatDate(profile.submittedAt)}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewError({ review }: { review: Extract<KycReviewResult, { ok: false }> }) {
  const notFound = review.error.status === 404;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-neutral-500">
        <Link to="/console/kyc">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to queue
        </Link>
      </Button>
      <EmptyState
        icon={TriangleAlert}
        title={notFound ? "Submission not found" : "Couldn't load this submission"}
        description={
          notFound
            ? "It may have been withdrawn, superseded by a newer version, or belong to another organization."
            : review.error.message
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/console/kyc">Return to queue</Link>
          </Button>
        }
      />
    </div>
  );
}
