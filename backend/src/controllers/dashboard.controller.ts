import { Request, Response } from "express";
import { prisma } from "../db";

export async function getDashboard(req: Request, res: Response) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

  const staffFilter: any = {};
  if (req.user!.role === "STAFF") {
    const staffRecord = await prisma.staff.findUnique({ where: { userId: req.user!.userId } });
    staffFilter.staffId = staffRecord?.id || "__none__";
  }

  const [todaysAppointments, upcomingAppointments, completedToday, cancelledToday, totalClients, revenueToday] = await Promise.all([
    prisma.appointment.findMany({
      where: { ...staffFilter, date: { gte: startOfToday, lte: endOfToday } },
      include: { client: true, staff: true, service: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.appointment.findMany({
      where: { ...staffFilter, date: { gt: endOfToday }, status: "CONFIRMED" },
      include: { client: true, staff: true, service: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 10,
    }),
    prisma.appointment.count({ where: { ...staffFilter, status: "COMPLETED", date: { gte: startOfToday, lte: endOfToday } } }),
    prisma.appointment.count({ where: { ...staffFilter, status: "CANCELLED", date: { gte: startOfToday, lte: endOfToday } } }),
    req.user!.role === "OWNER" ? prisma.client.count() : Promise.resolve(null),
    prisma.appointment.findMany({
      where: { ...staffFilter, status: "COMPLETED", date: { gte: startOfToday, lte: endOfToday } },
      include: { service: true },
    }),
  ]);

  const revenue = revenueToday.reduce((sum, a) => sum + Number(a.service.price), 0);

  return res.json({
    todaysAppointments,
    upcomingAppointments,
    stats: {
      todaysCount: todaysAppointments.length,
      completedToday,
      cancelledToday,
      totalClients,
      revenueToday: revenue,
    },
  });
}
