// tag.js
// Dummy Express API route for tag analysis

import express from "express";
import multer from "multer";
import * as gpt from "../ai/gpt.js";
import { estimateEmissions } from "../ai/emissions.js";
import fs from "node:fs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });
let tagExtractor = gpt.extractTagFromImage;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeParsedForEmissions(parsed) {
  const normalized = isPlainObject(parsed) ? parsed : {};
  const careInput = isPlainObject(normalized.care) ? normalized.care : {};

  normalized.care = {
    washing: careInput.washing ?? null,
    drying: careInput.drying ?? null,
    ironing: careInput.ironing ?? null,
    dry_cleaning: careInput.dry_cleaning ?? null,
  };

  return normalized;
}

function withFallbackCareForEmissions(parsed) {
  const care = isPlainObject(parsed?.care) ? parsed.care : {};
  return {
    ...parsed,
    care: {
      washing: care.washing || "machine_wash_cold",
      drying: care.drying ?? null,
      ironing: care.ironing ?? null,
      dry_cleaning: care.dry_cleaning ?? null,
    },
  };
}

export function __setTagExtractorForTest(extractor) {
  tagExtractor = extractor;
}

export function __resetTagExtractorForTest() {
  tagExtractor = gpt.extractTagFromImage;
}

// POST /api/tag - Accepts image upload, returns tag info, CO2 estimate, and economic metrics.
// Form fields: image (file), price (number, required), category (string, optional)
router.post("/tag", upload.single("image"), async (req, res) => {
  const filePath = req.file?.path;
  if (!filePath) {
    return res.status(400).json({
      error: {
        code: "MISSING_IMAGE",
        message: "An image file is required in field 'image'.",
      },
    });
  }

  try {
    const mime = req.file.mimetype || "image/jpeg";
    const b64 = fs.readFileSync(filePath, "base64");
    const dataUrl = `data:${mime};base64,${b64}`;

    // Call GPT to extract tag info
    let parsed;
    try {
      parsed = await tagExtractor(dataUrl);
    } catch {
      return res.status(502).json({
        error: {
          code: "UPSTREAM_ERROR",
          message: "Failed to analyze image with AI provider.",
        },
      });
    }
    console.log("[tag] GPT parsed:", JSON.stringify(parsed, null, 2));
    parsed = normalizeParsedForEmissions(parsed);
    // Calculate emissions
    let emissions;
    try {
      emissions = estimateEmissions(parsed);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("Care instructions must be a structured object")
      ) {
        emissions = estimateEmissions(withFallbackCareForEmissions(parsed));
      } else {
        throw err;
      }
    }

    res.json({ parsed, emissions });
  } catch {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
      },
    });
  } finally {
    // Always clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

export default router;
