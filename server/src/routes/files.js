// server/src/routes/files.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/[^\w.\- ]+/g, "_")),
});
const upload = multer({ storage });

router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const f = req.file;
  const rec = await prisma.file.create({
    data: {
      userId: req.userId,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
      path: f.path,
    },
  });
  res.status(201).json(rec);
});

router.get("/", requireAuth, async (req, res) => {
  const rows = await prisma.file.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, originalName: true, size: true, mimeType: true, createdAt: true }
  });
  res.json(rows);
});

router.get("/:id", requireAuth, async (req, res) => {
  const f = await prisma.file.findUnique({ where: { id: req.params.id } });
  if (!f || f.userId !== req.userId) return res.status(404).json({ error: "não encontrado" });
  res.setHeader("Content-Type", f.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.originalName)}"`);
  fs.createReadStream(f.path).pipe(res);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const f = await prisma.file.findUnique({ where: { id: req.params.id } });
  if (!f || f.userId !== req.userId) return res.status(404).json({ error: "não encontrado" });
  try { fs.unlinkSync(f.path); } catch {}
  await prisma.file.delete({ where: { id: f.id } });
  res.json({ ok: true });
});

export default router;   // <-- IMPORTANTE
