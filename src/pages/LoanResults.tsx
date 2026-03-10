import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowRight,
  Filter,
  Info,
  LayoutGrid,
  Medal,
  RefreshCcw,
  Table2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api/client";
import { formatLKR } from "@/lib/currency";
import { formatMlModelShortLabel } from "@/lib/ml-display";
import type { Bank, EvaluationResult, LoanApplication, TrackApplicationResponse } from "@/types/backend";
import { useToast } from "@/hooks/use-toast";

type RankedScheme = EvaluationResult["ranked_results"][number];
type IneligibleScheme = EvaluationResult["ineligible_results"][number];
type FilterableScheme = Pick<RankedScheme, "bankId" | "emi" | "approvalProbability" | "eligibilityScore"> & {
  rankingScore?: number;
};
type VisibleRecommendation = {
  scheme: RankedScheme | IneligibleScheme;
  outcome: "eligible" | "needs_review";
  label: string;
};

function formatPercent(value: unknown, digits = 1): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(digits)}%` : "-";
}

function formatScore(value: unknown, digits = 1): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "-";
}

function getBankInitials(value: unknown): string {
  const label = String(value ?? "").trim();
  if (!label) {
    return "BNK";
  }

  return label
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase() || "BNK";
}

function getPredictionSummary(scheme: RankedScheme | IneligibleScheme): string {
  if (!scheme.prediction) {
    return "Prediction details unavailable";
  }

  if (scheme.prediction.source === "ml_model") {
    return `${formatMlModelShortLabel(scheme.prediction.model_version)} | ${scheme.prediction.confidence.level} confidence`;
  }

  return "Rule-based fallback";
}

function getRankingScoreValue(scheme: RankedScheme | IneligibleScheme): number | null {
  const parsed = "rankingScore" in scheme ? Number(scheme.rankingScore) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRankingScore(scheme: RankedScheme | IneligibleScheme): string {
  const rankingScore = getRankingScoreValue(scheme);
  return rankingScore === null ? "-" : rankingScore.toFixed(2);
}

function getReasonHighlights(
  scheme: RankedScheme | IneligibleScheme,
  outcome: VisibleRecommendation["outcome"],
): string[] {
  if (outcome === "eligible") {
    return scheme.whyRecommended.length ? scheme.whyRecommended : scheme.reasons.slice(0, 3);
  }

  return scheme.reasons.length ? scheme.reasons : scheme.whyRecommended.slice(0, 3);
}

function filterAndSortSchemes<T extends FilterableScheme>(
  items: T[],
  options: {
    bankFilter: string;
    maxEmiFilter: number;
    minProbabilityFilter: number;
    sortBy: "score" | "probability" | "emi";
  },
): T[] {
  const filtered = items.filter((item) => {
    if (options.bankFilter !== "all" && item.bankId !== options.bankFilter) {
      return false;
    }
    if (options.maxEmiFilter > 0 && item.emi > options.maxEmiFilter) {
      return false;
    }
    if (options.minProbabilityFilter > 0 && item.approvalProbability < options.minProbabilityFilter) {
      return false;
    }

    return true;
  });

  if (options.sortBy === "probability") {
    filtered.sort((a, b) => b.approvalProbability - a.approvalProbability);
  } else if (options.sortBy === "emi") {
    filtered.sort((a, b) => a.emi - b.emi);
  } else {
    filtered.sort(
      (a, b) => (b.rankingScore ?? b.eligibilityScore) - (a.rankingScore ?? a.eligibilityScore),
    );
  }

  return filtered;
}

export default function LoanResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const applicationIdFromUrl = searchParams.get("applicationId") ?? "";
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
    staleTime: 30_000,
  });
  const applications = applicationsQuery.data ?? [];
  const fallbackApplicationId = applicationsQuery.data?.[0]?.id ?? "";
  const hasRequestedApplication = applications.some((application) => application.id === applicationIdFromUrl);
  const applicationId = applicationIdFromUrl
    ? (hasRequestedApplication ? applicationIdFromUrl : fallbackApplicationId)
    : fallbackApplicationId;

  useEffect(() => {
    if ((!applicationIdFromUrl || !hasRequestedApplication) && fallbackApplicationId) {
      const next = new URLSearchParams(searchParams);
      next.set("applicationId", fallbackApplicationId);
      setSearchParams(next, { replace: true });
    }
  }, [applicationIdFromUrl, fallbackApplicationId, hasRequestedApplication, searchParams, setSearchParams]);

  const [view, setView] = useState<"grid" | "table">("grid");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "probability" | "emi">("score");
  const [maxEmiFilter, setMaxEmiFilter] = useState(0);
  const [minProbabilityFilter, setMinProbabilityFilter] = useState(0);

  const banksQuery = useQuery({
    queryKey: ["banks"],
    queryFn: () => apiFetch<Bank[]>("/api/banks"),
    staleTime: 60_000,
  });

  const evaluationQuery = useQuery({
    queryKey: ["application-evaluation", applicationId],
    queryFn: () => apiFetch<EvaluationResult>(`/api/applications/${applicationId}/evaluation`),
    enabled: Boolean(applicationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const evaluateMutation = useMutation({
    mutationFn: () =>
      apiFetch<EvaluationResult>(`/api/applications/${applicationId}/evaluate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["application-evaluation", applicationId], data);
      toast({
        title: "Evaluation updated",
        description: "Recommendations were regenerated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Evaluation failed",
        description: error instanceof Error ? error.message : "Could not evaluate this application",
        variant: "destructive",
      });
    },
  });

  const trackMutation = useMutation({
    mutationFn: (productId: string) =>
      apiFetch<TrackApplicationResponse>(`/api/applications/${applicationId}/track`, {
        method: "POST",
        body: JSON.stringify({ productId }),
      }),
    onSuccess: (payload) => {
      toast({
        title: "Tracking started",
        description: `${payload.product.bank_name} - ${payload.product.name} is now tracked.`,
      });
      navigate(payload.redirect_to);
    },
    onError: (error) => {
      toast({
        title: "Failed to start tracking",
        description: error instanceof Error ? error.message : "Could not start tracker flow",
        variant: "destructive",
      });
    },
  });

  const rankedSchemes = useMemo(() => {
    return filterAndSortSchemes([...(evaluationQuery.data?.ranked_results ?? [])], {
      bankFilter,
      maxEmiFilter,
      minProbabilityFilter,
      sortBy,
    });
  }, [bankFilter, evaluationQuery.data?.ranked_results, maxEmiFilter, minProbabilityFilter, sortBy]);

  const ineligibleSchemes = useMemo(() => {
    return filterAndSortSchemes([...(evaluationQuery.data?.ineligible_results ?? [])], {
      bankFilter,
      maxEmiFilter,
      minProbabilityFilter,
      sortBy,
    });
  }, [bankFilter, evaluationQuery.data?.ineligible_results, maxEmiFilter, minProbabilityFilter, sortBy]);

  const hasStoredEvaluation = (evaluationQuery.data?.summary.total_products ?? 0) > 0;
  const totalEligibleCount = evaluationQuery.data?.ranked_results.length ?? 0;
  const totalIneligibleCount = evaluationQuery.data?.ineligible_results.length ?? 0;
  const hasEligibleResults = totalEligibleCount > 0;
  const hasIneligibleResults = totalIneligibleCount > 0;
  const hasActiveFilters = bankFilter !== "all" || maxEmiFilter > 0 || minProbabilityFilter > 0;
  const totalVisibleResults = rankedSchemes.length + ineligibleSchemes.length;
  const hasVisibleResults = totalVisibleResults > 0;
  const filtersHidAllResults = hasActiveFilters && !hasVisibleResults && (hasEligibleResults || hasIneligibleResults);
  const filtersHidEligibleResults = hasActiveFilters && hasEligibleResults && rankedSchemes.length === 0 && ineligibleSchemes.length > 0;
  const noEligibleRecommendations = hasStoredEvaluation && !hasEligibleResults && hasIneligibleResults;
  const visibleRecommendations = useMemo<VisibleRecommendation[]>(
    () => [
      ...rankedSchemes.map((scheme, index) => ({
        scheme,
        outcome: "eligible" as const,
        label: `#${index + 1}`,
      })),
      ...ineligibleSchemes.map((scheme, index) => ({
        scheme,
        outcome: "needs_review" as const,
        label: `Review ${index + 1}`,
      })),
    ],
    [ineligibleSchemes, rankedSchemes],
  );

  const resetFilters = () => {
    setBankFilter("all");
    setMaxEmiFilter(0);
    setMinProbabilityFilter(0);
    setSortBy("score");
  };

  if (applicationsQuery.isLoading && applications.length === 0) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Recommendations"
          subtitle="Compare lender options, apply simple filters, and track the best match."
        />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading your applications...</CardContent>
        </Card>
      </div>
    );
  }

  if (applicationsQuery.isError && applications.length === 0) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Recommendations"
          subtitle="Compare lender options, apply simple filters, and track the best match."
        />
        <EmptyState
          title="Could not load applications"
          description="Refresh the page and try again before running lender evaluation."
        />
      </div>
    );
  }

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Recommendations"
          subtitle="Choose an application and run evaluation to see lender matches."
        />
        <EmptyState
          title="No applications found"
          description="Create an application first to generate recommendations."
          action={<Button onClick={() => navigate("/apply")}>Create Application</Button>}
        />
      </div>
    );
  }

  if (evaluationQuery.isError) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Recommendations"
          subtitle="Compare lender options, apply simple filters, and track the best match."
          actions={(
            <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
              {evaluateMutation.isPending ? "Evaluating..." : "Run Evaluation"}
            </Button>
          )}
        />
        <EmptyState
          title="Could not load recommendations"
          description="Refresh the page or re-run evaluation for this application."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Loan Recommendations"
        subtitle="Compare lender options, apply simple filters, and track the best match."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Select
              value={applicationId}
              onValueChange={(value) => {
                const next = new URLSearchParams(searchParams);
                next.set("applicationId", value);
                setSearchParams(next);
              }}
            >
              <SelectTrigger className="min-w-[220px]">
                <SelectValue placeholder="Select application" />
              </SelectTrigger>
              <SelectContent>
                {(applicationsQuery.data ?? []).map((application) => (
                  <SelectItem key={application.id} value={application.id}>
                    {application.id.slice(0, 8)} - {application.purpose}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={evaluateMutation.isPending}
              onClick={() => evaluateMutation.mutate()}
            >
              <RefreshCcw className="h-4 w-4" />
              {evaluateMutation.isPending ? "Evaluating..." : "Re-run Evaluation"}
            </Button>
            <Button
              disabled={rankedSchemes.length === 0 || trackMutation.isPending}
              onClick={() => {
                const topProductId = rankedSchemes[0]?.productId;
                if (!topProductId) return;
                trackMutation.mutate(topProductId);
              }}
            >
              Track Top Match
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <Tabs value={view} onValueChange={(value) => setView(value as "grid" | "table")} className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Filter and Sort</p>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Reset Filters
                  </Button>
                ) : null}
                <TabsList className="h-9">
                  <TabsTrigger value="grid" className="h-7 gap-1.5 px-2.5">
                    <LayoutGrid className="h-4 w-4" />
                    Grid
                  </TabsTrigger>
                  <TabsTrigger value="table" className="h-7 gap-1.5 px-2.5">
                    <Table2 className="h-4 w-4" />
                    Table
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Max EMI (LKR)</Label>
                <Input value={maxEmiFilter || ""} onChange={(e) => setMaxEmiFilter(Number(e.target.value || 0))} type="number" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min Approval (%)</Label>
                <Input
                  value={minProbabilityFilter || ""}
                  onChange={(e) => setMinProbabilityFilter(Number(e.target.value || 0))}
                  type="number"
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bank</Label>
                <Select value={bankFilter} onValueChange={setBankFilter}>
                  <SelectTrigger><SelectValue placeholder="All banks" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Banks</SelectItem>
                    {(banksQuery.data ?? []).map((bank) => <SelectItem key={bank.id} value={bank.id}>{bank.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sort by</Label>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as "score" | "probability" | "emi")}>
                  <SelectTrigger><SelectValue placeholder="Best match score" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">Best match score</SelectItem>
                    <SelectItem value="probability">Approval probability</SelectItem>
                    <SelectItem value="emi">Lowest EMI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasStoredEvaluation ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="label-xs">Eligible Matches</p>
                <p className="mt-1 text-2xl font-semibold text-success">{totalEligibleCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Visible now: {rankedSchemes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="label-xs">Needs Review</p>
                <p className="mt-1 text-2xl font-semibold text-warning-foreground">{totalIneligibleCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Visible now: {ineligibleSchemes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="label-xs">Visible Results</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{totalVisibleResults}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasActiveFilters ? "Current filters are applied." : "Showing every evaluated lender."}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <TabsContent value="grid">
          {evaluationQuery.isLoading ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading lender recommendations...</CardContent></Card>
          ) : !hasStoredEvaluation ? (
            <EmptyState
              title="No evaluation results yet"
              description="Run evaluation for this application to generate lender recommendations."
              action={(
                <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
                  {evaluateMutation.isPending ? "Evaluating..." : "Run Evaluation"}
                </Button>
              )}
            />
          ) : !hasVisibleResults ? (
            <EmptyState
              title={filtersHidAllResults ? "No matches for current filters" : "No recommendations found"}
              description={filtersHidAllResults
                ? "Current filters hide all eligible and review-only lenders."
                : "Evaluation completed, but no lender results are available for this application."}
              action={(
                <div className="flex flex-wrap justify-center gap-2">
                  {hasActiveFilters ? <Button variant="outline" onClick={resetFilters}>Reset Filters</Button> : null}
                  <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
                    {evaluateMutation.isPending ? "Evaluating..." : "Re-run Evaluation"}
                  </Button>
                </div>
              )}
            />
          ) : (
            <div className="space-y-4">
              {noEligibleRecommendations ? (
                <Alert variant="warning">
                  <Info className="h-4 w-4" />
                  <AlertTitle>No lenders are currently eligible</AlertTitle>
                  <AlertDescription>
                    We evaluated available schemes, but this application did not meet current eligibility criteria.
                    Review the reasons below and update your profile or application details. Document availability can improve readiness and probability estimates, but it does not override core bank eligibility rules.
                  </AlertDescription>
                </Alert>
              ) : null}

              {filtersHidEligibleResults ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Eligible matches are hidden by your current filters</AlertTitle>
                  <AlertDescription>
                    You still have eligible lenders for this application, but the current filters only leave review-only options visible.
                  </AlertDescription>
                </Alert>
              ) : null}

              {rankedSchemes.length > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Eligible matches</p>
                    <p className="text-sm text-muted-foreground">
                      These lenders passed the current eligibility rules and are ranked by best fit.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
                    {rankedSchemes.map((scheme, i) => (
                      <Card
                        key={scheme.productId}
                        className={i === 0 ? "border-primary/25 shadow-lg" : undefined}
                      >
                        <CardHeader className="space-y-4 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                                {getBankInitials(scheme.bankName)}
                              </div>
                              <div>
                                <CardTitle>{scheme.bankName}</CardTitle>
                                <p className="text-xs text-muted-foreground">{scheme.productName}</p>
                              </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                              #{i + 1}
                            </div>
                          </div>
                          {i === 0 ? (
                            <div className="inline-flex w-fit items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                              <Medal className="h-3.5 w-3.5" />
                              Top Recommendation
                            </div>
                          ) : null}
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                              <p className="label-xs">Monthly EMI</p>
                              <p className="mt-1 text-xl font-semibold text-foreground">{formatLKR(scheme.emi)}</p>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-primary/5 p-3">
                              <p className="label-xs">Approval probability</p>
                              <p className="mt-1 text-xl font-semibold text-primary">{formatPercent(scheme.approvalProbability)}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{getPredictionSummary(scheme)}</p>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Ranking score</span>
                              <span className="font-semibold text-foreground">{formatRankingScore(scheme)}</span>
                            </div>
                            <Progress value={getRankingScoreValue(scheme) ?? 0} />
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="label-xs">Estimated rate</p>
                              <p className="mt-1 font-semibold">{scheme.estimatedRate}%</p>
                            </div>
                            <div>
                              <p className="label-xs">Eligibility</p>
                              <p className="mt-1 font-semibold">{formatScore(scheme.eligibilityScore)} / 100</p>
                            </div>
                            <div>
                              <p className="label-xs">Total interest</p>
                              <p className="mt-1 font-semibold text-muted-foreground">{formatLKR(scheme.totalInterest)}</p>
                            </div>
                            <div>
                              <p className="label-xs">Total payable</p>
                              <p className="mt-1 font-semibold">{formatLKR(scheme.totalPayable)}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <StatusBadge status={scheme.eligibilityPassed ? "valid" : "needs_review"} />
                            <p className="text-xs text-muted-foreground">
                              Document readiness {formatPercent(scheme.docCompleteness)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={trackMutation.isPending}
                              onClick={() => trackMutation.mutate(scheme.productId)}
                            >
                              {trackMutation.isPending ? "Starting..." : "Track This"}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}>Review Docs</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}

              {ineligibleSchemes.length > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Needs review</p>
                    <p className="text-sm text-muted-foreground">
                      These lenders were evaluated, but one or more policy rules blocked current eligibility.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
                    {ineligibleSchemes.map((scheme, i) => (
                      <Card key={scheme.productId} className="border-warning/25">
                        <CardHeader className="space-y-4 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning/10 text-sm font-semibold text-warning-foreground">
                                {getBankInitials(scheme.bankName)}
                              </div>
                              <div>
                                <CardTitle>{scheme.bankName}</CardTitle>
                                <p className="text-xs text-muted-foreground">{scheme.productName}</p>
                              </div>
                            </div>
                            <div className="rounded-lg border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                              Ineligible
                            </div>
                          </div>
                          <div className="inline-flex w-fit items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning-foreground">
                            Review Required #{i + 1}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                              <p className="label-xs">Monthly EMI</p>
                              <p className="mt-1 text-xl font-semibold text-foreground">{formatLKR(scheme.emi)}</p>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-warning/5 p-3">
                              <p className="label-xs">Approval probability</p>
                              <p className="mt-1 text-xl font-semibold text-warning-foreground">{formatPercent(scheme.approvalProbability)}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{getPredictionSummary(scheme)}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="label-xs">Estimated rate</p>
                              <p className="mt-1 font-semibold">{scheme.estimatedRate}%</p>
                            </div>
                            <div>
                              <p className="label-xs">Eligibility</p>
                              <p className="mt-1 font-semibold">{formatScore(scheme.eligibilityScore)} / 100</p>
                            </div>
                            <div>
                              <p className="label-xs">Total interest</p>
                              <p className="mt-1 font-semibold text-muted-foreground">{formatLKR(scheme.totalInterest)}</p>
                            </div>
                            <div>
                              <p className="label-xs">Total payable</p>
                              <p className="mt-1 font-semibold">{formatLKR(scheme.totalPayable)}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <StatusBadge status="needs_review" />
                            <p className="text-xs text-muted-foreground">
                              Document readiness {formatPercent(scheme.docCompleteness)}
                            </p>
                          </div>
                          <div className="space-y-2">
                            {getReasonHighlights(scheme, "needs_review").map((reason, idx) => (
                              <p key={`${scheme.productId}-${idx}`} className="text-xs text-muted-foreground">
                                {idx + 1}. {reason}
                              </p>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              variant="outline"
                              disabled={trackMutation.isPending}
                              onClick={() => trackMutation.mutate(scheme.productId)}
                            >
                              {trackMutation.isPending ? "Starting..." : "Track Anyway"}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}>Review Docs</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="table">
          {evaluationQuery.isLoading ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading lender recommendations...</CardContent></Card>
          ) : !hasStoredEvaluation ? (
            <EmptyState
              title="No evaluation results yet"
              description="Run evaluation for this application to generate lender recommendations."
              action={(
                <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
                  {evaluateMutation.isPending ? "Evaluating..." : "Run Evaluation"}
                </Button>
              )}
            />
          ) : !hasVisibleResults ? (
            <EmptyState
              title={filtersHidAllResults ? "No matches for current filters" : "No recommendations found"}
              description={filtersHidAllResults
                ? "Current filters hide all eligible and review-only lenders."
                : "Evaluation completed, but no lender results are available for this application."}
              action={hasActiveFilters ? <Button variant="outline" onClick={resetFilters}>Reset Filters</Button> : undefined}
            />
          ) : (
            <Card className="data-table-wrap">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Comparison Table</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Side-by-side view of all visible lender outcomes.</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Scheme</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>EMI</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Ranking Score</TableHead>
                      <TableHead>Eligibility</TableHead>
                      <TableHead>Doc Readiness</TableHead>
                      <TableHead>Total Payable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRecommendations.map(({ scheme, outcome, label }) => (
                      <TableRow key={`${outcome}-${scheme.productId}`}>
                        <TableCell className="font-semibold text-muted-foreground">{label}</TableCell>
                        <TableCell>
                          <StatusBadge status={outcome === "eligible" ? "valid" : "needs_review"} />
                        </TableCell>
                        <TableCell className="font-medium">{scheme.bankName}</TableCell>
                        <TableCell>{scheme.productName}</TableCell>
                        <TableCell>{scheme.estimatedRate}%</TableCell>
                        <TableCell>{formatLKR(scheme.emi)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{formatPercent(scheme.approvalProbability)}</p>
                            <p className="text-[11px] text-muted-foreground">{getPredictionSummary(scheme)}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatRankingScore(scheme)}</TableCell>
                        <TableCell>{formatScore(scheme.eligibilityScore)}</TableCell>
                        <TableCell>{formatPercent(scheme.docCompleteness)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatLKR(scheme.totalPayable)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {visibleRecommendations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {rankedSchemes.length > 0 && ineligibleSchemes.length > 0
                ? "Why each lender is shown"
                : rankedSchemes.length > 0
                  ? "Why these were recommended"
                  : "Why lenders were not eligible"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {rankedSchemes.length > 0 && ineligibleSchemes.length > 0
                ? "Expand each lender to view ranking strengths or the main eligibility blockers."
                : rankedSchemes.length > 0
                  ? "Expand each lender to view ranking factors and eligibility drivers."
                  : "Expand each lender to review the main eligibility gaps and underwriting blockers."}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <Accordion type="single" collapsible className="rounded-xl border border-border/70">
              {visibleRecommendations.map(({ scheme, outcome, label }) => (
                <AccordionItem key={`${outcome}-${scheme.productId}`} value={`scheme-${scheme.productId}`} className="px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-3 text-left">
                      <div className="rounded-md bg-muted/70 px-2 py-1 text-xs font-semibold text-muted-foreground">
                        {label}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{scheme.bankName} - {scheme.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {getRankingScoreValue(scheme) !== null
                            ? `Ranking score ${formatRankingScore(scheme)} | Eligibility score ${formatScore(scheme.eligibilityScore)} / 100`
                            : `Eligibility score ${formatScore(scheme.eligibilityScore)} / 100`}
                        </p>
                        <p className="text-xs text-muted-foreground">{getPredictionSummary(scheme)}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      {getReasonHighlights(scheme, outcome).map((reason, idx) => (
                        <div key={`${scheme.productId}-${idx}`} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                          <p className="label-xs">Reason {idx + 1}</p>
                          <p className="mt-1 text-sm text-foreground">{reason}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
