import SmartChatPanel from "@/components/dashboard/SmartChatPanel";
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
          the LoanFlow AI Chat need to be LoanFlow designed to understand and generate human-like text in a conversational format. It uses a large language model (LLM) , What it does: It generates human-like responses to prompts, allowing for interactive, dialogue-based communication.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Technology</AlertTitle>
          <AlertDescription>
            It stands for "Chat Generative Pre-Trained Transformer," utilizing neural networks trained with reinforcement learning from human feedback (RLHF).
          </AlertDescription>
        </Alert>
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertTitle>Capabilities</AlertTitle>
          <AlertDescription>
            It can draft emails, write essays, brainstorm ideas, translate languages, and summarize text.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Limitations</AlertTitle>
          <AlertDescription>
            It can sometimes provide incorrect or nonsensical answers, has limited knowledge of events after its training cutoff, and can struggle with complex, multi-step queries.
          </AlertDescription>
        </Alert>
      </div>

      {/* Full-height chat panel */}
      <div className="flex-1 mt-2">
        <SmartChatPanel />
      </div>
    </div>
  );
}

