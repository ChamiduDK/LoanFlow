import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCircle2,
  Clock,
  Info,
  Upload,
  X,
  Trash2,
  CheckCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

type NotificationItem = {
  id: string;
  type: "info" | "success" | "warning" | "action";
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
  linkLabel?: string;
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    type: "action",
    title: "Documents Required",
    message: "Your application requires 3 more documents to be uploaded before evaluation can proceed.",
    time: "2 hours ago",
    read: false,
    link: "/documents",
    linkLabel: "Upload Documents",
  },
  {
    id: "2",
    type: "success",
    title: "Application Evaluated",
    message: "Your loan application has been successfully evaluated. View your top lending matches now.",
    time: "1 day ago",
    read: false,
    link: "/results",
    linkLabel: "View Results",
  },
  {
    id: "3",
    type: "warning",
    title: "Upcoming EMI Due",
    message: "Your next repayment installment is due in 5 days. Ensure your account has sufficient funds.",
    time: "2 days ago",
    read: true,
    link: "/management",
    linkLabel: "Manage Repayments",
  },
  {
    id: "4",
    type: "info",
    title: "New Loan Scheme Available",
    message: "A new SME lending scheme from Commercial Bank is now available and matches your profile.",
    time: "3 days ago",
    read: true,
    link: "/results",
    linkLabel: "View Schemes",
  },
  {
    id: "5",
    type: "success",
    title: "Profile Updated",
    message: "Your business profile information was successfully updated.",
    time: "5 days ago",
    read: true,
  },
];

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
  const [notifications, setNotifications] = useState<NotificationItem[]>(MOCK_NOTIFICATIONS);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Notifications
            {unreadCount > 0 && <Badge className="text-xs">{unreadCount} new</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stay up to date with your loan journey activity.</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" />
              Mark All Read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card className="border-border/70 bg-card shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
              <p className="text-sm text-muted-foreground mt-1">No notifications to display.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`group flex gap-4 rounded-xl border px-4 py-4 transition-all ${
                notif.read ? "border-border/60 bg-card/80" : "border-primary/20 bg-primary/5 shadow-sm"
              }`}
              onClick={() => !notif.read && markRead(notif.id)}
              role={notif.read ? undefined : "button"}
              tabIndex={notif.read ? undefined : 0}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 ${getNotifBg(notif.type)}`}>
                {getNotifIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{notif.title}</p>
                    {!notif.read && <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss(notif.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{notif.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-muted-foreground">{notif.time}</span>
                  {notif.link && (
                    <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs font-medium text-primary">
                      <Link to={notif.link} onClick={(e) => e.stopPropagation()}>
                        {notif.linkLabel} {"->"}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
