import LoanFlowChatPanel from "@/components/dashboard/LoanFlowChatPanel";
import { Bot } from "lucide-react";

export default function AiChat() {
  return (
    <div className="flex flex-col gap-4 h-full pb-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          LoanFlow AI Chat
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ask about loan schemes, eligibility, required documents, and interest rates.
        </p>
      </div>

      {/* Full-height chat panel */}
      <div className="flex-1">
        <LoanFlowChatPanel />
      </div>
    </div>
  );
}
