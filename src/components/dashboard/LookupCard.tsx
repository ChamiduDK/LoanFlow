import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, User as UserIcon, Calendar, DollarSign, Briefcase } from "lucide-react";
import { format } from "date-fns";

interface LookupCardProps {
  data: Record<string, unknown> | Array<Record<string, unknown>> | null;
  type?: string;
}

export function LookupCard({ data, type }: LookupCardProps) {
  if (!data) return null;

  // If it's an array, render multiple cards or a list
  if (Array.isArray(data)) {
    return (
      <div className="space-y-3 mt-2 w-full">
        {data.map((item, i) => (
          <LookupCard key={i} data={item} type={type} />
        ))}
      </div>
    );
  }

  const record = data as Record<string, unknown>;

  const formatKey = (key: string) => {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const isLoanApp = record.requested_amount !== undefined || type === "application";
  const isProfile = record.full_name !== undefined || type === "profile";
  const createdAt = record.created_at ? new Date(String(record.created_at)) : null;
  const hasValidCreatedAt = createdAt !== null && !Number.isNaN(createdAt.getTime());

  return (
    <Card className="animated-chat-message-card border-none overflow-hidden mt-2 w-full max-w-full">
      <CardContent className="p-0">
        <div className="bg-primary/5 px-4 py-2 border-b border-primary/10 flex items-center gap-2">
          {isLoanApp ? (
            <FileText className="h-4 w-4 text-primary" />
          ) : isProfile ? (
            <UserIcon className="h-4 w-4 text-primary" />
          ) : (
            <Briefcase className="h-4 w-4 text-primary" />
          )}
          <span className="font-semibold text-sm">
            {isLoanApp ? "Loan Application" : isProfile ? "User Profile" : "Record Details"}
          </span>
          {record.status && (
            <Badge variant="outline" className="ml-auto text-[10px] h-4">
              {String(record.status)}
            </Badge>
          )}
        </div>
        <div className="p-3">
          <Table>
            <TableBody>
              {Object.entries(record).map(([key, value]) => {
                // Skip internal/long/unfriendly fields
                if (
                  key === "id" || 
                  key === "user_id" || 
                  key === "created_at" || 
                  key === "updated_at" || 
                  key === "status" ||
                  value === null ||
                  typeof value === "object"
                ) return null;

                let displayValue = String(value);
                if (key.includes("amount") || key.includes("turnover") || key.includes("income")) {
                  const numericValue = Number(value);
                  if (Number.isFinite(numericValue)) {
                    displayValue = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(numericValue);
                  }
                }

                return (
                  <TableRow key={key} className="border-none hover:bg-transparent h-auto">
                    <TableCell className="py-1 pl-0 text-[11px] font-medium text-white/50 w-1/3 align-top">
                      {formatKey(key)}
                    </TableCell>
                    <TableCell className="py-1 pr-0 text-[11px] text-white/90 break-words">
                      {displayValue}
                    </TableCell>
                  </TableRow>
                );
              })}
              {hasValidCreatedAt && (
                <TableRow className="border-none hover:bg-transparent h-auto">
                  <TableCell className="py-1 pl-0 text-[10px] text-white/30 italic">
                    Date
                  </TableCell>
                  <TableCell className="py-1 pr-0 text-[10px] text-white/30 italic text-right">
                    {format(createdAt, "MMM d, yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
