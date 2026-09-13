import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { exportAppointmentsCsv } from "../controllers/reports.controller";

const router = Router();
router.get("/appointments.csv", requireAuth, requireRole("OWNER"), exportAppointmentsCsv);

export default router;
