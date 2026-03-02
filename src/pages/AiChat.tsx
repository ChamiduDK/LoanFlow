import { useState } from "react";
import SmartChatPanel from "@/components/dashboard/SmartChatPanel";
import { Bot, Menu, ArrowLeft } from "lucide-react";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { ChatSidebar } from "@/components/dashboard/ChatSidebar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";

export default function AiChat() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const navigate = useNavigate();

  return (
    <div className="relative flex flex-col w-screen h-screen overflow-hidden bg-background">
      <AnimatedBackground />
      
      <div className="relative z-10 flex flex-col h-full p-4 md:p-6 overflow-hidden">
        {/* Header */}
        <div className="text-white flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-white hover:bg-white/10"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="h-8 w-[1px] bg-white/10 mx-1" />
            <img src={logo} alt="LoanFlow Logo" className="h-8 md:h-10 w-auto drop-shadow-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white hover:bg-white/10"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Chat Layout with Sidebar */}
        <div className="flex-1 relative flex gap-4 overflow-hidden min-h-0">
          {/* Mobile Sidebar Overlay */}
          {showSidebar && (
            <div 
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setShowSidebar(false)}
            >
              <div 
                className="w-72 h-full animate-in slide-in-from-left duration-300 bg-background"
                onClick={(e) => e.stopPropagation()}
              >
                <ChatSidebar 
                  activeSessionId={activeSessionId} 
                  onSelectSession={(id) => {
                    setActiveSessionId(id);
                    setShowSidebar(false);
                  }} 
                />
              </div>
            </div>
          )}

          {showSidebar && (
            <div className="hidden md:block">
              <ChatSidebar 
                activeSessionId={activeSessionId} 
                onSelectSession={setActiveSessionId} 
              />
            </div>
          )}
          
          <div className="flex-1 h-full min-w-0">
            <SmartChatPanel activeSessionId={activeSessionId} />
          </div>
        </div>
      </div>
    </div>
  );
}

