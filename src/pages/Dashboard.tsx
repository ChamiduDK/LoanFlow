import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight,
  Bell,
  Building2,
  Clock3,
  FileText,
  GitBranch,
  Plus,
  TrendingUp,
  Upload,
} from "lucide-react";
import { recentApplications, formatLKR } from "@/data/mockData";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const summary = [
    {
      label: "Active Applications",
      value: "3",
      trend: "+12% this month",
      icon: FileText,
      iconClass: "text-primary",
      surfaceClass: "bg-primary/10",
    },
    {
      label: "Recommended Banks",
      value: "5",
      trend: "2 new matches",
      icon: Building2,
      iconClass: "text-success",
      surfaceClass: "bg-success/10",
    },
    {
      label: "Documents Verified",
      value: "70%",
      trend: "4 pending checks",
      icon: Upload,
      iconClass: "text-warning",
      surfaceClass: "bg-warning/15",
    },
    {
      label: "Approval Probability",
      value: "78%",
      trend: "+6% from last run",
      icon: TrendingUp,
      iconClass: "text-info",
      surfaceClass: "bg-info/10",
    },
  ];

  const quickActions = [
    { title: "New Loan Application", desc: "Start a guided multi-step form", icon: Plus, path: "/apply" },
    { title: "Upload Documents", desc: "Complete verification checklist", icon: Upload, path: "/documents" },
    { title: "Track Applications", desc: "See status and bank timelines", icon: GitBranch, path: "/tracker" },
    { title: "Run EMI Calculator", desc: "Estimate monthly repayment", icon: TrendingUp, path: "/calculator" },
  ];

  const reminders = [
    {
      title: "Missing Documents",
      detail: "Bank statements are required for People's Bank application.",
      icon: Bell,
      tone: "bg-warning/15 text-warning",
      tag: "Needs action",
    },
    {
      title: "Application Under Review",
      detail: "Commercial Bank is reviewing your Biz Growth Loan.",
      icon: Clock3,
      tone: "bg-info/10 text-info",
      tag: "In progress",
    },
    {
      title: "Loan Approved",
      detail: "Commercial Bank approved LKR 15M. Next step is acceptance.",
      icon: TrendingUp,
      tone: "bg-success/10 text-success",
      tag: "Approved",
    },
  ];

  const isLoading = false;

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back, Kamal. Here is your SME lending snapshot for today."
        actions={(
          <Button asChild>
            <Link to="/apply">
              <Plus className="h-4 w-4" />
              New Application
            </Link>
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item, idx) => (
          <Card key={item.label} className="blur-fade-in surface-card border-border/50 bg-gradient-to-br from-card to-card/50 hover:shadow-lg" style={{ animationDelay: `${idx * 50}ms` }}>
            <CardContent className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-300 hover:scale-110 ${item.surfaceClass}`}>
                      <item.icon className={`h-5 w-5 ${item.iconClass}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{item.value}</p>
                  <p className="text-xs font-medium text-muted-foreground">{item.trend}</p>
                  {item.label === "Documents Verified" ? <Progress value={70} className="h-1" /> : null}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="xl:col-span-2 surface-card">
          <CardHeader>
            <CardTitle className="gradient-text">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quickActions.map((action, idx) => (
              <Link
                key={action.title}
                to={action.path}
                className="blur-fade-in group rounded-lg border border-border/50 bg-gradient-to-br from-muted/50 to-muted/30 p-4 transition-all duration-300 hover:border-primary/50 hover:bg-gradient-to-br hover:from-primary/10 hover:to-blue-500/10 hover:shadow-md"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                  <action.icon className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:scale-110 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-3 surface-card">
          <CardHeader>
            <CardTitle className="gradient-text">Reminder Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reminders.map((reminder, idx) => (
              <div key={reminder.title} className="blur-fade-in flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-gradient-to-br from-card/50 to-muted/20 p-4 transition-all duration-300 hover:shadow-md" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-lg p-2 transition-transform duration-300 hover:scale-110 ${reminder.tone}`}>
                    <reminder.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{reminder.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{reminder.detail}</p>
                  </div>
                </div>
                <StatusBadge status={reminder.tag} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="data-table-wrap surface-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/50 pb-4">
          <div>
            <CardTitle className="gradient-text">Recent Applications</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Track status and document readiness across active submissions.</p>
          </div>
          <Button variant="outline" size="sm" asChild className="hover:bg-primary/10">
            <Link to="/tracker">
              Open Tracker
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentApplications.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No recent applications"
                description="Start a new application to see your latest bank submissions here."
                action={(
                  <Button asChild>
                    <Link to="/apply">Create Application</Link>
                  </Button>
                )}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Application ID</TableHead>
                  <TableHead className="font-semibold text-foreground">Bank</TableHead>
                  <TableHead className="font-semibold text-foreground">Amount</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Document Progress</TableHead>
                  <TableHead className="font-semibold text-foreground">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentApplications.map((app) => (
                  <TableRow key={app.id} className="border-b border-border/50 transition-colors hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-medium text-foreground">{app.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{app.bankName}</TableCell>
                    <TableCell className="font-medium text-foreground">{formatLKR(app.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex w-36 items-center gap-2">
                        <Progress value={app.documentsComplete} className="h-1.5" />
                        <span className="text-xs font-medium text-muted-foreground">{app.documentsComplete}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{app.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
