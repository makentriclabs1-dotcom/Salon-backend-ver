import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listStaff, getStaff, createStaff, setSchedule, deactivateStaff, addTimeOff, removeTimeOff } from "../controllers/staff.controller";

const router = Router();
router.get("/", listStaff); // public — needed so clients can pick who to book with
router.get("/:id", getStaff);
router.use(requireAuth, requireRole("OWNER"));
router.post("/", createStaff);
router.put("/:id/schedule", setSchedule);
router.delete("/:id", deactivateStaff);
router.post("/:id/time-off", addTimeOff);
router.delete("/time-off/:timeOffId", removeTimeOff);

export default router;
