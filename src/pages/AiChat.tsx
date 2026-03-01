import LoanFlowChatPanel from "@/components/dashboard/LoanFlowChatPanel";
import { Bot, Info, AlertTriangle, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
          Designed to understand and generate human-like text in a conversational format.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Technology</AlertTitle>
          <AlertDescription>
            Chat Generative Pre-Trained Transformer. It utilizes neural networks trained with reinforcement learning from human feedback (RLHF).
          </AlertDescription>
        </Alert>
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertTitle>Capabilities</AlertTitle>
          <AlertDescription>
            Generates human-like responses, drafts emails, writes essays, brainstorms ideas, translates languages, and summarizes text.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Limitations</AlertTitle>
          <AlertDescription>
            Can sometimes provide incorrect/nonsensical answers, has limited knowledge of events after its training cutoff, and can struggle with complex, multi-step queries.
          </AlertDescription>
        </Alert>
      </div>

      {/* Full-height chat panel */}
      <div className="flex-1 mt-2">
        <LoanFlowChatPanel />
      </div>
    </div>
  );
}
