import express = require("express");
import cors = require("cors");
import helmet = require("helmet");
import rateLimit = require("express-rate-limit");

// Routes
import authRoutes from "./routes/auth";
import settingsRoutes from "./routes/settings";
import servicesRoutes from "./routes/services";
import staffRoutes from "./routes/staff";
import clientsRoutes from "./routes/clients";
import appointmentsRoutes from "./routes/appointments";
import dashboardRoutes from "./routes/dashboard";
import closuresRoutes from "./routes/closures";
import reportsRoutes from "./routes/reports";
import cronRoutes from "./routes/cron";

const app = express();

/* =========================================================
   CORS
   ========================================================= */

const allowedOrigins = [
  "https://bookwise-frontend.makentriclabs1.workers.dev",
  "http://localhost:5173",
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("Blocked CORS origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },

  methods: [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  credentials: true,

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/* =========================================================
   SECURITY
   ========================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* =========================================================
   BODY PARSING
   ========================================================= */

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

/* =========================================================
   RATE LIMITING
   ========================================================= */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Salon backend is running",
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   API ROUTES
   ========================================================= */

app.use("/api/auth", authRoutes);

app.use("/api/settings", settingsRoutes);

app.use("/api/services", servicesRoutes);

app.use("/api/staff", staffRoutes);

app.use("/api/clients", clientsRoutes);

app.use("/api/appointments", appointmentsRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/closures", closuresRoutes);

app.use("/api/reports", reportsRoutes);

app.use("/api/cron", cronRoutes);

/* =========================================================
   ROOT ROUTE
   ========================================================= */

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Salon backend API is running",
  });
});

/* =========================================================
   404 HANDLER
   ========================================================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("API Error:", err);

    if (err.message === "Not allowed by CORS") {
      return res.status(403).json({
        success: false,
        message: "CORS policy blocked this request",
      });
    }

    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
);

export { app };
