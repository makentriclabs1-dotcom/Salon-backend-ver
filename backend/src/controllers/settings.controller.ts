import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";

// Public — the landing page and booking flow need branding before anyone logs in.
export async function getPublicSettings(_req: Request, res: Response) {
  const settings = await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  return res.json(settings);
}

const updateSchema = z.object({
  businessName: z.string().min(1).optional(),
  tagline: z.string().optional(),
  heroImageUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  currency: z.string().optional(),
  timezone: z.string().optional(),
});

export async function updateSettings(req: Request, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const updated = await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", ...parsed.data },
  });
  return res.json(updated);
}
