import { badRequest, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { aiService, type ChatMessage as AiChatMessage } from "./ai.service";
import { env } from "../config/env";

const MODEL_NAME = "LoanFlow AI";
const WEB_CHANNEL = "web";
const REFERENCE_CACHE_TTL_MS = 2 * 60 * 1000;

type ChatSessionRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  status: "active" | "closed" | "archived";
  started_at: string;
  metadata: Record<string, unknown> | null;
};

type ChatMessageRow = {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant" | "system" | "tool";
  message_text: string | null;
  message_json: Record<string, unknown> | null;
  created_at: string;
};

type BankRow = {
  id: string;
  name: string;
  code: string;
};

type ProductRow = {
  id: string;
  bank_id: string;
  name: string;
  description: string | null;
  purpose_category: string | null;
  min_amount: number;
  max_amount: number;
  rate_min: number;
  rate_max: number;
  tenure_min_months: number;
  tenure_max_months: number;
  collateral_required: boolean;
  banks: { name?: string } | { name?: string }[] | null;
};

type EligibilityRuleRow = {
  product_id: string;
  rules_json: Record<string, unknown> | null;
};

type RequiredDocumentRow = {
  product_id: string;
  document_type: string;
  display_name: string;
  is_required: boolean;
  notes: string | null;
};

type BenefitRow = {
  product_id: string;
  title: string;
  description: string | null;
  is_highlight: boolean;
};

type ProductContext = {
  id: string;
  bank_id: string;
  bank_name: string;
  name: string;
  description: string | null;
  purpose_category: string | null;
  min_amount: number;
  max_amount: number;
  rate_min: number;
  rate_max: number;
  tenure_min_months: number;
  tenure_max_months: number;
  collateral_required: boolean;
  rules_json: Record<string, unknown>;
  required_documents: RequiredDocumentRow[];
  benefits: BenefitRow[];
  searchable_text: string;
};

type ReferenceDataSnapshot = {
  generated_at: string;
  banks: BankRow[];
  products: ProductContext[];
};

type ScoredProduct = {
  product: ProductContext;
  score: number;
};

type QueryIntents = {
  eligibility: boolean;
  documents: boolean;
  benefits: boolean;
  compare: boolean;
};

type QueryContext = {
  raw: string;
  lower: string;
  tokens: string[];
  requested_amount: number | null;
  preferred_tenure_months: number | null;
  intents: QueryIntents;
};

type AssistantResponse = {
  text: string;
  matched_product_ids: string[];
  matched_bank_ids: string[];
};

type ChatBootstrapResult = {
  model: string;
  session: ChatSessionRow;
  messages: ChatMessageRow[];
};

type SendMessageResult = {
  model: string;
  session: ChatSessionRow;
  user_message: ChatMessageRow;
  assistant_message: ChatMessageRow;
};

let referenceCache:
  | {
    expires_at: number;
    snapshot: ReferenceDataSnapshot;
  }
  | null = null;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "best",
  "for",
  "from",
  "have",
  "i",
  "in",
  "is",
  "loan",
  "me",
  "my",
  "of",
  "on",
  "or",
  "scheme",
  "schemes",
  "the",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toBankName(product: ProductRow): string {
  if (Array.isArray(product.banks)) {
    return product.banks[0]?.name ?? "Unknown Bank";
  }

  return product.banks?.name ?? "Unknown Bank";
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function parseScaledNumber(raw: string, suffix: string | undefined): number | null {
  const normalized = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  const scale = (suffix ?? "").toLowerCase();
  if (scale === "k" || scale === "thousand") {
    return normalized * 1_000;
  }
  if (scale === "m" || scale === "mn" || scale === "million") {
    return normalized * 1_000_000;
  }
  if (scale === "lakh" || scale === "lakhs") {
    return normalized * 100_000;
  }
  if (scale === "cr" || scale === "crore") {
    return normalized * 10_000_000;
  }

  return normalized;
}

function extractAmount(query: string): number | null {
  const amountPattern = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|million|thousand|lakh|lakhs|cr|crore)?/gi;
  let best: number | null = null;

  for (const match of query.matchAll(amountPattern)) {
    const raw = match[1];
    const suffix = match[2];
    const parsed = parseScaledNumber(raw, suffix);
    if (!parsed) {
      continue;
    }

    if (!suffix && parsed < 1_000) {
      continue;
    }

    if (best === null || parsed > best) {
      best = parsed;
    }
  }

  return best;
}

function extractTenureMonths(query: string): number | null {
  const tenurePattern = /(\d{1,3})\s*(month|months|mo|mos|year|years|yr|yrs)\b/i;
  const match = query.match(tenurePattern);
  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) {
    return null;
  }

  const unit = match[2].toLowerCase();
  if (unit.startsWith("year") || unit === "yr" || unit === "yrs") {
    return base * 12;
  }

  return base;
}

function parseQuery(query: string): QueryContext {
  const lower = query.toLowerCase();

  return {
    raw: query,
    lower,
    tokens: tokenize(query),
    requested_amount: extractAmount(query),
    preferred_tenure_months: extractTenureMonths(query),
    intents: {
      eligibility: /\b(eligible|eligibility|qualify|qualification|criteria|requirement)\b/i.test(query),
      documents: /\b(document|documents|doc|docs|paper|papers|upload|checklist)\b/i.test(query),
      benefits: /\b(benefit|benefits|feature|features|advantage|advantages)\b/i.test(query),
      compare: /\b(compare|best|top|recommend|suggest|options|option)\b/i.test(query),
    },
  };
}

function formatLkr(value: number): string {
  return `LKR ${Math.round(value).toLocaleString("en-LK")}`;
}

function formatEligibilityHighlights(rules: Record<string, unknown>): string[] {
  const lines: string[] = [];

  const minYears = rules.min_years_active;
  if (typeof minYears === "number") {
    lines.push(`Business age: at least ${minYears} year(s)`);
  }

  const minTurnover = rules.min_turnover;
  if (typeof minTurnover === "number") {
    lines.push(`Minimum annual turnover: ${formatLkr(minTurnover)}`);
  }

  const minMonthlyIncome = rules.min_monthly_income;
  if (typeof minMonthlyIncome === "number") {
    lines.push(`Minimum monthly income: ${formatLkr(minMonthlyIncome)}`);
  }

  const allowedBusinessTypes = rules.allowed_business_types;
  if (Array.isArray(allowedBusinessTypes) && allowedBusinessTypes.length > 0) {
    const values = allowedBusinessTypes.map((item) => String(item).trim()).filter((item) => item.length > 0);
    if (values.length > 0) {
      lines.push(`Allowed business types: ${values.slice(0, 4).join(", ")}`);
    }
  }

  const allowedPurposes = rules.allowed_purposes;
  if (Array.isArray(allowedPurposes) && allowedPurposes.length > 0) {
    const values = allowedPurposes.map((item) => String(item).trim()).filter((item) => item.length > 0);
    if (values.length > 0) {
      lines.push(`Allowed purposes: ${values.slice(0, 4).join(", ")}`);
    }
  }

  const collateralRequired = rules.collateral_required;
  if (typeof collateralRequired === "boolean") {
    lines.push(`Collateral: ${collateralRequired ? "Required" : "Not mandatory"}`);
  }

  return lines;
}

function getMatchedProductIdsFromHistory(messages: ChatMessageRow[]): string[] {
  const assistantMessage = [...messages].reverse().find((entry) => entry.role === "assistant");
  if (!assistantMessage?.message_json) {
    return [];
  }

  const raw = assistantMessage.message_json.matched_product_ids;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((item) => String(item));
}

async function getReferenceDataSnapshot(): Promise<ReferenceDataSnapshot> {
  const now = Date.now();
  if (referenceCache && referenceCache.expires_at > now) {
    return referenceCache.snapshot;
  }

  const [banksResult, productsResult, rulesResult, docsResult, benefitsResult] = await Promise.all([
    supabaseAdmin
      .from("banks")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("loan_products")
      .select("id, bank_id, name, description, purpose_category, min_amount, max_amount, rate_min, rate_max, tenure_min_months, tenure_max_months, collateral_required, banks(name)")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("eligibility_rules")
      .select("product_id, rules_json")
      .eq("is_active", true),
    supabaseAdmin
      .from("required_documents")
      .select("product_id, document_type, display_name, is_required, notes")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("benefits")
      .select("product_id, title, description, is_highlight")
      .order("created_at", { ascending: true }),
  ]);

  if (banksResult.error || productsResult.error || rulesResult.error || docsResult.error || benefitsResult.error) {
    throw internalError("Failed to load LoanFlow reference data", {
      banks: banksResult.error,
      products: productsResult.error,
      rules: rulesResult.error,
      required_documents: docsResult.error,
      benefits: benefitsResult.error,
    });
  }

  const rulesByProduct = new Map<string, Record<string, unknown>>();
  for (const row of (rulesResult.data ?? []) as EligibilityRuleRow[]) {
    rulesByProduct.set(row.product_id, asRecord(row.rules_json));
  }

  const docsByProduct = new Map<string, RequiredDocumentRow[]>();
  for (const row of (docsResult.data ?? []) as RequiredDocumentRow[]) {
    const current = docsByProduct.get(row.product_id) ?? [];
    current.push(row);
    docsByProduct.set(row.product_id, current);
  }

  const benefitsByProduct = new Map<string, BenefitRow[]>();
  for (const row of (benefitsResult.data ?? []) as BenefitRow[]) {
    const current = benefitsByProduct.get(row.product_id) ?? [];
    current.push(row);
    benefitsByProduct.set(row.product_id, current);
  }

  const products: ProductContext[] = ((productsResult.data ?? []) as ProductRow[]).map((product) => {
    const bankName = toBankName(product);
    const requiredDocuments = docsByProduct.get(product.id) ?? [];
    const benefits = benefitsByProduct.get(product.id) ?? [];
    const rulesJson = rulesByProduct.get(product.id) ?? {};
    const searchableText = [
      product.name,
      bankName,
      product.description ?? "",
      product.purpose_category ?? "",
      ...requiredDocuments.map((doc) => `${doc.display_name} ${doc.document_type} ${doc.notes ?? ""}`),
      ...benefits.map((benefit) => `${benefit.title} ${benefit.description ?? ""}`),
      JSON.stringify(rulesJson),
    ]
      .join(" ")
      .toLowerCase();

    return {
      id: product.id,
      bank_id: product.bank_id,
      bank_name: bankName,
      name: product.name,
      description: product.description,
      purpose_category: product.purpose_category,
      min_amount: Number(product.min_amount),
      max_amount: Number(product.max_amount),
      rate_min: Number(product.rate_min),
      rate_max: Number(product.rate_max),
      tenure_min_months: Number(product.tenure_min_months),
      tenure_max_months: Number(product.tenure_max_months),
      collateral_required: Boolean(product.collateral_required),
      rules_json: rulesJson,
      required_documents: requiredDocuments,
      benefits,
      searchable_text: searchableText,
    };
  });

  const snapshot: ReferenceDataSnapshot = {
    generated_at: new Date().toISOString(),
    banks: (banksResult.data ?? []) as BankRow[],
    products,
  };

  referenceCache = {
    expires_at: now + REFERENCE_CACHE_TTL_MS,
    snapshot,
  };

  return snapshot;
}

function scoreProducts(reference: ReferenceDataSnapshot, context: QueryContext): ScoredProduct[] {
  const scores: ScoredProduct[] = reference.products.map((product) => {
    let score = 0;

    for (const token of context.tokens) {
      if (product.searchable_text.includes(token)) {
        score += token.length >= 5 ? 2 : 1;
      }
    }

    if (context.requested_amount !== null) {
      if (context.requested_amount >= product.min_amount && context.requested_amount <= product.max_amount) {
        score += 6;
      } else {
        score -= 3;
      }
    }

    if (context.preferred_tenure_months !== null) {
      if (
        context.preferred_tenure_months >= product.tenure_min_months &&
        context.preferred_tenure_months <= product.tenure_max_months
      ) {
        score += 4;
      } else {
        score -= 2;
      }
    }

    if (context.intents.documents && product.required_documents.length > 0) {
      score += 1;
    }
    if (context.intents.benefits && product.benefits.length > 0) {
      score += 1;
    }
    if (context.intents.eligibility && Object.keys(product.rules_json).length > 0) {
      score += 1;
    }

    if (context.lower.includes(product.bank_name.toLowerCase())) {
      score += 5;
    }
    if (context.lower.includes(product.name.toLowerCase())) {
      score += 5;
    }

    return { product, score };
  });

  scores.sort((left, right) => right.score - left.score);
  return scores;
}

function pickTopProducts(scored: ScoredProduct[], previousProductIds: string[]): ProductContext[] {
  const positive = scored.filter((entry) => entry.score > 0).slice(0, 3).map((entry) => entry.product);
  if (positive.length > 0) {
    return positive;
  }

  if (previousProductIds.length > 0) {
    const previous = scored
      .filter((entry) => previousProductIds.includes(entry.product.id))
      .slice(0, 3)
      .map((entry) => entry.product);
    if (previous.length > 0) {
      return previous;
    }
  }

  return scored.slice(0, 3).map((entry) => entry.product);
}

function composeAssistantResponse(
  reference: ReferenceDataSnapshot,
  context: QueryContext,
  topProducts: ProductContext[],
): AssistantResponse {
  const lines: string[] = [];

  lines.push(`LoanFlow AI reviewed ${reference.products.length} active schemes across ${reference.banks.length} banks.`);

  if (topProducts.length === 0) {
    lines.push("I could not find matching schemes right now. Please try with bank name, amount, or tenure.");
    return {
      text: lines.join("\n"),
      matched_product_ids: [],
      matched_bank_ids: [],
    };
  }

  lines.push("Best matches for your request:");
  topProducts.forEach((product, index) => {
    lines.push(
      `${index + 1}. ${product.bank_name} - ${product.name} | ${formatLkr(product.min_amount)} to ${formatLkr(product.max_amount)} | ${product.rate_min.toFixed(2)}% to ${product.rate_max.toFixed(2)}% | ${product.tenure_min_months}-${product.tenure_max_months} months`,
    );
  });

  if (context.requested_amount !== null) {
    const matching = topProducts.filter(
      (product) => context.requested_amount !== null && context.requested_amount >= product.min_amount && context.requested_amount <= product.max_amount,
    );
    lines.push(
      matching.length > 0
        ? `Amount check: ${formatLkr(context.requested_amount)} is within ${matching.length} top match(es).`
        : `Amount check: ${formatLkr(context.requested_amount)} is outside the top-match ranges.`,
    );
  }

  if (context.preferred_tenure_months !== null) {
    const matching = topProducts.filter(
      (product) =>
        context.preferred_tenure_months !== null &&
        context.preferred_tenure_months >= product.tenure_min_months &&
        context.preferred_tenure_months <= product.tenure_max_months,
    );
    lines.push(
      matching.length > 0
        ? `Tenure check: ${context.preferred_tenure_months} months fits ${matching.length} top match(es).`
        : `Tenure check: ${context.preferred_tenure_months} months may need a different scheme.`,
    );
  }

  const primary = topProducts[0];

  if (context.intents.eligibility || !context.intents.documents) {
    const eligibilityLines = formatEligibilityHighlights(primary.rules_json);
    if (eligibilityLines.length > 0) {
      lines.push(`Key eligibility for ${primary.name}:`);
      eligibilityLines.slice(0, 5).forEach((entry) => lines.push(`- ${entry}`));
    }
  }

  if (context.intents.documents || !context.intents.eligibility) {
    const requiredDocs = primary.required_documents
      .filter((doc) => doc.is_required)
      .map((doc) => doc.display_name)
      .filter((name) => name.trim().length > 0);

    if (requiredDocs.length > 0) {
      lines.push(`Required documents for ${primary.name}:`);
      requiredDocs.slice(0, 6).forEach((name) => lines.push(`- ${name}`));
    }
  }

  if (context.intents.benefits || context.intents.compare) {
    const benefitLines = primary.benefits
      .map((benefit) => {
        const description = benefit.description ? `: ${benefit.description}` : "";
        return `${benefit.title}${description}`;
      })
      .filter((line) => line.trim().length > 0);

    if (benefitLines.length > 0) {
      lines.push(`Top benefits for ${primary.name}:`);
      benefitLines.slice(0, 4).forEach((line) => lines.push(`- ${line}`));
    }
  }

  lines.push("Share a target amount, tenure, and preferred bank to narrow this further.");

  return {
    text: lines.join("\n"),
    matched_product_ids: topProducts.map((product) => product.id),
    matched_bank_ids: topProducts.map((product) => product.bank_id),
  };
}

async function closeActiveWebSessions(userId: string): Promise<void> {
  const activeSessionsResult = await supabaseAdmin
    .from("chat_sessions")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("status", "active");

  if (activeSessionsResult.error) {
    throw internalError("Failed to load active chat sessions", activeSessionsResult.error);
  }

  const sessionIdsToClose = (activeSessionsResult.data ?? [])
    .filter((row) => {
      const metadata = asRecord(row.metadata);
      const channel = metadata.channel;
      if (typeof channel === "string") {
        return channel === WEB_CHANNEL;
      }

      // Backward compatibility for legacy rows without channel metadata.
      return true;
    })
    .map((row) => String(row.id));

  if (sessionIdsToClose.length === 0) {
    return;
  }

  const closeResult = await supabaseAdmin
    .from("chat_sessions")
    .update({
      status: "closed",
      ended_at: new Date().toISOString(),
    })
    .in("id", sessionIdsToClose);

  if (closeResult.error) {
    throw internalError("Failed to close existing web chat sessions", closeResult.error);
  }
}

async function createSessionRow(userId: string, applicationId?: string): Promise<ChatSessionRow> {
  const sessionInsert = await supabaseAdmin
    .from("chat_sessions")
    .insert({
      user_id: userId,
      application_id: applicationId ?? null,
      status: "active",
      metadata: {
        channel: WEB_CHANNEL,
        model: MODEL_NAME,
      },
    })
    .select("id, user_id, application_id, status, started_at, metadata")
    .single();

  if (sessionInsert.error || !sessionInsert.data) {
    throw internalError("Failed to create chat session", sessionInsert.error);
  }

  return sessionInsert.data as ChatSessionRow;
}

async function createWelcomeMessage(userId: string, sessionId: string): Promise<void> {
  const welcomeText =
    "Hello! I am LoanFlow AI, a Chat Generative Pre-Trained Transformer. I can draft emails, write essays, brainstorm ideas, translate languages, summarize text, and provide human-like responses to help you with loan schemes and eligibility.";

  const insertResult = await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    user_id: userId,
    role: "assistant",
    message_text: welcomeText,
    message_json: {
      model: MODEL_NAME,
      welcome: true,
      matched_product_ids: [],
      matched_bank_ids: [],
    },
  });

  if (insertResult.error) {
    throw internalError("Failed to create welcome chat message", insertResult.error);
  }
}

async function listSessionMessages(userId: string, sessionId: string): Promise<ChatMessageRow[]> {
  const result = await supabaseAdmin
    .from("chat_messages")
    .select("id, session_id, user_id, role, message_text, message_json, created_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (result.error) {
    throw internalError("Failed to load chat history", result.error);
  }

  return (result.data ?? []) as ChatMessageRow[];
}

async function requireSessionOwnership(userId: string, sessionId: string): Promise<ChatSessionRow> {
  const result = await supabaseAdmin
    .from("chat_sessions")
    .select("id, user_id, application_id, status, started_at, metadata")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    throw internalError("Failed to verify chat session", result.error);
  }

  if (!result.data) {
    throw notFound("Chat session not found");
  }

  return result.data as ChatSessionRow;
}

async function ensureActiveWebSession(userId: string): Promise<ChatSessionRow> {
  const existing = await supabaseAdmin
    .from("chat_sessions")
    .select("id, user_id, application_id, status, started_at, metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .contains("metadata", { channel: WEB_CHANNEL })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw internalError("Failed to load active chat session", existing.error);
  }

  if (existing.data) {
    return existing.data as ChatSessionRow;
  }

  await closeActiveWebSessions(userId);
  const createdSession = await createSessionRow(userId);
  await createWelcomeMessage(userId, createdSession.id);
  return createdSession;
}

export async function getOrCreateLoanFlowChat(userId: string): Promise<ChatBootstrapResult> {
  const session = await ensureActiveWebSession(userId);
  const messages = await listSessionMessages(userId, session.id);

  return {
    model: MODEL_NAME,
    session,
    messages,
  };
}

export async function createLoanFlowChatSession(
  userId: string,
  applicationId?: string,
): Promise<ChatBootstrapResult> {
  await closeActiveWebSessions(userId);
  const session = await createSessionRow(userId, applicationId);
  await createWelcomeMessage(userId, session.id);
  const messages = await listSessionMessages(userId, session.id);

  return {
    model: MODEL_NAME,
    session,
    messages,
  };
}

export async function sendLoanFlowChatMessage(
  userId: string,
  input: {
    session_id?: string;
    message: string;
  },
): Promise<SendMessageResult> {
  const message = input.message.trim();
  if (message.length === 0) {
    throw badRequest("Message is required");
  }
  if (message.length > 3_000) {
    throw badRequest("Message is too long");
  }

  const session = input.session_id
    ? await requireSessionOwnership(userId, input.session_id)
    : await ensureActiveWebSession(userId);

  const userInsert = await supabaseAdmin
    .from("chat_messages")
    .insert({
      session_id: session.id,
      user_id: userId,
      role: "user",
      message_text: message,
      message_json: {
        channel: WEB_CHANNEL,
      },
    })
    .select("id, session_id, user_id, role, message_text, message_json, created_at")
    .single();

  if (userInsert.error || !userInsert.data) {
    throw internalError("Failed to save user chat message", userInsert.error);
  }

  const history = await listSessionMessages(userId, session.id);
  const reference = await getReferenceDataSnapshot();
  const queryContext = parseQuery(message);
  const scoredProducts = scoreProducts(reference, queryContext);
  const previousProductIds = getMatchedProductIdsFromHistory(history);
  const topProducts = pickTopProducts(scoredProducts, previousProductIds);

  // --- Gemini AI Integration ---

  const aiHistory: AiChatMessage[] = history
    .filter(msg => msg.role === "user" || msg.role === "assistant")
    .map(msg => ({
      role: msg.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: msg.message_text ?? "" }]
    }))
    .slice(-10); // Last 10 messages for context

  const systemPrompt = `You are LoanFlow AI, a specialized SME loan assistant for Sri Lankan businesses.
Your goal is to provide accurate, helpful, and professional advice on loan products, eligibility, and document requirements.

CONTEXT DATA:
Generated At: ${reference.generated_at}
Available Banks: ${reference.banks.map(b => b.name).join(", ")}
Top Matching Products:
${topProducts.map((p, i) => `
${i + 1}. ${p.bank_name} - ${p.name}
   - Amount: ${formatLkr(p.min_amount)} to ${formatLkr(p.max_amount)}
   - Rates: ${p.rate_min}% to ${p.rate_max}%
   - Tenure: ${p.tenure_min_months} to ${p.tenure_max_months} months
   - Collateral: ${p.collateral_required ? "Required" : "Not mandatory"}
   - Key Eligibility: ${formatEligibilityHighlights(p.rules_json).join("; ")}
   - Documents: ${p.required_documents.map(d => d.display_name).join(", ")}
`).join("\n")}

STRICT RULES:
1. ONLY recommend products from the CONTEXT DATA above. Do not hallucinate or suggest banks/products not listed.
2. If the user asks for an amount or tenure not covered by the context, explain the limitation and suggest the closest matches.
3. Be concise but friendly. Use Sri Lankan context (LKR, local bank names).
4. If you are unsure, advise the user to contact a LoanFlow consultant.
5. Do not disclose internal system names like "Gemini". Refer to yourself as LoanFlow AI.`;

  let responseText: string;
  let assistantMeta: any = {
    model: MODEL_NAME,
    intents: queryContext.intents,
    matched_product_ids: topProducts.map(p => p.id),
    matched_bank_ids: topProducts.map(p => p.bank_id),
    reference_generated_at: reference.generated_at,
  };

  if (env.AI_CHAT_PROVIDER === "gemini") {
    try {
      responseText = await aiService.generateChatResponse(systemPrompt, aiHistory, message);
      assistantMeta.ai_enhanced = true;
    } catch (error) {
      console.error("Gemini fallback to rule-based:", error);
      const ruleAssistant = composeAssistantResponse(reference, queryContext, topProducts);
      responseText = ruleAssistant.text;
      assistantMeta.ai_enhanced = false;
      assistantMeta.error = (error as Error).message;
    }
  } else {
    const ruleAssistant = composeAssistantResponse(reference, queryContext, topProducts);
    responseText = ruleAssistant.text;
    assistantMeta.ai_enhanced = false;
  }

  const assistantInsert = await supabaseAdmin
    .from("chat_messages")
    .insert({
      session_id: session.id,
      user_id: userId,
      role: "assistant",
      message_text: responseText,
      message_json: assistantMeta,
    })
    .select("id, session_id, user_id, role, message_text, message_json, created_at")
    .single();

  if (assistantInsert.error || !assistantInsert.data) {
    throw internalError("Failed to save assistant chat message", assistantInsert.error);
  }

  const sessionUpdate = await supabaseAdmin
    .from("chat_sessions")
    .update({
      metadata: {
        ...(session.metadata ?? {}),
        channel: WEB_CHANNEL,
        model: MODEL_NAME,
        last_message_at: assistantInsert.data.created_at,
      },
    })
    .eq("id", session.id)
    .eq("user_id", userId)
    .select("id, user_id, application_id, status, started_at, metadata")
    .single();

  if (sessionUpdate.error || !sessionUpdate.data) {
    throw internalError("Failed to update chat session metadata", sessionUpdate.error);
  }

  return {
    model: MODEL_NAME,
    session: sessionUpdate.data as ChatSessionRow,
    user_message: userInsert.data as ChatMessageRow,
    assistant_message: assistantInsert.data as ChatMessageRow,
  };
}
