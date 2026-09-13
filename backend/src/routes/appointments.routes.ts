import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { getAvailableSlots, createAppointment, listAppointments, changeStatus, reschedule } from "../controllers/appointments.controller";

const router = Router();
router.use(requireAuth);

router.get("/slots", getAvailableSlots);
router.get("/", listAppointments);
router.post("/", requireRole("OWNER", "STAFF", "CLIENT"), createAppointment);
router.patch("/:id/status", requireRole("OWNER", "STAFF", "CLIENT"), changeStatus);
router.patch("/:id/reschedule", requireRole("OWNER", "STAFF"), reschedule);

export default router;
