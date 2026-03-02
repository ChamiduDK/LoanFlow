import SmartChatPanel from "@/components/dashboard/SmartChatPanel";
import { Bot } from "lucide-react";
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



        {/* Full-height chat panel */}
        <div className="flex-1 mt-2 relative w-full h-full">
          <SmartChatPanel />
        </div>
      </div>
    </div>
  );
}

