import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, FileText, BarChart3, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import type { ChatResponse, ChatIntent } from "@/types/backend";
import { useToast } from "@/hooks/use-toast";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: ChatIntent;
  data?: any;
  timestamp: Date;
};

export default function SmartChatPanel() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      const response = await apiFetch<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: currentInput }),
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.text,
        intent: response.intent,
        data: response.data,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      toast({
        title: "Chat Error",
        description: error instanceof Error ? error.message : "Failed to get response",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-xl bg-card shadow-lg overflow-hidden">
      <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">LoanFlow Smart Assistant</h3>
        <Badge variant="outline" className="ml-auto">Active</Badge>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Hello! I can help you with loan policies, application status, or assessments.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {["What are the eligibility rules?", "Predict my loan approval", "Show my application status"].map((q) => (
                  <Button key={q} variant="outline" size="sm" onClick={() => setInput(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex gap-3 max-w-[85%] ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border"}`}>
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className="space-y-2">
                  <div className={`rounded-2xl px-4 py-2 text-sm shadow-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50 border"}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>

                  {/* Intent-specific widgets */}
                  {m.role === "assistant" && m.intent === "prediction" && m.data && (
                    <PredictionCard data={m.data} />
                  )}

                  {m.role === "assistant" && m.intent === "policy" && m.data?.sources?.length > 0 && (
                     <SourceList sources={m.data.sources} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[85%]">
                <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center shrink-0">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
                <div className="rounded-2xl px-4 py-2 bg-muted/50 border text-sm italic text-muted-foreground">
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/10">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question here..."
            className="resize-none min-h-[44px] max-h-[200px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center uppercase tracking-widest font-medium">
          Powered by Gemini AI & SME Prediction Engine
        </p>
      </div>
    </div>
  );
}

function PredictionCard({ data }: { data: any }) {
  const isApproved = data.decision === "Approve";
  const isRejected = data.decision === "Reject";

  return (
    <Card className="border-primary/20 bg-primary/5 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Prediction Model Result</span>
          </div>
          <Badge variant={isApproved ? "default" : isRejected ? "destructive" : "secondary"}>
            {data.decision}
          </Badge>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-medium">
            <span>Approval Probability</span>
            <span>{(data.approval_probability * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${isApproved ? "bg-green-500" : isRejected ? "bg-red-500" : "bg-yellow-500"}`}
              style={{ width: `${data.approval_probability * 100}%` }}
            />
          </div>
        </div>

        {data.top_reasons?.length > 0 && (
          <div className="pt-2 border-t border-primary/10">
            <p className="text-[10px] uppercase tracking-wider font-bold mb-1 opacity-60">Top Contributors</p>
            <ul className="space-y-1">
              {data.top_reasons.map((r: string, i: number) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceList({ sources }: { sources: Array<{ filename: string }> }) {
  // Unique filenames
  const uniqueSources = Array.from(new Set(sources.map(s => s.filename)));

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {uniqueSources.map((filename, i) => (
        <Badge key={i} variant="secondary" className="text-[10px] flex items-center gap-1 py-0 px-2 h-5 bg-muted-foreground/10 hover:bg-muted-foreground/20">
          <FileText className="h-3 w-3" />
          {filename}
        </Badge>
      ))}
    </div>
  );
}
