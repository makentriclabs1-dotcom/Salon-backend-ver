import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { nextSequentialId } from "../utils/idGenerator";
import { writeAudit } from "../middleware/audit";
import { sendEmail, emailTemplates } from "../services/email.service";

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

async function resolveOwnClientId(userId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({ where: { userId } });
  return client?.id ?? null;
}

async function getScheduleForDate(staffId: string, date: Date) {
  const weekday = date.getUTCDay();
  return prisma.staffSchedule.findUnique({ where: { staffId_weekday: { staffId, weekday } } });
}

/** Returns a reason string if the date is blocked (business-wide closure or this staff member's day off), else null. */
async function getBlockedReason(staffId: string, date: Date): Promise<string | null> {
  const [closure, timeOff] = await Promise.all([
    prisma.businessClosure.findUnique({ where: { date } }),
    prisma.staffTimeOff.findUnique({ where: { staffId_date: { staffId, date } } }),
  ]);
  if (closure) return closure.reason || "The business is closed on this date";
  if (timeOff) return timeOff.reason || "This staff member is not working on this date";
  return null;
}

const GRANULARITY_MINS = 15; // candidate slot start times are offered every 15 minutes

export async function getAvailableSlots(req: Request, res: Response) {
  const { staffId, serviceId, date } = req.query as { staffId: string; serviceId: string; date: string };
  if (!staffId || !serviceId || !date) {
    return res.status(400).json({ error: "staffId, serviceId, and date query params are required" });
  }
  const dateObj = new Date(date);

  const blockedReason = await getBlockedReason(staffId, dateObj);
  if (blockedReason) return res.json({ slots: [], reason: blockedReason });

  const [schedule, service] = await Promise.all([
    getScheduleForDate(staffId, dateObj),
    prisma.service.findUnique({ where: { id: serviceId } }),
  ]);
  if (!schedule) return res.json({ slots: [], reason: "Not working this day" });
  if (!service) return res.status(404).json({ error: "Service not found" });

  const booked = await prisma.appointment.findMany({
    where: { staffId, date: dateObj, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    select: { startTime: true, endTime: true },
  });

  const slots: string[] = [];
  let cursor = schedule.startTime;
  const latestPossibleStart = addMinutes(schedule.endTime, -service.durationMins);

  while (cursor <= latestPossibleStart) {
    const candidateEnd = addMinutes(cursor, service.durationMins);
    const overlaps = booked.some((b) => cursor < b.endTime && candidateEnd > b.startTime);
    if (!overlaps) slots.push(cursor);
    cursor = addMinutes(cursor, GRANULARITY_MINS);
  }

  return res.json({ slots, durationMins: service.durationMins });
}

const createAppointmentSchema = z.object({
  clientId: z.string().uuid().optional(), // omitted when a client books for themselves
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
});

export async function createAppointment(req: Request, res: Response) {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  let { clientId, staffId, serviceId, date, startTime, notes } = parsed.data;
  const dateObj = new Date(date);

  if (req.user!.role === "CLIENT") {
    const ownClientId = await resolveOwnClientId(req.user!.userId);
    if (!ownClientId) return res.status(403).json({ error: "No client record linked to this account" });
    clientId = ownClientId;
  } else if (!clientId) {
    return res.status(400).json({ error: "clientId is required when staff book on a client's behalf" });
  }
  const resolvedClientId = clientId as string;

  const [client, staff, service] = await Promise.all([
    prisma.client.findUnique({ where: { id: resolvedClientId }, include: { user: true } }),
    prisma.staff.findUnique({ where: { id: staffId } }),
    prisma.service.findUnique({ where: { id: serviceId } }),
  ]);
  if (!client) return res.status(404).json({ error: "Client not found" });
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  if (!service) return res.status(404).json({ error: "Service not found" });

  const schedule = await getScheduleForDate(staffId, dateObj);
  if (!schedule) return res.status(422).json({ error: "Staff member does not work this day" });
  const blockedReason = await getBlockedReason(staffId, dateObj);
  if (blockedReason) return res.status(422).json({ error: blockedReason });
  if (startTime < schedule.startTime || startTime >= schedule.endTime) {
    return res.status(422).json({ error: "Requested time is outside working hours" });
  }
  const endTime = addMinutes(startTime, service.durationMins);
  if (endTime > schedule.endTime) {
    return res.status(422).json({ error: "Service does not fit before closing time" });
  }

  const appointmentNo = await nextSequentialId("APT");

  try {
    // Serializable isolation: two simultaneous booking requests for overlapping times will
    // never both succeed — Postgres aborts one with a serialization error, which we catch below.
    const appointment = await prisma.$transaction(
      async (tx) => {
        const overlapping = await tx.appointment.findMany({
          where: { staffId, date: dateObj, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
          select: { startTime: true, endTime: true },
        });
        const conflict = overlapping.some((b) => startTime < b.endTime && endTime > b.startTime);
        if (conflict) throw new Error("SLOT_TAKEN");

        return tx.appointment.create({
          data: { appointmentNo, clientId: resolvedClientId, staffId, serviceId, date: dateObj, startTime, endTime, notes },
        });
      },
      { isolation: Prisma.TransactionIsolationLevel.Serializable }
    );

    await prisma.appointmentHistory.create({
      data: { appointmentId: appointment.id, newDate: dateObj, newTime: startTime, newStatus: "CONFIRMED", changedBy: req.user!.userId },
    });
    await writeAudit({ userId: req.user!.userId, action: "CREATE", entity: "Appointment", entityId: appointment.id });

    const clientEmail = client.user?.email || client.email;
    if (clientEmail) {
      sendEmail({
        to: clientEmail,
        ...(await emailTemplates.appointmentConfirmed({
          name: `${client.firstName} ${client.lastName}`,
          appointmentNo,
          staffName: `${staff.firstName} ${staff.lastName}`,
          serviceName: service.name,
          date: formatDate(dateObj),
          time: startTime,
        })),
      });
    }

    return res.status(201).json(appointment);
  } catch (err: any) {
    if (err.message === "SLOT_TAKEN" || err.code === "P2034") {
      return res.status(409).json({ error: "That time was just booked by someone else — please pick another slot" });
    }
    throw err;
  }
}

export async function listAppointments(req: Request, res: Response) {
  const { staffId, date, status } = req.query as Record<string, string>;
  const where: any = {};

  if (req.user!.role === "CLIENT") {
    const ownClientId = await resolveOwnClientId(req.user!.userId);
    if (!ownClientId) return res.json([]);
    where.clientId = ownClientId;
  } else {
    const { clientId } = req.query as Record<string, string>;
    if (clientId) where.clientId = clientId;
    if (req.user!.role === "STAFF") {
      // Staff only see their own appointments (never another staff member's schedule).
      const staffRecord = await prisma.staff.findUnique({ where: { userId: req.user!.userId } });
      where.staffId = staffRecord?.id || "__none__";
    }
  }
  if (staffId && req.user!.role === "OWNER") where.staffId = staffId;
  if (date) where.date = new Date(date);
  if (status) where.status = status;

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, staff: true, service: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return res.json(appointments);
}

const TERMINAL = ["COMPLETED", "CANCELLED", "NO_SHOW"];

const statusSchema = z.object({
  status: z.enum(["CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"]),
  reason: z.string().optional(),
});

export async function changeStatus(req: Request, res: Response) {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const existing = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { client: { include: { user: true } }, staff: true, service: true },
  });
  if (!existing) return res.status(404).json({ error: "Appointment not found" });

  if (req.user!.role === "CLIENT") {
    const ownClientId = await resolveOwnClientId(req.user!.userId);
    if (existing.clientId !== ownClientId) return res.status(403).json({ error: "You can only manage your own appointments" });
    if (parsed.data.status !== "CANCELLED") return res.status(403).json({ error: "Clients can only cancel" });
  }
  if (TERMINAL.includes(existing.status)) {
    return res.status(422).json({ error: `Appointment is already ${existing.status}` });
  }

  const updated = await prisma.appointment.update({ where: { id: existing.id }, data: { status: parsed.data.status } });
  await prisma.appointmentHistory.create({
    data: {
      appointmentId: existing.id, previousStatus: existing.status, newStatus: parsed.data.status,
      reason: parsed.data.reason, changedBy: req.user!.userId,
    },
  });

  if (parsed.data.status === "CANCELLED") {
    const clientEmail = existing.client.user?.email || existing.client.email;
    if (clientEmail) {
      sendEmail({
        to: clientEmail,
        ...(await emailTemplates.appointmentCancelled({
          name: `${existing.client.firstName} ${existing.client.lastName}`,
          appointmentNo: existing.appointmentNo, date: formatDate(existing.date), time: existing.startTime,
        })),
      });
    }
  }

  return res.json(updated);
}

const rescheduleSchema = z.object({ date: z.string(), startTime: z.string().regex(/^\d{2}:\d{2}$/) });

export async function reschedule(req: Request, res: Response) {
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const existing = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { client: { include: { user: true } }, service: true },
  });
  if (!existing) return res.status(404).json({ error: "Appointment not found" });
  if (TERMINAL.includes(existing.status)) return res.status(422).json({ error: `Cannot reschedule a ${existing.status} appointment` });

  const newDate = new Date(parsed.data.date);
  const schedule = await getScheduleForDate(existing.staffId, newDate);
  if (!schedule) return res.status(422).json({ error: "Staff member does not work this day" });
  const blockedReason = await getBlockedReason(existing.staffId, newDate);
  if (blockedReason) return res.status(422).json({ error: blockedReason });
  const newEndTime = addMinutes(parsed.data.startTime, existing.service.durationMins);
  if (parsed.data.startTime < schedule.startTime || newEndTime > schedule.endTime) {
    return res.status(422).json({ error: "Requested time is outside working hours" });
  }

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        const overlapping = await tx.appointment.findMany({
          where: { staffId: existing.staffId, date: newDate, status: { notIn: ["CANCELLED", "NO_SHOW"] }, id: { not: existing.id } },
          select: { startTime: true, endTime: true },
        });
        const conflict = overlapping.some((b) => parsed.data.startTime < b.endTime && newEndTime > b.startTime);
        if (conflict) throw new Error("SLOT_TAKEN");

        return tx.appointment.update({
          where: { id: existing.id },
          data: { date: newDate, startTime: parsed.data.startTime, endTime: newEndTime, status: "RESCHEDULED" },
        });
      },
      { isolation: Prisma.TransactionIsolationLevel.Serializable }
    );

    await prisma.appointmentHistory.create({
      data: {
        appointmentId: existing.id, previousDate: existing.date, previousTime: existing.startTime,
        newDate, newTime: parsed.data.startTime, previousStatus: existing.status, newStatus: "RESCHEDULED",
        changedBy: req.user!.userId,
      },
    });

    const clientEmail = existing.client.user?.email || existing.client.email;
    if (clientEmail) {
      sendEmail({
        to: clientEmail,
        ...(await emailTemplates.appointmentRescheduled({
          name: `${existing.client.firstName} ${existing.client.lastName}`,
          appointmentNo: existing.appointmentNo,
          oldDate: formatDate(existing.date), oldTime: existing.startTime,
          newDate: formatDate(newDate), newTime: parsed.data.startTime,
        })),
      });
    }

    return res.json(updated);
  } catch (err: any) {
    if (err.message === "SLOT_TAKEN" || err.code === "P2034") {
      return res.status(409).json({ error: "That time is already booked — please pick another slot" });
    }
    throw err;
  }
}
