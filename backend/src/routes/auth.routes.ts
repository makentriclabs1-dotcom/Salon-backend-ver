import { Router } from "express";
import { login, me, registerClient, forgotPassword, resetPassword } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.post("/login", login);
router.post("/register-client", registerClient);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", requireAuth, me);

export default router;
