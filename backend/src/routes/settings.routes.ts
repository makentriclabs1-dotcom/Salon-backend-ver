import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { getPublicSettings, updateSettings } from "../controllers/settings.controller";

const router = Router();
router.get("/", getPublicSettings); // public, no auth — needed for the landing page
router.put("/", requireAuth, requireRole("OWNER"), updateSettings);

export default router;
