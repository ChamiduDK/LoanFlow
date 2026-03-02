import SmartChatPanel from "@/components/dashboard/SmartChatPanel";
import { Bot, Info, AlertTriangle, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

export default function AiChat() {
  return (
    <div className="relative flex flex-col gap-4 h-full pb-4 rounded-xl overflow-hidden shadow-sm">
      <AnimatedBackground />
      
      <div className="relative z-10 flex flex-col gap-4 h-full p-6">
        {/* Header */}
        <div className="text-white">
          <h1 className="text-3xl font-bold flex items-center gap-3 drop-shadow-md">
            <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg shadow-inner">
              <Bot className="h-7 w-7 text-white" />
            </div>
            LoanFlow AI Chat
          </h1>
          <p className="text-sm text-white/90 mt-2 max-w-3xl drop-shadow">
            LoanFlow AI Chat is designed to understand and generate human-like text in a conversational format. It uses a large language model (LLM) to generate helpful, interactive, and dialogue-based communication for all your SME loan needs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* Glassmorphism Cards */}
          <Alert className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] text-white">
            <Info className="h-5 w-5 text-white/90" />
            <AlertTitle className="text-lg font-semibold tracking-wide">Technology</AlertTitle>
            <AlertDescription className="text-white/80 leading-relaxed mt-1">
               Powered by advanced Generative Pre-Trained Transformers and neural networks, optimized with reinforcement learning for top-tier accuracy.
            </AlertDescription>
          </Alert>
          
          <Alert className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] text-white">
            <Zap className="h-5 w-5 text-white/90" />
            <AlertTitle className="text-lg font-semibold tracking-wide">Capabilities</AlertTitle>
            <AlertDescription className="text-white/80 leading-relaxed mt-1">
              Analyze loan structures, clarify complex financial terms, brainstorm business plans, and instantly summarize lengthy policy documents.
            </AlertDescription>
          </Alert>
          
          <Alert className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] text-white">
            <AlertTriangle className="h-5 w-5 text-white/90" />
            <AlertTitle className="text-lg font-semibold tracking-wide">Limitations</AlertTitle>
            <AlertDescription className="text-white/80 leading-relaxed mt-1">
              May occasionally generate imprecise financial advice. Always verify critical business decisions and specific bank policies with human advisors.
            </AlertDescription>
          </Alert>
        </div>

        {/* Full-height chat panel */}
        <div className="flex-1 mt-4 relative rounded-xl overflow-hidden bg-background/80 backdrop-blur-sm border border-white/10 shadow-xl">
          <SmartChatPanel />
        </div>
      </div>
    </div>
  );
}

