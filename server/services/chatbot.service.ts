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
  sessionId: string;
};

export class ChatbotService {
  async handleChat(userId: string, userRole: string, message: string, ipAddress?: string, sessionId?: string): Promise<ChatResponse> {
    // If no sessionId provided, try to find an active one or create a new one
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const { data: session } = await supabaseAdmin
        .from("chat_sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        targetSessionId = session.id;
      } else {
        const { data: newSession } = await this.createSession(userId);
        targetSessionId = newSession.id;
      }
    }

    const finalSessionId = targetSessionId as string;

    // Save User message
    await supabaseAdmin.from("chat_messages").insert({
      session_id: finalSessionId,
      user_id: userId,
      role: "user",
      message_text: message
    });

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
      },
      {
        name: "listBanks",
        description: "Fetch a list of all active partner banks and their basic info.",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "searchProducts",
        description: "Search for specific loan products/schemes based on bank name, loan purpose, or amount.",
        parameters: {
          type: "object",
          properties: {
            bankId: { type: "string", description: "Optional bank ID to filter by." },
            query: { type: "string", description: "Optional text search for product name or description." },
            minAmount: { type: "number", description: "Optional minimum amount filter." }
          }
        }
      },
      {
        name: "getProductDetails",
        description: "Get comprehensive details for a specific loan product, including eligibility rules, required documents, and benefits.",
        parameters: {
          type: "object",
          properties: {
            productId: { type: "string", description: "The unique ID of the loan product." }
          },
          required: ["productId"]
        }
      },
      {
        name: "queryDatabase",
        description: "Fetch data from any table with custom filters. Best for tracking specific data updates or finding related records.",
        parameters: {
          type: "object",
          properties: {
            table: { type: "string", description: "The table name to query (e.g., 'loan_applications', 'profiles', 'banks')." },
            select: { type: "string", description: "Optional columns to select, comma-separated. Default is '*'.", default: "*" },
            limit: { type: "number", description: "Maximum number of rows (default 5, max 50).", default: 5 }
          },
          required: ["table"]
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
4. If the user asks about supported banks, use listBanks.
5. If the user asks for available loan schemes or products, use searchProducts.
6. If the user wants specific details, eligibility rules, or documents for a product, use getProductDetails.
7. If the user asks for a prediction or probability of approval, use predictLoanApproval.
8. If none of the specialized tools fit, or the user wants to 'track' or 'see' general data, use queryDatabase.
9. NEVER reveal sensitive PII (NIC, bank accounts, emails, phone numbers) in your response unless it is masked.
10. If a tool returns no data, inform the user politely.
11. Always explain the results clearly.`;

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
        const { context, sources } = await this.searchPolicy(args.query);
        finalData = { sources };
        const ragPrompt = `The user asked: "${message}"\n\nI found the following in our policy docs:\n${context}\n\nPlease answer the user's question based on this policy content.`;
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
      } else if (toolName === "listBanks") {
        intent = "lookup";
        finalData = await this.listBanks();
        const dataStr = JSON.stringify(finalData);
        const resultPrompt = `The user asked about banks.\n\nDatabase result:\n${dataStr}\n\nPlease list the partner banks for the user.`;
        const resultResponse = await aiService.generateChatResponseWithTools(systemPrompt, [], resultPrompt, []);
        responseText = resultResponse.text;
      } else if (toolName === "searchProducts") {
        intent = "lookup";
        finalData = await this.searchProducts(args.query, args.bankId, args.minAmount);
        const dataStr = JSON.stringify(finalData);
        const resultPrompt = `The user searched for products (query: ${args.query}).\n\nDatabase results:\n${dataStr}\n\nPlease summarize the matching loan products.`;
        const resultResponse = await aiService.generateChatResponseWithTools(systemPrompt, [], resultPrompt, []);
        responseText = resultResponse.text;
      } else if (toolName === "getProductDetails") {
        intent = "lookup";
        finalData = await this.getProductDetails(args.productId);
        const dataStr = JSON.stringify(finalData);
        const resultPrompt = `The user wants details for product ${args.productId}.\n\nDetailed rules & metadata:\n${dataStr}\n\nPlease explain the requirements, eligibility criteria, benefits, and required documents clearly.`;
        const resultResponse = await aiService.generateChatResponseWithTools(systemPrompt, [], resultPrompt, []);
        responseText = resultResponse.text;
      } else if (toolName === "queryDatabase") {
        intent = "lookup";
        finalData = await this.queryDatabase(userId, userRole, args.table, args.select, args.limit);
        const dataStr = JSON.stringify(finalData);
        const resultPrompt = `The user asked to track data: "${message}"\n\nDatabase result for table ${args.table}:\n${dataStr}\n\nPlease summarize the data found for the user.`;
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

    const response: ChatResponse = {
      text: responseText,
      intent,
      data: finalData,
      sessionId: finalSessionId
    };

    // Auto-update session title if it's the first message
    this.maybeUpdateSessionTitle(finalSessionId, message).catch(console.error);

    // Save AI message
    await supabaseAdmin.from("chat_messages").insert({
      session_id: finalSessionId,
      user_id: userId,
      role: "assistant",
      message_text: responseText,
      message_json: {
        intent,
        data: finalData
      }
    });

    return response;
  }

  async getUserSessions(userId: string) {
    return supabaseAdmin
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false });
  }

  async getSessionMessages(userId: string, sessionId: string) {
    return supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
  }

  async createSession(userId: string) {
    const result = await supabaseAdmin
      .from("chat_sessions")
      .insert({
        user_id: userId,
        status: "active",
        metadata: { channel: "web" }
      })
      .select()
      .single();

    if (result.error) {
      console.error("Supabase error creating chat session:", result.error);
    }

    return result;
  }

  async deleteSession(userId: string, sessionId: string) {
    return supabaseAdmin
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId);
  }

  private async maybeUpdateSessionTitle(sessionId: string, firstMessage: string) {
    // Check if title is already set
    const { data: session } = await supabaseAdmin
      .from("chat_sessions")
      .select("metadata")
      .eq("id", sessionId)
      .single();

    if (session?.metadata?.title) return;

    // Use AI to generate a short, punchy title (max 30 chars)
    const titlePrompt = `Generate a very short, professional title (max 4 words) for a loan assistant chat session starting with this message: "${firstMessage}". Return ONLY the title text.`;
    const result = await aiService.generateChatResponseWithTools(
      "You are a helpful assistant that generates short chat titles.",
      [],
      titlePrompt,
      []
    );

    const title = result.text.replace(/["']/g, "").slice(0, 35).trim();

    await supabaseAdmin
      .from("chat_sessions")
      .update({
        metadata: { ...session?.metadata, title }
      })
      .eq("id", sessionId);
  }

  private async searchPolicy(query: string): Promise<{ context: string; sources: Array<{ filename: string }> }> {
    try {
      const chunks = await knowledgeService.retrieveRelevant(query, 3);
      if (chunks.length === 0) return { context: "No relevant policy documents found.", sources: [] };

      const context = chunks.map(c => `--- Source: ${c.filename} ---\n${c.content}`).join("\n\n");
      const sources = chunks.map(c => ({ filename: c.filename }));

      return { context, sources };
    } catch (error) {
      console.error("Policy search error", error);
      return { context: "Error searching policy documents.", sources: [] };
    }
  }

  private async lookupData(userId: string, role: string, dataType: string, appId?: string): Promise<any> {
    const isAdmin = role === "admin";

    if (dataType === "profile") {
      const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).single();
      if (error || !data) {
        console.error(`[ChatbotService.lookupData] Profile lookup error for ${userId}:`, error);
        throw notFound("Profile not found");
      }

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
      if (error) {
        console.error(`[ChatbotService.lookupData] Application lookup error:`, error);
        throw internalError("DB error", error);
      }
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
      if (error) {
        console.error(`[ChatbotService.lookupData] Installments lookup error:`, error);
        throw internalError("DB error", error);
      }

      return data.map(inst => ({
        due_date: inst.due_date,
        amount: inst.amount,
        status: inst.status
      }));
    }

    return null;
  }

  private async queryDatabase(userId: string, role: string, table: string, select = "*", limit = 5): Promise<any> {
    const isAdmin = role === "admin";
    const cappedLimit = Math.min(limit, 50);

    try {
      let query = supabaseAdmin.from(table).select(select);

      if (!isAdmin) {
        const publicTables = ["banks", "loan_products", "eligibility_rules", "required_documents", "benefits"];
        const userScopedTables = ["loan_applications", "profiles", "installments", "chat_sessions", "chat_messages"];

        if (userScopedTables.includes(table)) {
          const idColumn = table === "profiles" ? "id" : (table === "loan_applications" || table === "chat_sessions" || table === "chat_messages" ? "user_id" : null);
          if (idColumn) {
            query = query.eq(idColumn, userId);
          } else if (table === "installments") {
            query = query.eq("user_id", userId);
          }
        } else if (!publicTables.includes(table)) {
          return { error: "Access denied to table: " + table };
        }
      }

      const { data, error } = await query.limit(cappedLimit);

      if (error) {
        console.error(`[ChatbotService.queryDatabase] Error querying ${table}:`, error);
        return { error: "DB error", details: error.message };
      }

      if (!isAdmin && data) {
        return data.map((item: any) => {
          const newItem = { ...item };
          if (newItem.email) newItem.email = maskPii(newItem.email, "email");
          if (newItem.phone) newItem.phone = maskPii(newItem.phone, "phone");
          if (newItem.nic) newItem.nic = maskPii(newItem.nic, "nic");
          return newItem;
        });
      }

      return data;
    } catch (error) {
      console.error(`[ChatbotService.queryDatabase] Fatal error:`, error);
      return { error: "Internal error during database query" };
    }
  }

  private async predictLoanApproval(userId: string, role: string, applicationId: string): Promise<any> {
    const isAdmin = role === "admin";

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

  async listBanks(): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from("banks")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw internalError("DB error fetching banks", error);
    return data;
  }

  async searchProducts(query?: string, bankId?: string, minAmount?: number): Promise<any> {
    let supabaseQuery = supabaseAdmin
      .from("loan_products")
      .select("id, bank_id, name, description, min_amount, max_amount, banks(name)")
      .eq("is_active", true);

    if (bankId) {
      supabaseQuery = supabaseQuery.eq("bank_id", bankId);
    }
    if (minAmount) {
      supabaseQuery = supabaseQuery.lte("min_amount", minAmount).gte("max_amount", minAmount);
    }
    if (query) {
      supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const { data, error } = await supabaseQuery.limit(10);
    if (error) throw internalError("DB error searching products", error);

    return data.map(p => {
      const bankData = Array.isArray(p.banks) ? p.banks[0] : p.banks;
      return {
        id: p.id,
        bank: bankData?.name,
        name: p.name,
        description: p.description,
        amount_range: `${p.min_amount} - ${p.max_amount}`
      };
    });
  }

  async getProductDetails(productId: string): Promise<any> {
    const [productRes, rulesRes, docsRes, benefitsRes] = await Promise.all([
      supabaseAdmin.from("loan_products").select("*, banks(name)").eq("id", productId).single(),
      supabaseAdmin.from("eligibility_rules").select("*").eq("product_id", productId).eq("is_active", true),
      supabaseAdmin.from("required_documents").select("*").eq("product_id", productId).order("is_required", { ascending: false }),
      supabaseAdmin.from("benefits").select("*").eq("product_id", productId)
    ]);

    if (productRes.error || !productRes.data) throw notFound("Product not found");

    const productBankData = Array.isArray(productRes.data.banks) ? productRes.data.banks[0] : productRes.data.banks;

    return {
      product: {
        name: productRes.data.name,
        bank: productBankData?.name,
        description: productRes.data.description,
        interest_rate: `${productRes.data.rate_min}% - ${productRes.data.rate_max}%`,
        tenure: `${productRes.data.tenure_min_months} - ${productRes.data.tenure_max_months} months`,
        collateral_required: productRes.data.collateral_required
      },
      eligibility_rules: rulesRes.data?.map(r => r.rules_json) || [],
      required_documents: docsRes.data?.map(d => ({
        name: d.display_name,
        required: d.is_required,
        notes: d.notes
      })) || [],
      benefits: benefitsRes.data?.map(b => ({
        title: b.title,
        description: b.description
      })) || []
    };
  }
}

export const chatbotService = new ChatbotService();
