import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listServices, createService, updateService, deactivateService } from "../controllers/services.controller";

const router = Router();
router.get("/", listServices); // public — anyone booking needs to see the service list/prices
router.use(requireAuth, requireRole("OWNER"));
router.post("/", createService);
router.patch("/:id", updateService);
router.delete("/:id", deactivateService);

export default router;
