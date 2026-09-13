import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";

export async function listServices(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === "true";
  const services = await prisma.service.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
  return res.json(services);
}

const serviceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMins: z.number().int().positive(),
  price: z.number().nonnegative(),
});

export async function createService(req: Request, res: Response) {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const service = await prisma.service.create({ data: parsed.data });
  return res.status(201).json(service);
}

export async function updateService(req: Request, res: Response) {
  const parsed = serviceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const service = await prisma.service.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(service);
}

export async function deactivateService(req: Request, res: Response) {
  const service = await prisma.service.update({ where: { id: req.params.id }, data: { isActive: false } });
  return res.json(service);
}
