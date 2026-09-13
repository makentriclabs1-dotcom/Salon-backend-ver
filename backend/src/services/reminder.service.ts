import { prisma } from "../db";
import { sendEmail, emailTemplates } from "./email.service";
import { sendTextMessage, toE164 } from "./sms.service";

const ACTIVE_STATUSES = ["CONFIRMED", "CHECKED_IN"] as const;

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function appointmentDateTime(date: Date, startTime: string): Date {
  const [h, m] = startTime.split(":").map(Number);
  const dt = new Date(date);
  dt.setUTCHours(h, m, 0, 0);
  return dt;
}

async function sweepWindow(windowLabel: "24h" | "1h", windowMs: number, toleranceMs: number) {
  const now = Date.now();
  const candidates = await prisma.appointment.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      ...(windowLabel === "24h" ? { reminder24hSentAt: null } : { reminder1hSentAt: null }),
    },
    include: { client: { include: { user: true } }, staff: true, service: true },
  });

  for (const appt of candidates) {
    const apptTime = appointmentDateTime(appt.date, appt.startTime).getTime();
    const msUntil = apptTime - now;
    if (msUntil <= windowMs && msUntil > windowMs - toleranceMs) {
      const dateStr = formatDate(appt.date);
      const staffName = `${appt.staff.firstName} ${appt.staff.lastName}`;
      const clientName = `${appt.client.firstName} ${appt.client.lastName}`;
      const label = windowLabel === "24h" ? "tomorrow" : "in about an hour";

      const clientEmail = appt.client.user?.email || appt.client.email;
      if (clientEmail) {
        sendEmail({
          to: clientEmail,
          ...(await emailTemplates.appointmentReminder({
            name: clientName, appointmentNo: appt.appointmentNo, staffName,
            serviceName: appt.service.name, date: dateStr, time: appt.startTime, label,
          })),
        });
      }
      if (appt.client.phone) {
        sendTextMessage({
          to: toE164(appt.client.phone),
          body: `Reminder: ${appt.service.name} with ${staffName} ${label} (${dateStr} ${appt.startTime}). Ref ${appt.appointmentNo}.`,
        });
      }

      await prisma.appointment.update({
        where: { id: appt.id },
        data: windowLabel === "24h" ? { reminder24hSentAt: new Date() } : { reminder1hSentAt: new Date() },
      });
    }
  }
}

export async function runReminderSweep() {
  try {
    await sweepWindow("24h", 24 * 60 * 60 * 1000, 10 * 60 * 1000);
    await sweepWindow("1h", 60 * 60 * 1000, 5 * 60 * 1000);
  } catch (err) {
    console.error("[reminders] Sweep failed:", err);
  }
}
