import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  Cpu,
  History,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { MlModel } from "@/types/ml";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AccuracyIndicator({ value }: { value: number }) {
  const percentage = (value * 100).toFixed(1);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 0.8 ? "bg-success" : value >= 0.6 ? "bg-warning" : "bg-destructive"
          )}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs font-medium">{percentage}%</span>
    </div>
  );
}

import { cn } from "@/lib/utils";

export default function AdminML() {
  const queryClient = useQueryClient();
  const [isTraining, setIsTraining] = useState(false);

  const modelsQuery = useQuery({
    queryKey: ["ml-models"],
    queryFn: () => apiFetch<MlModel[]>("/api/ml/models"),
  });

  const trainMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/ml/train", {
        method: "POST",
        body: JSON.stringify({ epochs: 120, min_samples: 20 }),
      }),
    onSuccess: () => {
      toast.success("ML model training completed successfully");
      void queryClient.invalidateQueries({ queryKey: ["ml-models"] });
      setIsTraining(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to train model");
      setIsTraining(false);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (modelId: string) =>
      apiFetch(`/api/ml/activate-model/${modelId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Model activated successfully");
      void queryClient.invalidateQueries({ queryKey: ["ml-models"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to activate model");
    },
  });

  const activeModel = useMemo(
    () => modelsQuery.data?.find((m) => m.is_active),
    [modelsQuery.data]
  );

  const chartData = useMemo(() => {
    if (!modelsQuery.data) return [];
    return [...modelsQuery.data]
      .reverse()
      .slice(-10)
      .map((m) => ({
        version: m.version.split("_").pop(),
        accuracy: m.metrics_json.accuracy,
        f1: m.metrics_json.f1,
      }));
  }, [modelsQuery.data]);

  const handleTrain = () => {
    setIsTraining(true);
    trainMutation.mutate();
  };

  if (modelsQuery.isLoading) {
    return <div className="p-8 text-center">Loading ML ecosystem...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ML Intelligence"
        subtitle="Manage deep learning models for automated loan verification and risk scoring."
        actions={
          <Button 
            onClick={handleTrain} 
            disabled={isTraining}
            className="group relative overflow-hidden bg-primary px-6 transition-all hover:bg-primary/90"
          >
            {isTraining ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4 fill-current transition-transform group-hover:scale-110" />
            )}
            {isTraining ? "Training Neural Network..." : "Trigger Training Pipeline"}
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-12">
        {/* Active Model Summary */}
        <Card className="col-span-12 border-border/70 bg-card shadow-sm md:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Active System Model
            </CardTitle>
            <CardDescription>Currently serving production traffic</CardDescription>
          </CardHeader>
          <CardContent>
            {activeModel ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version</span>
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge>
                  </div>
                  <div className="text-xl font-bold tracking-tight">{activeModel.version}</div>
                  <div className="text-xs text-muted-foreground mt-1">Trained on {formatDate(activeModel.trained_at)}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/40 bg-card p-3 shadow-sm">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Accuracy</p>
                    <p className="text-2xl font-bold text-foreground">{(activeModel.metrics_json.accuracy * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-card p-3 shadow-sm">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">F1-Score</p>
                    <p className="text-2xl font-bold text-foreground">{activeModel.metrics_json.f1.toFixed(3)}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50 mt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Trained with</span>
                    <span className="font-medium text-foreground">{activeModel.trained_sample_count} samples</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Epochs</span>
                    <span className="font-medium text-foreground">{activeModel.training_meta_json.epochs_completed} / {activeModel.training_meta_json.epochs_requested}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-xl">
                <Cpu className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No model active</p>
                <p className="text-xs text-muted-foreground/60 mt-1 italic">Rule-based fallback is enabled</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accuracy History Chart */}
        <Card className="col-span-12 border-border/70 bg-card shadow-sm md:col-span-8">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-info" />
              Model Performance History
            </CardTitle>
            <CardDescription>Evolution of accuracy and F1 score over recent training sessions</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[240px] w-full">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                    <XAxis 
                      dataKey="version" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      dy={10}
                    />
                    <YAxis 
                      domain={[0, 1]} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontSize: '12px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="accuracy" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorAcc)" 
                      animationDuration={1500}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="f1" 
                      stroke="hsl(var(--info))" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      fill="none" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground italic text-sm">
                  Insufficient historical data to render performance trends.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Model Registry */}
        <Card className="col-span-12 border-border/70 bg-card shadow-sm">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-lg font-semibold">Model Registry</CardTitle>
            <CardDescription>Complete history of trained neural networks and their validation metrics.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-muted/10 hover:bg-transparent">
                    <TableHead className="font-semibold text-foreground py-4 px-6">Model Version</TableHead>
                    <TableHead className="font-semibold text-foreground">Trained Date</TableHead>
                    <TableHead className="font-semibold text-foreground">Samples</TableHead>
                    <TableHead className="font-semibold text-foreground text-center">Accuracy</TableHead>
                    <TableHead className="font-semibold text-foreground text-center">F1 Score</TableHead>
                    <TableHead className="font-semibold text-foreground text-center">ROC-AUC</TableHead>
                    <TableHead className="font-semibold text-foreground text-right px-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(modelsQuery.data ?? []).map((model) => (
                    <TableRow key={model.id} className="border-b border-border/50 transition-colors hover:bg-muted/40 group">
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <Cpu className={cn("h-4 w-4", model.is_active ? "text-primary" : "text-muted-foreground/50")} />
                          <span className="font-medium text-foreground">{model.version}</span>
                          {model.is_active && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 h-5 px-1.5 text-[10px] uppercase font-bold">Current</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(model.trained_at)}</TableCell>
                      <TableCell className="text-sm font-medium">{model.trained_sample_count}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <AccuracyIndicator value={model.metrics_json.accuracy} />
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {model.metrics_json.f1.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {model.metrics_json.roc_auc.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button
                          size="sm"
                          variant={model.is_active ? "outline" : "default"}
                          disabled={model.is_active || activateMutation.isPending}
                          onClick={() => activateMutation.mutate(model.id)}
                          className={cn(
                            "h-8 transition-all",
                            model.is_active ? "border-primary/30 text-primary/60" : "bg-primary hover:scale-105"
                          )}
                        >
                          {model.is_active ? (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <Play className="h-3 w-3 mr-1 fill-current" />
                          )}
                          {model.is_active ? "Deployed" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(modelsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center opacity-40">
                          <History className="h-12 w-12 mb-4" />
                          <p className="text-lg font-medium">No training history found</p>
                          <p className="text-sm">Trigger the training pipeline to initialize the first model.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
