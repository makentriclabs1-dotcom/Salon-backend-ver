import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";

// Public — the booking date picker needs to know which dates are closed for everyone.
export async function listClosures(_req: Request, res: Response) {
  const closures = await prisma.businessClosure.findMany({
    where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    orderBy: { date: "asc" },
  });
  return res.json(closures);
}

const closureSchema = z.object({ date: z.string(), reason: z.string().optional() });

export async function addClosure(req: Request, res: Response) {
  const parsed = closureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  try {
    const closure = await prisma.businessClosure.create({ data: { date: new Date(parsed.data.date), reason: parsed.data.reason } });
    return res.status(201).json(closure);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "That date is already marked closed" });
    throw err;
  }
}

export async function removeClosure(req: Request, res: Response) {
  await prisma.businessClosure.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
