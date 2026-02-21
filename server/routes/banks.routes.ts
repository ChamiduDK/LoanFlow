import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { internalError, notFound } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { supabaseAdmin } from "../lib/supabase/client";
import { productByBankParamsSchema, productParamsSchema } from "../schemas/bank";

export const banksRouter = Router();

banksRouter.get(
  "/banks",
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("banks")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw internalError("Failed to load banks", error);
    }

    sendSuccess(res, data ?? []);
  }),
);

banksRouter.get(
  "/banks/:id/products",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productByBankParamsSchema, req.params);

    const [productsResult, termsResult, rulesResult, docsResult, benefitsResult, collateralResult] = await Promise.all([
      supabaseAdmin
        .from("loan_products")
        .select("*")
        .eq("bank_id", params.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabaseAdmin.from("loan_terms").select("*"),
      supabaseAdmin.from("eligibility_rules").select("product_id, rules_json").eq("is_active", true),
      supabaseAdmin.from("required_documents").select("*"),
      supabaseAdmin.from("benefits").select("*"),
      supabaseAdmin.from("collateral").select("*"),
    ]);

    if (productsResult.error || termsResult.error || rulesResult.error || docsResult.error || benefitsResult.error || collateralResult.error) {
      throw internalError("Failed to load bank products and related data", {
        products: productsResult.error,
        terms: termsResult.error,
        rules: rulesResult.error,
        docs: docsResult.error,
        benefits: benefitsResult.error,
        collateral: collateralResult.error,
      });
    }

    const products = productsResult.data ?? [];

    const response = products.map((product) => ({
      ...product,
      loan_terms: (termsResult.data ?? []).filter((term) => term.product_id === product.id),
      eligibility_rule: (rulesResult.data ?? []).find((rule) => rule.product_id === product.id) ?? null,
      required_documents: (docsResult.data ?? []).filter((doc) => doc.product_id === product.id),
      benefits: (benefitsResult.data ?? []).filter((entry) => entry.product_id === product.id),
      collateral: (collateralResult.data ?? []).filter((entry) => entry.product_id === product.id),
    }));

    sendSuccess(res, response);
  }),
);

banksRouter.get(
  "/loan-products/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productParamsSchema, req.params);

    const { data: product, error } = await supabaseAdmin.from("loan_products").select("*, banks(*)").eq("id", params.id).maybeSingle();

    if (error) {
      throw internalError("Failed to load loan product", error);
    }

    if (!product) {
      throw notFound("Loan product not found");
    }

    const [terms, rules, docs, benefits, collateral] = await Promise.all([
      supabaseAdmin.from("loan_terms").select("*").eq("product_id", params.id),
      supabaseAdmin.from("eligibility_rules").select("*").eq("product_id", params.id).eq("is_active", true).maybeSingle(),
      supabaseAdmin.from("required_documents").select("*").eq("product_id", params.id),
      supabaseAdmin.from("benefits").select("*").eq("product_id", params.id),
      supabaseAdmin.from("collateral").select("*").eq("product_id", params.id),
    ]);

    if (terms.error || rules.error || docs.error || benefits.error || collateral.error) {
      throw internalError("Failed to load loan product metadata", {
        terms: terms.error,
        rules: rules.error,
        docs: docs.error,
        benefits: benefits.error,
        collateral: collateral.error,
      });
    }

    sendSuccess(res, {
      ...product,
      loan_terms: terms.data ?? [],
      eligibility_rule: rules.data,
      required_documents: docs.data ?? [],
      benefits: benefits.data ?? [],
      collateral: collateral.data ?? [],
    });
  }),
);
