import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";

export async function listStaff(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === "true";
  const staff = await prisma.staff.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { schedules: true, timeOff: { where: { date: { gte: new Date() } }, orderBy: { date: "asc" } } },
    orderBy: { firstName: "asc" },
  });
  return res.json(staff);
}

export async function getStaff(req: Request, res: Response) {
  const staff = await prisma.staff.findUnique({ where: { id: req.params.id }, include: { schedules: true } });
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  return res.json(staff);
}

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  title: z.string().optional(),
  bio: z.string().optional(),
});

// Owner creates a staff member — this also creates their login account.
export async function createStaff(req: Request, res: Response) {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const passwordHash = await bcrypt.hash(data.password, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      role: "STAFF",
      staff: { create: { firstName: data.firstName, lastName: data.lastName, title: data.title, bio: data.bio } },
    },
    include: { staff: true },
  });

  return res.status(201).json(user.staff);
}

const scheduleSchema = z.object({
  schedules: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })),
});

// Replaces a staff member's whole weekly schedule in one call — simplest mental model for the owner UI.
export async function setSchedule(req: Request, res: Response) {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const staffId = req.params.id;
  await prisma.$transaction([
    prisma.staffSchedule.deleteMany({ where: { staffId } }),
    prisma.staffSchedule.createMany({
      data: parsed.data.schedules.map((s) => ({ staffId, ...s })),
    }),
  ]);

  const updated = await prisma.staff.findUnique({ where: { id: staffId }, include: { schedules: true } });
  return res.json(updated);
}

export async function deactivateStaff(req: Request, res: Response) {
  const staff = await prisma.staff.update({ where: { id: req.params.id }, data: { isActive: false } });
  return res.json(staff);
}

const timeOffSchema = z.object({ date: z.string(), reason: z.string().optional() });

// Marks a specific date off for one staff member — e.g. a sick day or vacation day,
// separate from their normal recurring weekly hours.
export async function addTimeOff(req: Request, res: Response) {
  const parsed = timeOffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  try {
    const timeOff = await prisma.staffTimeOff.create({
      data: { staffId: req.params.id, date: new Date(parsed.data.date), reason: parsed.data.reason },
    });
    return res.status(201).json(timeOff);
  } catch (err: any) {
    if (err.code === "P2002") return res.status(409).json({ error: "Time off is already recorded for that date" });
    throw err;
  }
}

export async function removeTimeOff(req: Request, res: Response) {
  await prisma.staffTimeOff.delete({ where: { id: req.params.timeOffId } });
  return res.status(204).send();
}
