// server/src/routes/auth.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

function makeToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function cookieOpts() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
  };
}

router.post("/register", async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email e password obrigatórios" });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "email já registrado" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, name, passwordHash } });

    const token = makeToken(user.id);
    res.cookie("token", token, { ...cookieOpts(), maxAge: 60 * 60 * 1000 }).json({
      id: user.id, email: user.email, name: user.name
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "falha ao registrar" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "credenciais inválidas" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "credenciais inválidas" });

    const token = makeToken(user.id);
    res.cookie("token", token, { ...cookieOpts(), maxAge: 60 * 60 * 1000 }).json({
      id: user.id, email: user.email, name: user.name
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "falha ao logar" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json(null);
    const { sub } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: sub }, select: { id: true, email: true, name: true }
    });
    res.json(user);
  } catch {
    res.json(null);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", { path: "/" }).json({ ok: true });
});

export default router;   // <-- IMPORTANTE
