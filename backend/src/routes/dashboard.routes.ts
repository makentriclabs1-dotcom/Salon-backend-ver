import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { getDashboard } from "../controllers/dashboard.controller";

const router = Router();
router.get("/", requireAuth, requireRole("OWNER", "STAFF"), getDashboard);
export default router;
