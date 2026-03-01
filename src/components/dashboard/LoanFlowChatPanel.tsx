import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCcw, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import type {
  LoanFlowChatBootstrapResponse,
  LoanFlowChatMessage,
  LoanFlowChatSendResponse,
} from "@/types/backend";
import { useToast } from "@/hooks/use-toast";

const CHAT_QUERY_KEY = ["loanflow-chat-session"] as const;
const QUICK_PROMPTS = [
  "Compare the best loan schemes for LKR 5,000,000 over 36 months",
  "Show key eligibility rules for top SME loan options",
  "What documents do I need for the best matching scheme?",
  "List benefits for the top 3 schemes",
];

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-LK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSenderLabel(message: LoanFlowChatMessage, model: string): string {
  if (message.role === "user") {
    return "You";
  }
  if (message.role === "assistant") {
    return model;
  }
  if (message.role === "system") {
    return "System";
  }

  return "Tool";
}

export default function LoanFlowChatPanel() {
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messageBottomRef = useRef<HTMLDivElement | null>(null);

  const chatQuery = useQuery({
    queryKey: CHAT_QUERY_KEY,
    queryFn: () => apiFetch<LoanFlowChatBootstrapResponse>("/api/agent/chat/session"),
    staleTime: 20_000,
  });

  const messages = chatQuery.data?.messages ?? [];
  const model = chatQuery.data?.model ?? "LoanFlow AI";
  const activeSessionId = chatQuery.data?.session.id ?? "";
  const canSubmit = input.trim().length > 0 && !chatQuery.isLoading;

  const sendMutation = useMutation({
    mutationFn: (payload: { sessionId: string; message: string }) =>
      apiFetch<LoanFlowChatSendResponse>("/api/agent/chat/message", {
        method: "POST",
        body: JSON.stringify({
          session_id: payload.sessionId,
          message: payload.message,
        }),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(
        CHAT_QUERY_KEY,
        (previous: LoanFlowChatBootstrapResponse | undefined): LoanFlowChatBootstrapResponse => {
          const previousMessages = previous?.messages ?? [];
          return {
            model: payload.model,
            session: payload.session,
            messages: [...previousMessages, payload.user_message, payload.assistant_message],
          };
        },
      );
      setInput("");
    },
    onError: (error) => {
      toast({
        title: "Chat request failed",
        description: error instanceof Error ? error.message : "Could not send your message",
        variant: "destructive",
      });
    },
  });

  const newSessionMutation = useMutation({
    mutationFn: () =>
      apiFetch<LoanFlowChatBootstrapResponse>("/api/agent/chat/session", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(CHAT_QUERY_KEY, payload);
      setInput("");
    },
    onError: (error) => {
      toast({
        title: "Could not start a new chat",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const isBusy = sendMutation.isPending || newSessionMutation.isPending;

  useEffect(() => {
    messageBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sendMutation.isPending, newSessionMutation.isPending]);

  const emptyStateText = useMemo(() => {
    if (chatQuery.isError) {
      return "Could not load chat history.";
    }
    if (messages.length === 0) {
      return `Start a conversation with ${model}.`;
    }

    return null;
  }, [chatQuery.isError, messages.length]);

  const sendMessage = (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || sendMutation.isPending) {
      return;
    }

    if (!activeSessionId) {
      toast({
        title: "Chat session not ready",
        description: "Please wait for chat to initialize.",
        variant: "destructive",
      });
      return;
    }

    sendMutation.mutate({
      sessionId: activeSessionId,
      message,
    });
  };

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">LoanFlow AI Chat</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ask about banks, schemes, eligibility, required documents, and benefits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">{model}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={newSessionMutation.isPending}
            onClick={() => newSessionMutation.mutate()}
          >
            {newSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            New Chat
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {chatQuery.isLoading ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-44" />
          </div>
        ) : (
          <ScrollArea className="h-[380px] rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="space-y-3">
              {emptyStateText ? (
                <p className="text-sm text-muted-foreground">{emptyStateText}</p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] space-y-1 rounded-lg px-3 py-2 text-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/70 bg-card text-foreground"
                      }`}
                    >
                      <p className="text-[11px] font-semibold opacity-80">
                        {getSenderLabel(message, model)} | {formatTime(message.created_at)}
                      </p>
                      <p className="whitespace-pre-wrap">
                        {(message.message_text ?? "").trim() || "(no content)"}
                      </p>
                    </div>
                  </div>
                ))
              )}

              {sendMutation.isPending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {model} is thinking...
                  </div>
                </div>
              ) : null}
              <div ref={messageBottomRef} />
            </div>
          </ScrollArea>
        )}

        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => sendMessage(prompt)}
              className="text-xs"
            >
              {prompt}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            placeholder="Ask LoanFlow AI about banks, schemes, rules, documents, or benefits..."
            className="min-h-[96px] flex-1"
            disabled={isBusy}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(input);
              }
            }}
          />
          <Button
            type="button"
            className="sm:min-w-[120px]"
            disabled={!canSubmit || isBusy}
            onClick={() => sendMessage(input)}
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
