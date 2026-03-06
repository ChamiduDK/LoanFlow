import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  Info,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { LoanApplication } from "@/types/backend";

type NotificationItem = {
  id: string;
  type: "info" | "success" | "warning" | "action";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  link?: string;
  linkLabel?: string;
};

const READ_STORAGE_KEY = "loanflow-notifications-read";
const DISMISSED_STORAGE_KEY = "loanflow-notifications-dismissed";

function safeParseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toPurposeLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized.toLowerCase() : "loan";
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "Recently";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(Math.round(diffMs / 60_000), 0);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildNotifications(applications: LoanApplication[]): NotificationItem[] {
  return applications
    .flatMap<NotificationItem>((application) => {
      const context = `?applicationId=${application.id}`;

      switch (application.status) {
        case "draft":
          return [{
            id: `draft-${application.id}`,
            type: "action",
            title: "Finish your application",
            message: `Your ${toPurposeLabel(application.purpose)} application is still in draft. Complete it to continue with lender matching.`,
            createdAt: application.updated_at,
            read: false,
            link: `/apply${context}`,
            linkLabel: "Resume application",
          }];
        case "submitted":
          return [{
            id: `submitted-${application.id}`,
            type: "info",
            title: "Application submitted",
            message: "Your application has been submitted successfully and is ready for recommendation checks.",
            createdAt: application.updated_at,
            read: false,
            link: `/results${context}`,
            linkLabel: "View recommendations",
          }];
        case "evaluated":
          return [{
            id: `evaluated-${application.id}`,
            type: "success",
            title: "Recommendations ready",
            message: "Fresh lender recommendations are available for this application.",
            createdAt: application.updated_at,
            read: false,
            link: `/results${context}`,
            linkLabel: "Open results",
          }];
        case "applied":
        case "under_review":
          return [{
            id: `review-${application.id}`,
            type: "warning",
            title: "Application under review",
            message: "A lender or reviewer is processing this application now. Track it for the latest movement.",
            createdAt: application.updated_at,
            read: false,
            link: `/tracker${context}`,
            linkLabel: "Open tracker",
          }];
        case "approved":
          return [{
            id: `approved-${application.id}`,
            type: "success",
            title: "Application approved",
            message: "This application has been approved. Loan management is now available for repayment planning.",
            createdAt: application.updated_at,
            read: false,
            link: `/management${context}`,
            linkLabel: "Open loan management",
          }];
        case "rejected":
          return [{
            id: `rejected-${application.id}`,
            type: "warning",
            title: "Application decision recorded",
            message: "This application was not approved. Review the tracker and update your details before trying again.",
            createdAt: application.updated_at,
            read: false,
            link: `/tracker${context}`,
            linkLabel: "Review tracker",
          }];
        default:
          return [];
      }
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function getNotifIcon(type: NotificationItem["type"]) {
  const cls = "h-4 w-4";
  if (type === "success") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (type === "warning") return <Clock className={`${cls} text-amber-500`} />;
  if (type === "action") return <Upload className={`${cls} text-blue-500`} />;
  return <Info className={`${cls} text-violet-500`} />;
}

function getNotifBg(type: NotificationItem["type"]) {
  if (type === "success") return "bg-emerald-500/10";
  if (type === "warning") return "bg-amber-500/10";
  if (type === "action") return "bg-blue-500/10";
  return "bg-violet-500/10";
}

export default function Notifications() {
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
    staleTime: 30_000,
  });
  const [readIds, setReadIds] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedRead = window.localStorage.getItem(READ_STORAGE_KEY);
    const storedDismissed = window.localStorage.getItem(DISMISSED_STORAGE_KEY);

    setReadIds(safeParseStringArray(storedRead));
    setDismissedIds(safeParseStringArray(storedDismissed));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(readIds));
  }, [readIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(dismissedIds));
  }, [dismissedIds]);

  const notifications = useMemo(() => {
    const derived = buildNotifications(applicationsQuery.data ?? []);

    return derived
      .filter((notification) => !dismissedIds.includes(notification.id))
      .map((notification) => ({
        ...notification,
        read: readIds.includes(notification.id),
      }));
  }, [applicationsQuery.data, dismissedIds, readIds]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const markAllRead = () => {
    setReadIds((previous) => Array.from(new Set([...previous, ...notifications.map((notification) => notification.id)])));
  };

  const markRead = (id: string) => {
    setReadIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
  };

  const dismiss = (id: string) => {
    setDismissedIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
  };

  const clearAll = () => {
    setDismissedIds((previous) => Array.from(new Set([...previous, ...notifications.map((notification) => notification.id)])));
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            Notifications
            {unreadCount > 0 && <Badge className="text-xs">{unreadCount} new</Badge>}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Stay up to date with your live loan journey activity.</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" />
              Mark All Read
            </Button>
          ) : null}
          {notifications.length > 0 ? (
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          ) : null}
        </div>
      </div>

      {applicationsQuery.isLoading ? (
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="py-20 text-center text-sm text-muted-foreground">
            Loading activity...
          </CardContent>
        </Card>
      ) : applicationsQuery.isError ? (
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="py-20 text-center text-sm text-muted-foreground">
            Could not load notifications. Refresh the page and try again.
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">All caught up</h3>
              <p className="mt-1 text-sm text-muted-foreground">No current notifications to display.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`group flex gap-4 rounded-xl border px-4 py-4 transition-all ${
                notification.read ? "border-border/60 bg-card/80" : "border-primary/20 bg-primary/5 shadow-sm"
              }`}
              onClick={() => !notification.read && markRead(notification.id)}
              role={notification.read ? undefined : "button"}
              tabIndex={notification.read ? undefined : 0}
            >
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${getNotifBg(notification.type)}`}>
                {getNotifIcon(notification.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                    {!notification.read ? <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        dismiss(notification.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{notification.message}</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{formatRelativeTime(notification.createdAt)}</span>
                  {notification.link ? (
                    <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs font-medium text-primary">
                      <Link
                        to={notification.link}
                        onClick={(event) => {
                          event.stopPropagation();
                          markRead(notification.id);
                        }}
                      >
                        {notification.linkLabel} {"->"}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
