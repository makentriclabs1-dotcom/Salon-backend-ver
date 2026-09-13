import { Request, Response } from "express";
import { prisma } from "../db";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Exports all appointments (optionally date-filtered) as a downloadable CSV for the owner. */
export async function exportAppointmentsCsv(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const where: any = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { client: true, staff: true, service: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const headers = ["Appointment No", "Date", "Time", "Client", "Phone", "Staff", "Service", "Price", "Status"];
  const rows = appointments.map((a) => [
    a.appointmentNo,
    a.date.toISOString().slice(0, 10),
    a.startTime,
    `${a.client.firstName} ${a.client.lastName}`,
    a.client.phone,
    `${a.staff.firstName} ${a.staff.lastName}`,
    a.service.name,
    Number(a.service.price).toFixed(2),
    a.status,
  ]);

  const csv = [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="appointments-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}
