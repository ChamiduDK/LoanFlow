import { useEffect, useState } from "react";
import { MessageSquare, Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import "./ChatSidebar.css";

interface ChatSession {
  id: string;
  started_at: string;
  metadata: any;
}

interface ChatSidebarProps {
  activeSessionId: string | null;
  onSelectSession: (id: string | null) => void;
}

export function ChatSidebar({ activeSessionId, onSelectSession }: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<ChatSession[]>("/api/chat/sessions");
      setSessions(res);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [activeSessionId]);

  const createNewSession = async () => {
    try {
      setIsCreating(true);
      const res = await apiFetch<ChatSession>("/api/chat/sessions", { method: "POST" });
      setSessions([res, ...sessions]);
      onSelectSession(res.id);
      toast({ title: "Success", description: "New chat started" });
    } catch (error: any) {
      console.error("Session creation failed:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create new chat. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setIsCreating(false);
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      setSessions(sessions.filter(s => s.id !== id));
      if (activeSessionId === id) onSelectSession(null);
      toast({ title: "Success", description: "Chat deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete chat", variant: "destructive" });
    }
  };

  return (
    <div className="chat-sidebar w-full md:w-64 shrink-0 overflow-hidden flex flex-col h-full">
      <Button 
        onClick={createNewSession}
        className="new-chat-btn text-white w-full"
        disabled={isLoading || isCreating}
      >
        <Plus className="h-4 w-4 mr-2" />
        {isCreating ? "Starting..." : "New Chat"}
      </Button>

      <div className="px-4 py-2 text-xs font-semibold text-white/50 uppercase tracking-widest flex items-center gap-2">
        <Clock className="h-3 w-3" />
        Recent History
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`session-item group ${activeSessionId === session.id ? "active" : ""}`}
            >
              <MessageSquare className="h-4 w-4 text-white/60 group-hover:text-white" />
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">
                  {session.metadata?.title || `Chat ${new Date(session.started_at).toLocaleDateString()}`}
                </p>
              </div>
              <Trash2 
                className="h-3.5 w-3.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => deleteSession(e, session.id)}
              />
            </div>
          ))}

          {sessions.length === 0 && !isLoading && (
            <div className="text-center py-10 text-white/30 text-xs">
              No recent chats
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
