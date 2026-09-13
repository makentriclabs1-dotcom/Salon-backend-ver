import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes";
import settingsRoutes from "./routes/settings.routes";
import servicesRoutes from "./routes/services.routes";
import staffRoutes from "./routes/staff.routes";
import clientsRoutes from "./routes/clients.routes";
import appointmentsRoutes from "./routes/appointments.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import closuresRoutes from "./routes/closures.routes";
import reportsRoutes from "./routes/reports.routes";
import { runReminderSweep } from "./services/reminder.service";

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true }));
app.use("/api/auth/register-client", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true }));
app.use("/api/auth/forgot-password", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/closures", closuresRoutes);
app.use("/api/reports", reportsRoutes);

// Manually-triggered reminder sweep, for Vercel Cron to call on a schedule (see
// vercel.json). Protected by CRON_SECRET so nobody else can trigger it repeatedly.
app.get("/api/cron/reminder-sweep", async (req, res) => {
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  await runReminderSweep();
  return res.json({ ok: true, ranAt: new Date().toISOString() });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.publicMessage || "Internal server error" });
});
