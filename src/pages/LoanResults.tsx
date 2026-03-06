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
import type { Bank, EvaluationResult, LoanApplication, TrackApplicationResponse } from "@/types/backend";
import { useToast } from "@/hooks/use-toast";

type RankedScheme = EvaluationResult["ranked_results"][number];
type IneligibleScheme = EvaluationResult["ineligible_results"][number];
type FilterableScheme = Pick<RankedScheme, "bankId" | "emi" | "approvalProbability" | "eligibilityScore"> & {
  rankingScore?: number;
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
  const fallbackApplicationId = applicationsQuery.data?.[0]?.id ?? "";
  const hasRequestedApplication = (applicationsQuery.data ?? []).some((application) => application.id === applicationIdFromUrl);
  const applicationId = hasRequestedApplication ? applicationIdFromUrl : (applicationIdFromUrl || fallbackApplicationId);

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
  const hasEligibleResults = (evaluationQuery.data?.ranked_results.length ?? 0) > 0;
  const hasIneligibleResults = (evaluationQuery.data?.ineligible_results.length ?? 0) > 0;
  const hasActiveFilters = bankFilter !== "all" || maxEmiFilter > 0 || minProbabilityFilter > 0;
  const totalVisibleResults = rankedSchemes.length + ineligibleSchemes.length;
  const filtersHidEligibleResults = hasActiveFilters && hasEligibleResults && rankedSchemes.length === 0;
  const noEligibleRecommendations = hasStoredEvaluation && !hasEligibleResults && hasIneligibleResults;

  const resetFilters = () => {
    setBankFilter("all");
    setMaxEmiFilter(0);
    setMinProbabilityFilter(0);
    setSortBy("score");
  };

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
                <p className="mt-1 text-2xl font-semibold text-success">{rankedSchemes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="label-xs">Needs Review</p>
                <p className="mt-1 text-2xl font-semibold text-warning-foreground">{ineligibleSchemes.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="label-xs">Visible Results</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{totalVisibleResults}</p>
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
          ) : filtersHidEligibleResults ? (
            <EmptyState
              title="No matches for current filters"
              description="Eligible recommendations exist, but your current filters hide them."
              action={(
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={resetFilters}>Reset Filters</Button>
                  <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
                    {evaluateMutation.isPending ? "Evaluating..." : "Re-run Evaluation"}
                  </Button>
                </div>
              )}
            />
          ) : noEligibleRecommendations ? (
            <div className="space-y-4">
              <Alert variant="warning">
                <Info className="h-4 w-4" />
                <AlertTitle>No lenders are currently eligible</AlertTitle>
                <AlertDescription>
                  We evaluated available schemes, but this application did not meet current eligibility criteria.
                  Review the reasons below, update your profile/application details, or upload documents and re-run evaluation.
                </AlertDescription>
              </Alert>

              {ineligibleSchemes.length === 0 ? (
                <EmptyState
                  title="No visible lenders after filters"
                  description="Evaluation found only ineligible lenders, but your current filters hide them."
                  action={<Button variant="outline" onClick={resetFilters}>Reset Filters</Button>}
                />
              ) : (
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
                            Document completeness {formatPercent(scheme.docCompleteness)}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {(scheme.reasons.length ? scheme.reasons : scheme.whyRecommended).slice(0, 3).map((reason, idx) => (
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
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}>Upload Docs</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : rankedSchemes.length === 0 ? (
            <EmptyState
              title="No recommendations found"
              description="Run evaluation for this application or adjust your filters."
              action={(
                <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
                  {evaluateMutation.isPending ? "Evaluating..." : "Run Evaluation"}
                </Button>
              )}
            />
          ) : (
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
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Ranking score</span>
                        <span className="font-semibold text-foreground">{formatScore(scheme.rankingScore, 2)}</span>
                      </div>
                      <Progress value={scheme.approvalProbability} />
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
                        Document completeness {formatPercent(scheme.docCompleteness)}
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
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}>Upload Docs</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="table">
          <Card className="data-table-wrap">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Comparison Table</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Side-by-side view of ranked recommendations.</p>
              </div>

            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>EMI</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Eligibility</TableHead>
                    <TableHead>Total Payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedSchemes.map((scheme, i) => (
                    <TableRow key={scheme.productId}>
                      <TableCell className="font-semibold text-muted-foreground">#{i + 1}</TableCell>
                      <TableCell className="font-medium">{scheme.bankName}</TableCell>
                      <TableCell>{scheme.productName}</TableCell>
                      <TableCell>{scheme.estimatedRate}%</TableCell>
                      <TableCell>{formatLKR(scheme.emi)}</TableCell>
                      <TableCell>
                        <StatusBadge status={scheme.approvalProbability >= 80 ? "approved" : "under_review"} />
                      </TableCell>
                      <TableCell>{formatScore(scheme.eligibilityScore)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatLKR(scheme.totalPayable)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(rankedSchemes.length > 0 || (noEligibleRecommendations && ineligibleSchemes.length > 0)) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {rankedSchemes.length > 0 ? "Why these were recommended" : "Why lenders were not eligible"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {rankedSchemes.length > 0
                ? "Expand each lender to view ranking factors and eligibility drivers."
                : "Expand each lender to review the main eligibility gaps and underwriting blockers."}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <Accordion type="single" collapsible className="rounded-xl border border-border/70">
              {(rankedSchemes.length > 0 ? rankedSchemes : ineligibleSchemes).map((scheme, i) => (
                <AccordionItem key={scheme.productId} value={`scheme-${scheme.productId}`} className="px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-3 text-left">
                      <div className="rounded-md bg-muted/70 px-2 py-1 text-xs font-semibold text-muted-foreground">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{scheme.bankName} - {scheme.productName}</p>
                        <p className="text-xs text-muted-foreground">Eligibility score {formatScore(scheme.eligibilityScore)} / 100</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      {(rankedSchemes.length > 0
                        ? (scheme.whyRecommended.length ? scheme.whyRecommended : scheme.reasons.slice(0, 3))
                        : (scheme.reasons.length ? scheme.reasons : scheme.whyRecommended.slice(0, 3))
                      ).map((reason, idx) => (
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
