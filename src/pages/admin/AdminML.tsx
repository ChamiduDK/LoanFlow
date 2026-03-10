import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, CheckCircle2, Cpu, History, Play, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import RenderErrorBoundary from "@/components/error/RenderErrorBoundary";
import {
  resolveMlModelCatalogEntry,
  type MlModelCatalogEntry,
  type MlStrategyRoleKey,
} from "@/data/mlModelCatalog";
import { apiFetch } from "@/lib/api/client";
import { formatMlModelShortLabel, formatMlModelVersionLabel } from "@/lib/ml-display";
import { cn } from "@/lib/utils";
import type { MlEvaluationMetrics, MlModel, MlTrainingReadiness } from "@/types/ml";

const metricDefs: Array<{ key: keyof MlEvaluationMetrics; label: string; note: string }> = [
  { key: "accuracy", label: "Accuracy", note: "Overall correctness" },
  { key: "precision", label: "Precision", note: "How clean positive predictions are" },
  { key: "recall", label: "Recall", note: "How many true approvals are captured" },
  { key: "f1", label: "F1", note: "Balance between precision and recall" },
  { key: "roc_auc", label: "ROC-AUC", note: "Class separation quality" },
  { key: "pr_auc", label: "PR-AUC", note: "Positive-class reliability" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-LK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function toneClass(value: number): string {
  if (value >= 0.8) return "text-success";
  if (value >= 0.6) return "text-warning";
  return "text-destructive";
}

function insight(label: string, value: number): string {
  if (value >= 0.85) return `${label} is strong and production-friendly.`;
  if (value >= 0.7) return `${label} is acceptable but can be improved.`;
  return `${label} is weak and needs attention.`;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getModelMetrics(model: MlModel | null | undefined): MlEvaluationMetrics {
  const metrics = model?.metrics_json as Partial<MlEvaluationMetrics> | undefined;
  const support = metrics?.support as Partial<MlEvaluationMetrics["support"]> | undefined;

  return {
    accuracy: toFiniteNumber(metrics?.accuracy),
    precision: toFiniteNumber(metrics?.precision),
    recall: toFiniteNumber(metrics?.recall),
    f1: toFiniteNumber(metrics?.f1),
    roc_auc: toFiniteNumber(metrics?.roc_auc),
    pr_auc: toFiniteNumber(metrics?.pr_auc),
    threshold: toFiniteNumber(metrics?.threshold, 0.5),
    support: {
      total: toFiniteNumber(support?.total),
      positive: toFiniteNumber(support?.positive),
      negative: toFiniteNumber(support?.negative),
    },
  };
}

function getTrainingMeta(model: MlModel | null | undefined): MlModel["training_meta_json"] {
  const meta = (model?.training_meta_json ?? {}) as Partial<MlModel["training_meta_json"]>;

  return {
    epochs_requested: toFiniteNumber(meta.epochs_requested),
    epochs_completed: toFiniteNumber(meta.epochs_completed),
    batch_size: toFiniteNumber(meta.batch_size),
    validation_split: toFiniteNumber(meta.validation_split),
    input_size: toFiniteNumber(meta.input_size),
    strategy_family: typeof meta.strategy_family === "string" ? meta.strategy_family : undefined,
    strategy_role: typeof meta.strategy_role === "string" ? meta.strategy_role : undefined,
    strategy_summary: typeof meta.strategy_summary === "string" ? meta.strategy_summary : undefined,
    strategy_positioning: typeof meta.strategy_positioning === "string" ? meta.strategy_positioning : undefined,
    dataset_mode: meta.dataset_mode,
    synthetic_bootstrap_enabled: meta.synthetic_bootstrap_enabled,
    consented_real_outcome_count: toFiniteNumber(meta.consented_real_outcome_count),
    usable_training_sample_count: toFiniteNumber(meta.usable_training_sample_count),
    usable_real_sample_count: toFiniteNumber(meta.usable_real_sample_count),
    usable_synthetic_sample_count: toFiniteNumber(meta.usable_synthetic_sample_count),
    usable_approved_sample_count: toFiniteNumber(meta.usable_approved_sample_count),
    usable_rejected_sample_count: toFiniteNumber(meta.usable_rejected_sample_count),
  };
}

function roleToneClass(roleKey: MlStrategyRoleKey): string {
  switch (roleKey) {
    case "primary_candidate":
      return "border-primary/20 bg-primary/10 text-primary";
    case "baseline_fallback":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700";
    case "categorical_specialist":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700";
    case "research_comparator":
    default:
      return "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700";
  }
}

function implementationToneClass(entry: MlModelCatalogEntry): string {
  return entry.implementationStatus === "implemented"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
    : "border-border/70 bg-muted/20 text-muted-foreground";
}

function AccuracyIndicator({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", value >= 0.8 ? "bg-success" : value >= 0.6 ? "bg-warning" : "bg-destructive")}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs font-medium">{pct(value)}</span>
    </div>
  );
}

export default function AdminML() {
  const queryClient = useQueryClient();
  const [isTraining, setIsTraining] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["ml-models"],
    queryFn: () => apiFetch<MlModel[]>("/api/ml/models"),
  });

  const readinessQuery = useQuery({
    queryKey: ["ml-readiness"],
    queryFn: () => apiFetch<MlTrainingReadiness>("/api/ml/readiness"),
  });

  const trainMutation = useMutation({
    mutationFn: () => apiFetch("/api/ml/train", { method: "POST", body: JSON.stringify({ epochs: 120 }) }),
    onSuccess: () => {
      toast.success("ML model training completed successfully");
      void queryClient.invalidateQueries({ queryKey: ["ml-models"] });
      void queryClient.invalidateQueries({ queryKey: ["ml-readiness"] });
      setIsTraining(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to train model");
      setIsTraining(false);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (modelId: string) => apiFetch(`/api/ml/activate-model/${modelId}`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Model activated successfully");
      void queryClient.invalidateQueries({ queryKey: ["ml-models"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to activate model");
    },
  });

  const models = modelsQuery.data ?? [];
  const readiness = readinessQuery.data ?? null;
  const activeModel = models.find((model) => model.is_active) ?? null;
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? activeModel ?? models[0] ?? null;
  const selectedModelMetrics = getModelMetrics(selectedModel);
  const selectedModelTrainingMeta = getTrainingMeta(selectedModel);
  const selectedModelStrategy = resolveMlModelCatalogEntry({
    modelType: selectedModel?.model_type,
    strategyFamily: selectedModelTrainingMeta.strategy_family,
  });
  const selectedModelUsesBootstrap = selectedModelTrainingMeta.dataset_mode === "bootstrap_with_synthetic";
  const selectedModelDisplayName = selectedModel
    ? formatMlModelVersionLabel(selectedModel.version, selectedModel.model_type)
    : "ML Model";
  const trainingDisabled = isTraining || readinessQuery.isLoading || readiness?.ready_for_training === false;
  const trainingButtonLabel = isTraining
    ? "Training MLP Comparator..."
    : "Train MLP Comparator";
  const selectedModelSampleNote = readiness
    ? `This model artifact was trained on ${selectedModel?.trained_sample_count ?? 0} labeled samples.`
    : null;

  const trendData = useMemo(
    () => [...models].slice(0, 8).reverse().map((model) => ({
      version: formatMlModelShortLabel(model.version, model.model_type),
      accuracy: getModelMetrics(model).accuracy,
      f1: getModelMetrics(model).f1,
      roc_auc: getModelMetrics(model).roc_auc,
    })),
    [models],
  );

  const radarData = useMemo(
    () => selectedModel ? metricDefs.map((metric) => ({ metric: metric.label, value: Number(selectedModelMetrics[metric.key]) })) : [],
    [selectedModel, selectedModelMetrics],
  );

  const supportData = useMemo(
    () => selectedModel ? [
      { name: "Approved", value: selectedModelMetrics.support.positive, fill: "hsl(var(--primary))" },
      { name: "Rejected", value: selectedModelMetrics.support.negative, fill: "hsl(var(--muted-foreground) / 0.35)" },
    ] : [],
    [selectedModel, selectedModelMetrics],
  );

  if (modelsQuery.isLoading) {
    return <div className="p-8 text-center">Loading ML ecosystem...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ML Intelligence"
        subtitle="Compare candidate model families, review artifact quality, and manage the current ML deployment track."
        actions={
          <Button onClick={() => { setIsTraining(true); trainMutation.mutate(); }} disabled={trainingDisabled} className="group bg-primary px-6 hover:bg-primary/90">
            {isTraining ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4 fill-current" />}
            {trainingButtonLabel}
          </Button>
        }
      />

      <RenderErrorBoundary
        fallback={(error) => (
          <Card className="border-border/70 bg-card shadow-sm">
            <CardContent className="space-y-3 p-5">
              <p className="text-lg font-medium text-foreground">ML dashboard details could not be rendered.</p>
              <p className="text-sm text-muted-foreground">
                The readiness status loaded, but one of the analytics widgets failed. Reload the app to retry.
              </p>
              {selectedModel ? (
                <p className="text-sm text-muted-foreground">
                  Latest model: {selectedModelDisplayName} with {selectedModel.trained_sample_count} samples.
                </p>
              ) : null}
              {import.meta.env.DEV && error ? (
                <pre className="overflow-auto rounded-md border border-border/70 bg-muted/40 p-3 text-xs text-destructive">
                  {error.message}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        )}
      >
        {selectedModel ? (
          <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Selected Model</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{selectedModelDisplayName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedModel.is_active
                    ? selectedModelUsesBootstrap
                      ? "Active in bootstrap mode"
                      : "Active in production"
                    : "Historical model"}
                </p>
                {selectedModelSampleNote ? (
                  <p className="mt-2 text-xs text-muted-foreground">{selectedModelSampleNote}</p>
                ) : null}
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Strategy Role</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {selectedModelStrategy ? (
                    <>
                      <Badge variant="outline" className={cn("border-current/20", roleToneClass(selectedModelStrategy.roleKey))}>
                        {selectedModelStrategy.roleBadge}
                      </Badge>
                      <Badge variant="outline" className={cn("border-current/20", implementationToneClass(selectedModelStrategy))}>
                        {selectedModelStrategy.implementationStatus === "implemented" ? "Implemented now" : "Planned"}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline">Unmapped</Badge>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {selectedModelTrainingMeta.strategy_role ?? selectedModelStrategy?.chosenRole ?? "No strategy label"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedModelTrainingMeta.strategy_summary
                    ?? selectedModelTrainingMeta.strategy_positioning
                    ?? selectedModelStrategy?.pros
                    ?? "Strategy metadata has not been attached to this artifact yet."}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Accuracy</p>
                <p className={cn("mt-2 text-2xl font-semibold", toneClass(selectedModelMetrics.accuracy))}>{pct(selectedModelMetrics.accuracy)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{insight("Accuracy", selectedModelMetrics.accuracy)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">F1 and ROC-AUC</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{selectedModelMetrics.f1.toFixed(3)} / {selectedModelMetrics.roc_auc.toFixed(3)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Balance and separation quality in one glance.</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Validation Support</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{selectedModelMetrics.support.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selectedModelMetrics.support.positive} approved / {selectedModelMetrics.support.negative} rejected</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-12">
            <Card className="border-border/70 bg-card shadow-sm xl:col-span-4">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Model Summary
                </CardTitle>
                <CardDescription>Simple reading of the selected model.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Training Progress</p>
                    <Badge variant="outline">{selectedModelTrainingMeta.epochs_completed} / {selectedModelTrainingMeta.epochs_requested}</Badge>
                  </div>
                  <Progress value={(selectedModelTrainingMeta.epochs_completed / Math.max(selectedModelTrainingMeta.epochs_requested, 1)) * 100} className="mt-3 h-2.5" />
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <p>Batch size: {selectedModelTrainingMeta.batch_size}</p>
                      <p>Validation split: {pct(selectedModelTrainingMeta.validation_split)}</p>
                      <p>Input size: {selectedModelTrainingMeta.input_size} features</p>
                      <p>Model trained samples: {selectedModel.trained_sample_count}</p>
                      <p>Trained: {formatDate(selectedModel.trained_at)}</p>
                    </div>
                </div>

                {metricDefs.slice(0, 4).map((metric) => {
                  const value = Number(selectedModelMetrics[metric.key]);
                  return (
                    <div key={metric.key} className="rounded-xl border border-border/60 bg-background/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{metric.label}</p>
                        <Badge variant="outline" className={cn(toneClass(value), "border-current/20")}>{pct(value)}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{metric.note}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card shadow-sm xl:col-span-8">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Analytics Diagrams
                </CardTitle>
                <CardDescription>Visualize trend, metric shape, and class balance.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 p-5 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <p className="mb-3 text-sm font-semibold text-foreground">Performance Trend</p>
                  <div className="h-[260px] w-full">
                    {trendData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                          <XAxis dataKey="version" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                          <Legend />
                          <RechartsTooltip formatter={(value: number) => pct(value)} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} />
                          <Line type="monotone" dataKey="accuracy" stroke="hsl(var(--primary))" strokeWidth={3} name="Accuracy" />
                          <Line type="monotone" dataKey="f1" stroke="#10b981" strokeWidth={2.5} name="F1 Score" />
                          <Line type="monotone" dataKey="roc_auc" stroke="#f59e0b" strokeWidth={2.5} name="ROC-AUC" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
                        Need at least two models to show a trend.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">Metric Shape</p>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <RechartsTooltip formatter={(value: number) => pct(value)} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} />
                        <Radar name="Selected Model" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">Validation Mix</p>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={supportData} innerRadius={45} outerRadius={72} paddingAngle={4} dataKey="value" nameKey="name" />
                        <Legend />
                        <RechartsTooltip formatter={(value: number) => `${value} samples`} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: "12px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-12">
            <Card className="border-border/70 bg-card shadow-sm xl:col-span-4">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Activity className="h-5 w-5 text-primary" />
                  Quick Analysis
                </CardTitle>
                <CardDescription>Readable insights for admins.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {metricDefs.map((metric) => {
                  const value = Number(selectedModelMetrics[metric.key]);
                  return (
                    <div key={metric.key} className="rounded-xl border border-border/60 bg-background/70 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{metric.label}</p>
                        <span className={cn("text-sm font-semibold", toneClass(value))}>{pct(value)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{insight(metric.label, value)}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card shadow-sm xl:col-span-8">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <History className="h-5 w-5 text-primary" />
                  Model Library
                </CardTitle>
                <CardDescription>Choose a model to analyze or activate it for production.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border/50 bg-muted/10 hover:bg-transparent">
                        <TableHead className="px-6 py-4 font-semibold text-foreground">Model</TableHead>
                        <TableHead className="font-semibold text-foreground">Trained</TableHead>
                        <TableHead className="font-semibold text-foreground">Model Samples</TableHead>
                        <TableHead className="font-semibold text-foreground">Quality</TableHead>
                        <TableHead className="px-6 text-right font-semibold text-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {models.map((model) => (
                        (() => {
                          const modelMetrics = getModelMetrics(model);
                          const modelTrainingMeta = getTrainingMeta(model);
                          const modelStrategy = resolveMlModelCatalogEntry({
                            modelType: model.model_type,
                            strategyFamily: modelTrainingMeta.strategy_family,
                          });

                          return (
                        <TableRow key={model.id} className={cn("border-b border-border/50 transition-colors hover:bg-muted/30", selectedModel?.id === model.id && "bg-primary/5")}>
                          <TableCell className="min-w-[240px] px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Cpu className={cn("h-4 w-4", model.is_active ? "text-primary" : "text-muted-foreground/50")} />
                                <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">{formatMlModelVersionLabel(model.version, model.model_type)}</span>
                                  {model.is_active ? <Badge className="bg-success/10 text-success border-success/20">Active</Badge> : null}
                                  {modelTrainingMeta.dataset_mode === "bootstrap_with_synthetic" ? (
                                    <Badge variant="outline">Bootstrap</Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{model.framework.toUpperCase()} / {model.model_type}</p>
                                {modelStrategy ? (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Badge variant="outline" className={cn("border-current/20", roleToneClass(modelStrategy.roleKey))}>
                                      {modelStrategy.roleBadge}
                                    </Badge>
                                    <Badge variant="outline" className={cn("border-current/20", implementationToneClass(modelStrategy))}>
                                      {modelStrategy.implementationStatus === "implemented" ? "Implemented now" : "Planned"}
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(model.trained_at)}</TableCell>
                          <TableCell className="text-sm font-medium">{model.trained_sample_count}</TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="space-y-2">
                              <AccuracyIndicator value={modelMetrics.accuracy} />
                              <p className="text-xs text-muted-foreground">F1 {modelMetrics.f1.toFixed(3)} | ROC-AUC {modelMetrics.roc_auc.toFixed(3)}</p>
                            </div>
                          </TableCell>
                          <TableCell className="px-6">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant={selectedModel?.id === model.id ? "secondary" : "outline"} onClick={() => setSelectedModelId(model.id)}>
                                <BarChart3 className="mr-1 h-3.5 w-3.5" />
                                Analyze
                              </Button>
                              <Button
                                size="sm"
                                variant={model.is_active ? "outline" : "default"}
                                disabled={model.is_active || activateMutation.isPending}
                                onClick={() => activateMutation.mutate(model.id)}
                                className={cn(model.is_active ? "border-primary/30 text-primary/60" : "bg-primary")}
                              >
                                {model.is_active ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5 fill-current" />}
                                {model.is_active ? "Deployed" : "Activate"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                          );
                        })()
                      ))}
                      {models.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-20 text-center">
                            <div className="flex flex-col items-center justify-center opacity-50">
                              <History className="mb-4 h-12 w-12" />
                              <p className="text-lg font-medium">No training history found</p>
                              <p className="text-sm">Train the first MLP comparator to initialize the model library.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
          </>
        ) : (
          <Card className="border-border/70 bg-card shadow-sm">
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <Cpu className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-lg font-medium text-foreground">No model history yet</p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Train the first MLP comparator to unlock diagrams, metric analysis, and comparison views.</p>
            </CardContent>
          </Card>
        )}
      </RenderErrorBoundary>
    </div>
  );
}
