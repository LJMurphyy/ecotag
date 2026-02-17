// tag.js
// Dummy Express API route for tag analysis

import express from "express";
import multer from "multer";
import { extractTagFromImage } from "../ai/gpt.js";
import { estimateEmissions } from "../ai/emissions.js";
import { estimateEconomics } from "../ai/economics.js";
import fs from "node:fs";
import path from "node:path";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// POST /api/tag - Accepts image upload, returns tag info, CO2 estimate, and economic metrics.
// Form fields: image (file), price (number, required), category (string, optional)
router.post("/tag", upload.single("image"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : "image/jpeg";
    const b64 = fs.readFileSync(filePath, "base64");
    const dataUrl = `data:${mime};base64,${b64}`;

    // Call GPT to extract tag info
    const parsed = await extractTagFromImage(dataUrl);
    // Calculate emissions
    const emissions = estimateEmissions(parsed);

    // Calculate economic metrics
    const rawPrice = req.body?.price;
    if (rawPrice == null || rawPrice === "") {
      return res.status(400).json({ error: "Missing required field: price" });
    }
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "price must be a positive number" });
    }
    const economic = estimateEconomics({ price, materials: parsed.materials });

    res.json({ parsed, emissions, economic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    // Always clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

export default router;
