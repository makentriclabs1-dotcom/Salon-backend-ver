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

/**
 * -------------------------------------------------------
 * BASIC MIDDLEWARE
 * -------------------------------------------------------
 */

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * -------------------------------------------------------
 * ROOT / API STATUS
 * -------------------------------------------------------
 *
 * This prevents "Cannot GET /" when visiting your
 * Vercel deployment URL directly.
 */

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Bookwise API is running successfully",
    status: "online",
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
  });
});

/**
 * -------------------------------------------------------
 * HEALTH CHECK
 * -------------------------------------------------------
 */

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    time: new Date().toISOString(),
  });
});

/**
 * -------------------------------------------------------
 * RATE LIMITING
 * -------------------------------------------------------
 */

// Login rate limit
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Client registration rate limit
app.use(
  "/api/auth/register-client",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Forgot password rate limit
app.use(
  "/api/auth/forgot-password",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// General API rate limit
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/**
 * -------------------------------------------------------
 * API ROUTES
 * -------------------------------------------------------
 */

app.use("/api/auth", authRoutes);

app.use("/api/settings", settingsRoutes);

app.use("/api/services", servicesRoutes);

app.use("/api/staff", staffRoutes);

app.use("/api/clients", clientsRoutes);

app.use("/api/appointments", appointmentsRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/closures", closuresRoutes);

app.use("/api/reports", reportsRoutes);

/**
 * -------------------------------------------------------
 * REMINDER CRON ENDPOINT
 * -------------------------------------------------------
 *
 * Vercel Cron can call this endpoint periodically.
 *
 * Set CRON_SECRET in Vercel Environment Variables.
 */

app.get("/api/cron/reminder-sweep", async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (
      process.env.CRON_SECRET &&
      auth !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    await runReminderSweep();

    return res.status(200).json({
      ok: true,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Reminder sweep failed:", error);

    return res.status(500).json({
      ok: false,
      error: "Reminder sweep failed",
    });
  }
});

/**
 * -------------------------------------------------------
 * 404 HANDLER
 * -------------------------------------------------------
 */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl,
  });
});

/**
 * -------------------------------------------------------
 * GLOBAL ERROR HANDLER
 * -------------------------------------------------------
 */

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);

    res.status(err.status || 500).json({
      error: err.publicMessage || "Internal server error",
    });
  }
);
