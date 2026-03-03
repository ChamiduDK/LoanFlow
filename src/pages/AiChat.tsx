import { useState } from "react";
import SmartChatPanel from "@/components/dashboard/SmartChatPanel";
import { Menu, ArrowLeft } from "lucide-react";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { ChatSidebar } from "@/components/dashboard/ChatSidebar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";

export default function AiChat() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="relative flex flex-col w-full h-[100dvh] overflow-hidden bg-background">
      <AnimatedBackground />
      
      <div className="relative z-10 flex flex-col h-full p-2 md:p-4 lg:p-6 overflow-hidden">
        {/* Header */}
        <div className="text-white flex items-center justify-between mb-2 md:mb-4 px-2 md:px-0">
          <div className="flex items-center gap-2 md:gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-white/10 h-8 px-2 md:h-10 md:px-4"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden xs:inline">Back</span>
            </Button>
            <div className="h-6 w-[1px] bg-white/10 mx-1" />
            <img src={logo} alt="LoanFlow Logo" className="h-6 md:h-10 w-auto drop-shadow-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/10 h-8 w-8 md:hidden"
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label="Toggle chat history"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Chat Layout with Sidebar */}
        <div className="flex-1 relative flex gap-2 md:gap-4 overflow-hidden min-h-0">
          {/* Mobile Sidebar Overlay */}
          {showSidebar && (
            <div 
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setShowSidebar(false)}
            >
              <div 
                className="w-[85vw] max-w-[320px] h-full animate-in slide-in-from-left duration-300 bg-background flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <span className="font-semibold text-white">History</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowSidebar(false)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ChatSidebar 
                    activeSessionId={activeSessionId} 
                    onSelectSession={(id) => {
                      setActiveSessionId(id);
                      setShowSidebar(false);
                    }} 
                  />
                </div>
              </div>
            </div>
          )}

          <div className="hidden md:block h-full min-h-0">
            <ChatSidebar 
              activeSessionId={activeSessionId} 
              onSelectSession={setActiveSessionId} 
            />
          </div>
          
          <div className="flex-1 h-full min-w-0">
            <SmartChatPanel 
              activeSessionId={activeSessionId} 
              onSessionCreated={setActiveSessionId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

