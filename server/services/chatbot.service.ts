import fs from "node:fs/promises";
import path from "node:path";
import { aiService, type ChatMessage } from "./ai.service";
import { supabaseAdmin } from "../lib/supabase/client";
import { predictApprovalProbability } from "./ml/prediction.service";
import { maskPii } from "../lib/format";
import { logAudit } from "./audit.service";
import { internalError, forbidden, notFound } from "../lib/errors";
import { knowledgeService } from "./knowledge.service";

const POLICY_DIR = path.join(process.cwd(), "server", "data", "policy");

export type ChatIntent = "policy" | "lookup" | "prediction" | "unknown";

export type ChatResponse = {
  text: string;
  intent: ChatIntent;
  data?: any;
};

export class ChatbotService {
  async handleChat(userId: string, userRole: string, message: string, ipAddress?: string): Promise<ChatResponse> {
    const tools = [
      {
        name: "searchPolicy",
        description: "Search the company loan policy and FAQ documents for answers to questions about eligibility, requirements, and procedures.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The specific policy topic or question to search for." }
          },
          required: ["query"]
        }
      },
      {
        name: "lookupData",
        description: "Lookup loan application status, customer profile info, or repayment summaries. Safe for customer and admin use.",
        parameters: {
          type: "object",
          properties: {
            applicationId: { type: "string", description: "Optional specific application ID to look up." },
            dataType: { type: "string", enum: ["application", "profile", "installments"], description: "The type of data to fetch." }
          },
          required: ["dataType"]
        }
      },
      {
        name: "predictLoanApproval",
        description: "Run the ML prediction model to estimate the approval probability for a specific loan application.",
        parameters: {
          type: "object",
          properties: {
            applicationId: { type: "string", description: "The ID of the loan application to analyze." }
          },
          required: ["applicationId"]
        }
      }
    ];

    const systemPrompt = `You are LoanFlow AI, a helpful assistant for MSE loan applications.
Current User ID: ${userId}
User Role: ${userRole}

Guidelines:
1. Use the provided tools to answer accurately.
2. If the user asks about policies or "how to" apply, use searchPolicy.
3. If the user asks about their own loans or status, use lookupData.
4. If the user asks for a prediction or probability of approval, use predictLoanApproval.
5. NEVER reveal sensitive PII (NIC, bank accounts, emails, phone numbers) in your response unless it is masked.
6. If a tool returns no data, inform the user politely.
7. Always explain the results clearly.`;

    const { text, toolCalls } = await aiService.generateChatResponseWithTools(systemPrompt, [], message, tools);

    let intent: ChatIntent = "unknown";
    let finalData: any = null;
    let responseText = text;

    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      const toolName = call.name;
      const args = call.args;

      if (toolName === "searchPolicy") {
        intent = "policy";
        const content = await this.searchPolicy(args.query);
        const ragPrompt = `The user asked: "${message}"\n\nI found the following in our policy docs:\n${content}\n\nPlease answer the user's question based on this policy content.`;
        const ragResult = await aiService.generateChatResponseWithTools(systemPrompt, [], ragPrompt, []);
        responseText = ragResult.text;
      } else if (toolName === "lookupData") {
        intent = "lookup";
        finalData = await this.lookupData(userId, userRole, args.dataType, args.applicationId);
        const dataStr = JSON.stringify(finalData);
        const resultPrompt = `The user asked: "${message}"\n\nI found the following data (SENSITIVE FIELDS ARE MASKED):\n${dataStr}\n\nPlease summarize this for the user.`;
        const resultResponse = await aiService.generateChatResponseWithTools(systemPrompt, [], resultPrompt, []);
        responseText = resultResponse.text;
      } else if (toolName === "predictLoanApproval") {
        intent = "prediction";
        finalData = await this.predictLoanApproval(userId, userRole, args.applicationId);
        const predictionStr = JSON.stringify(finalData);
        const resultPrompt = `The user asked for a prediction for application ${args.applicationId}.\n\nModel Result:\n${predictionStr}\n\nPlease explain the decision (Approve/Review/Reject), the probability, and the top reasons clearly.`;
        const resultResponse = await aiService.generateChatResponseWithTools(systemPrompt, [], resultPrompt, []);
        responseText = resultResponse.text;
      }
    }

    // Audit Log
    await logAudit({
      actorUserId: userId,
      action: "chatbot.query",
      entityType: "chat",
      payloadSummary: {
        message: message.slice(0, 500),
        intent,
        applicationId: toolCalls?.[0]?.args?.applicationId
      },
      ipAddress
    });

    return {
      text: responseText,
      intent,
      data: finalData
    };
  }

  private async searchPolicy(query: string): Promise<string> {
    try {
      const chunks = await knowledgeService.retrieveRelevant(query, 3);
      if (chunks.length === 0) return "No relevant policy documents found.";

      return chunks.map(c => `--- Source: ${c.filename} ---\n${c.content}`).join("\n\n");
    } catch (error) {
      console.error("Policy search error", error);
      return "Error searching policy documents.";
    }
  }


  private async lookupData(userId: string, role: string, dataType: string, appId?: string): Promise<any> {
    const isAdmin = role === "admin";

    if (dataType === "profile") {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).single();
      if (error || !data) throw notFound("Profile not found");

      return {
        full_name: data.full_name,
        email: isAdmin ? data.email : maskPii(data.email, "email"),
        phone: isAdmin ? data.phone : maskPii(data.phone, "phone"),
        business_name: data.business_name,
        business_type: data.business_type,
        annual_turnover: data.annual_turnover
      };
    }

    if (dataType === "application") {
      let query = supabaseAdmin.from("loan_applications").select("*, profiles(full_name)");
      if (!isAdmin) {
        query = query.eq("user_id", userId);
      }
      if (appId) {
        query = query.eq("id", appId);
      }

      const { data, error } = await query;
      if (error) throw internalError("DB error", error);
      if (!data || data.length === 0) throw notFound("Application(s) not found");

      return data.map(app => ({
        id: app.id,
        requested_amount: app.requested_amount,
        status: app.status,
        purpose: app.purpose,
        applicant: app.profiles?.full_name,
        created_at: app.created_at
      }));
    }

    if (dataType === "installments") {
      let query = supabaseAdmin.from("installments").select("*");
      if (!isAdmin) {
        query = query.eq("user_id", userId);
      }
      if (appId) {
        query = query.eq("application_id", appId);
      }

      const { data, error } = await query;
      if (error) throw internalError("DB error", error);

      return data.map(inst => ({
        due_date: inst.due_date,
        amount: inst.amount,
        status: inst.status
      }));
    }

    return null;
  }

  private async predictLoanApproval(userId: string, role: string, applicationId: string): Promise<any> {
    const isAdmin = role === "admin";

    // Verify ownership
    const { data: app, error: appErr } = await supabaseAdmin
      .from("loan_applications")
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (appErr || !app) throw notFound("Application not found");
    if (!isAdmin && app.user_id !== userId) throw forbidden("Not authorized to run prediction for this application");

    const result = await predictApprovalProbability({
      applicationId,
      viewerUserId: userId
    });

    const probability = result.probability;
    let decision = "Review";
    if (probability >= 0.75) decision = "Approve";
    else if (probability < 0.4) decision = "Reject";

    return {
      decision,
      approval_probability: probability,
      top_reasons: result.explainability.reasons.slice(0, 5)
    };
  }
}

export const chatbotService = new ChatbotService();
