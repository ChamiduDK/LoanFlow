import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  profile: z
    .object({
      full_name: z.string().min(2).max(120).optional(),
      business_name: z.string().min(2).max(160).optional(),
      business_type: z.string().min(2).max(120).optional(),
      industry: z.string().min(2).max(120).optional(),
      district: z.string().min(2).max(120).optional(),
      years_active: z.number().int().min(0).max(100).optional(),
      annual_turnover: z.number().min(0).optional(),
    })
    .optional(),
});

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
