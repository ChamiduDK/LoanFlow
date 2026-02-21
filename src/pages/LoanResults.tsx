import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loanSchemes, formatLKR, calculateEMI, banks } from "@/data/mockData";
import {
  ArrowRight,
  Filter,
  Info,
  LayoutGrid,
  Medal,
  SlidersHorizontal,
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

export default function LoanResults() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const rankedSchemes = [...loanSchemes].sort((a, b) => b.approvalProbability - a.approvalProbability);

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Loan Recommendations"
        subtitle="Ranked matches based on your business profile, repayment capacity, and eligibility model."
        actions={(
          <Button>
            Apply for Top Match
            <ArrowRight className="h-4 w-4" />
          </Button>
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
                <TabsList className="h-9">
                  <TabsTrigger value="grid" className="h-7 px-2.5">
                    <LayoutGrid className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="table" className="h-7 px-2.5">
                    <Table2 className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Loan Amount</Label>
                <Input placeholder="e.g., 5,000,000" type="number" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tenure (months)</Label>
                <Input placeholder="e.g., 36" type="number" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Collateral</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="yes">Required</SelectItem>
                    <SelectItem value="no">Not Required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bank</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="All banks" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Banks</SelectItem>
                    {banks.map((bank) => <SelectItem key={bank.id} value={String(bank.id)}>{bank.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sort by</Label>
                <Select>
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

        <TabsContent value="grid">
          {rankedSchemes.length === 0 ? (
            <EmptyState
              title="No recommendations found"
              description="Try widening your amount, tenure, or collateral filters to discover matching loan schemes."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
              {rankedSchemes.map((scheme, i) => {
                const bestEMI = calculateEMI(5000000, scheme.interestRateMin, scheme.tenureMax);
                const worstEMI = calculateEMI(5000000, scheme.interestRateMax, scheme.tenureMin);
                return (
                  <Card
                    key={scheme.id}
                    className={i === 0 ? "border-primary/25 shadow-lg" : undefined}
                  >
                    <CardHeader className="space-y-4 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
                            {banks.find((bank) => bank.id === scheme.bankId)?.logo}
                          </div>
                          <div>
                            <CardTitle>{scheme.bankName}</CardTitle>
                            <p className="text-xs text-muted-foreground">{scheme.schemeName}</p>
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
                          <p className="label-xs">EMI (best case)</p>
                          <p className="mt-1 text-xl font-semibold text-foreground">{formatLKR(bestEMI)}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-primary/5 p-3">
                          <p className="label-xs">Approval probability</p>
                          <p className="mt-1 text-xl font-semibold text-primary">{scheme.approvalProbability}%</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Match confidence</span>
                          <span className="font-semibold text-foreground">{scheme.approvalProbability}%</span>
                        </div>
                        <Progress value={scheme.approvalProbability} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="label-xs">Interest range</p>
                          <p className="mt-1 font-semibold">{scheme.interestRateMin}% - {scheme.interestRateMax}%</p>
                        </div>
                        <div>
                          <p className="label-xs">Tenure</p>
                          <p className="mt-1 font-semibold">{scheme.tenureMin} - {scheme.tenureMax} months</p>
                        </div>
                        <div>
                          <p className="label-xs">EMI (worst case)</p>
                          <p className="mt-1 font-semibold text-muted-foreground">{formatLKR(worstEMI)}</p>
                        </div>
                        <div>
                          <p className="label-xs">Timeline</p>
                          <p className="mt-1 font-semibold">{scheme.approvalTimeline}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={scheme.collateralRequired ? "needs_review" : "valid"} />
                        <p className="text-xs text-muted-foreground">
                          {scheme.collateralRequired ? "Collateral required" : "No collateral required"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="flex-1">View Details</Button>
                        <Button size="sm" variant="outline" className="flex-1">Track This</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="h-4 w-4" />
                Configure Columns
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Tenure</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Collateral</TableHead>
                    <TableHead>Timeline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedSchemes.map((scheme, i) => (
                    <TableRow key={scheme.id}>
                      <TableCell className="font-semibold text-muted-foreground">#{i + 1}</TableCell>
                      <TableCell className="font-medium">{scheme.bankName}</TableCell>
                      <TableCell>{scheme.schemeName}</TableCell>
                      <TableCell>{scheme.interestRateMin}% - {scheme.interestRateMax}%</TableCell>
                      <TableCell>{scheme.tenureMin} - {scheme.tenureMax} mo</TableCell>
                      <TableCell>
                        <StatusBadge status={scheme.approvalProbability >= 80 ? "approved" : "under review"} />
                      </TableCell>
                      <TableCell>{scheme.collateralRequired ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-muted-foreground">{scheme.approvalTimeline}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Why these were recommended
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Expand each lender to view the ranking factors and eligibility drivers.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Accordion type="single" collapsible className="rounded-xl border border-border/70">
            {rankedSchemes.map((scheme, i) => (
              <AccordionItem key={scheme.id} value={`scheme-${scheme.id}`} className="px-4">
                <AccordionTrigger className="py-3">
                  <div className="flex items-center gap-3 text-left">
                    <div className="rounded-md bg-muted/70 px-2 py-1 text-xs font-semibold text-muted-foreground">
                      #{i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{scheme.bankName} - {scheme.schemeName}</p>
                      <p className="text-xs text-muted-foreground">Eligibility score {scheme.eligibilityScore} / 100</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="label-xs">Financial fit</p>
                      <p className="mt-1 text-sm text-foreground">
                        EMI bands align with your stated monthly capacity and requested tenure.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="label-xs">Eligibility match</p>
                      <p className="mt-1 text-sm text-foreground">
                        Industry and business maturity are favorable for this lender profile.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="label-xs">Approval outlook</p>
                      <p className="mt-1 text-sm text-foreground">
                        Higher score driven by documentation readiness and collateral alignment.
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
