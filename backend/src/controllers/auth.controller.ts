import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import { writeAudit } from "../middleware/audit";
import { nextSequentialId } from "../utils/idGenerator";
import { sendEmail, emailTemplates } from "../services/email.service";
 
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_EXPIRY_MINUTES = 60;
 
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
 
export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { email, password } = parsed.data;
 
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid email or password" });
 
  // Brute-force protection: once locked, reject immediately without even checking
  // the password, so repeated attempts can't be used to keep probing.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minute(s), or reset your password.` });
  }
 
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingNow = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingNow ? 0 : attempts,
        lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });
    if (lockingNow) {
      return res.status(423).json({ error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` });
    }
    return res.status(401).json({ error: "Invalid email or password" });
  }
 
  // Successful login clears any prior failed-attempt count.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }
 
  const token = jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" } as jwt.SignOptions
  );
 
  await writeAudit({ userId: user.id, action: "LOGIN", entity: "User", entityId: user.id });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}
 
export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, role: true, isActive: true, client: true, staff: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
}
 
const registerClientSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(6),
});
 
export async function registerClient(req: Request, res: Response) {
  const parsed = registerClientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const data = parsed.data;
 
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });
 
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(data.password, saltRounds);
  const clientNo = await nextSequentialId("CLI");
 
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      role: "CLIENT",
      client: {
        create: { clientNo, firstName: data.firstName, lastName: data.lastName, phone: data.phone },
      },
    },
    include: { client: true },
  });
 
  const token = jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" } as jwt.SignOptions
  );
 
  await writeAudit({ userId: user.id, action: "SELF_REGISTER", entity: "Client", entityId: user.client?.id });
  sendEmail({ to: user.email, ...(await emailTemplates.clientWelcome(data.firstName)) });
 
  return res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role }, client: user.client });
}
 
const forgotPasswordSchema = z.object({ email: z.string().email() });
 
export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
 
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
 
  // Always respond the same way whether or not the email exists — otherwise this
  // endpoint could be used to discover which emails have accounts (enumeration).
  const genericResponse = { message: "If an account exists for that email, a reset link has been sent." };
 
  if (user && user.isActive) {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000) },
    });
 
    const frontendUrl = process.env.CORS_ORIGIN || "http://localhost:5173";
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    sendEmail({ to: user.email, ...(await emailTemplates.passwordReset(resetLink)) });
    await writeAudit({ userId: user.id, action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: user.id });
  }
 
  return res.json(genericResponse);
}
 
const resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) });
 
export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
 
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: parsed.data.token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
  }
 
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 12);
 
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);
 
  await writeAudit({ userId: resetToken.userId, action: "PASSWORD_RESET_COMPLETED", entity: "User", entityId: resetToken.userId });
  return res.json({ message: "Your password has been reset. You can now sign in." });
}
