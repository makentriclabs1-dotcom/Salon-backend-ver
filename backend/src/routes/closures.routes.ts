import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { listClosures, addClosure, removeClosure } from "../controllers/closures.controller";

const router = Router();
router.get("/", listClosures); // public
router.use(requireAuth, requireRole("OWNER"));
router.post("/", addClosure);
router.delete("/:id", removeClosure);

export default router;
