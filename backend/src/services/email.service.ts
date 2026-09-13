import nodemailer from "nodemailer";
import { prisma } from "../db";

let transporter: nodemailer.Transporter | null = null;
let warned = false;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (!warned) {
      console.warn("[email] SMTP not configured — emails will be logged to console instead of sent.");
      warned = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const t = getTransporter();
  const from = process.env.EMAIL_FROM || "Bookwise <no-reply@yourbusiness.com>";
  if (!t) {
    console.log(`[email:not-sent] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await t.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err);
  }
}

async function brandName(): Promise<string> {
  const settings = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  return settings?.businessName || "Bookwise";
}

const wrapper = (business: string, bodyHtml: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #16302B;">
    <h2 style="color: #2E5C8A;">${business}</h2>
    ${bodyHtml}
    <p style="margin-top: 24px; font-size: 12px; color: #888;">This is an automated message.</p>
  </div>
`;

export const emailTemplates = {
  async clientWelcome(firstName: string) {
    const business = await brandName();
    return { subject: `Welcome to ${business}`, html: wrapper(business, `<p>Hi ${firstName},</p><p>Your account has been created. You can now book appointments online anytime.</p>`) };
  },
  async appointmentConfirmed(params: { name: string; appointmentNo: string; staffName: string; serviceName: string; date: string; time: string }) {
    const business = await brandName();
    return {
      subject: `Appointment confirmed — ${params.appointmentNo}`,
      html: wrapper(business, `<p>Hi ${params.name},</p><p>Your appointment is confirmed:</p><ul><li><strong>Service:</strong> ${params.serviceName}</li><li><strong>With:</strong> ${params.staffName}</li><li><strong>Date:</strong> ${params.date}</li><li><strong>Time:</strong> ${params.time}</li><li><strong>Reference:</strong> ${params.appointmentNo}</li></ul>`),
    };
  },
  async appointmentCancelled(params: { name: string; appointmentNo: string; date: string; time: string }) {
    const business = await brandName();
    return {
      subject: `Appointment cancelled — ${params.appointmentNo}`,
      html: wrapper(business, `<p>Hi ${params.name},</p><p>Your appointment on <strong>${params.date} at ${params.time}</strong> (ref ${params.appointmentNo}) has been cancelled.</p>`),
    };
  },
  async appointmentRescheduled(params: { name: string; appointmentNo: string; oldDate: string; oldTime: string; newDate: string; newTime: string }) {
    const business = await brandName();
    return {
      subject: `Appointment rescheduled — ${params.appointmentNo}`,
      html: wrapper(business, `<p>Hi ${params.name},</p><p>Your appointment (ref ${params.appointmentNo}) moved from <strong>${params.oldDate} ${params.oldTime}</strong> to <strong>${params.newDate} ${params.newTime}</strong>.</p>`),
    };
  },
  async appointmentReminder(params: { name: string; appointmentNo: string; staffName: string; serviceName: string; date: string; time: string; label: string }) {
    const business = await brandName();
    return {
      subject: `Reminder: appointment ${params.label} — ${params.appointmentNo}`,
      html: wrapper(business, `<p>Hi ${params.name},</p><p>Reminder: your ${params.serviceName} appointment with ${params.staffName} is ${params.label} (${params.date} at ${params.time}). Ref ${params.appointmentNo}.</p>`),
    };
  },
  async passwordReset(resetLink: string) {
    const business = await brandName();
    return {
      subject: `Reset your ${business} password`,
      html: wrapper(business, `<p>We received a request to reset your password.</p><p><a href="${resetLink}" style="background:#2E5C8A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Reset password</a></p><p style="font-size:13px;color:#888;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`),
    };
  },
};
