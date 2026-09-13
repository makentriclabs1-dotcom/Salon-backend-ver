import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listClients, getClient, createClient, updateClient } from "../controllers/clients.controller";

const router = Router();
router.use(requireAuth, requireRole("OWNER", "STAFF"));
router.get("/", listClients);
router.get("/:id", getClient);
router.post("/", createClient);
router.patch("/:id", updateClient);

export default router;
