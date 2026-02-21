import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  under_review: { label: "Under Review", variant: "warning" },
  needs_review: { label: "Needs Review", variant: "warning" },
  missing_docs: { label: "Missing Docs", variant: "destructive" },
  missing: { label: "Missing", variant: "destructive" },
  draft: { label: "Draft", variant: "secondary" },
  applied: { label: "Applied", variant: "info" },
  valid: { label: "Valid", variant: "success" },
  uploaded: { label: "Uploaded", variant: "info" },
  verified: { label: "Verified", variant: "success" },
  pending: { label: "Pending", variant: "secondary" },
  paid: { label: "Paid", variant: "success" },
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "secondary" },
};

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replace(/\s+/g, "_");
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const config = statusConfig[normalized] ?? { label: status, variant: "secondary" as BadgeVariant };
  return (
    <Badge variant={config.variant} className={cn("capitalize", className)}>
      {config.label}
    </Badge>
  );
}
