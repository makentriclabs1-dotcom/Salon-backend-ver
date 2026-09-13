import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { nextSequentialId } from "../utils/idGenerator";

export async function listClients(req: Request, res: Response) {
  const search = (req.query.search as string) || "";
  const where = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { clientNo: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
        ],
      }
    : {};
  const clients = await prisma.client.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  return res.json(clients);
}

export async function getClient(req: Request, res: Response) {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { appointments: { include: { staff: true, service: true }, orderBy: { date: "desc" } } },
  });
  if (!client) return res.status(404).json({ error: "Client not found" });
  return res.json(client);
}

const createClientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

// Staff/owner registering a walk-in or phone-in client (no login account, unlike self-registered clients).
export async function createClient(req: Request, res: Response) {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const clientNo = await nextSequentialId("CLI");
  const client = await prisma.client.create({
    data: { clientNo, ...parsed.data, email: parsed.data.email || null },
  });
  return res.status(201).json(client);
}

export async function updateClient(req: Request, res: Response) {
  const parsed = createClientSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { ...parsed.data, email: parsed.data.email === "" ? null : parsed.data.email },
  });
  return res.json(client);
}
