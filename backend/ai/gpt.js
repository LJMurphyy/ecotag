// gpt.js
// Handles OpenAI GPT inference for tag extraction

import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-5.2";

const SYSTEM_PROMPT = `You are an expert at reading clothing care/composition tags.\nGiven an image of a garment tag, extract:\n  • country  – the country of origin or manufacture (null if not visible)\n  • materials – an array of {fiber, pct} objects for the fabric composition ([] if not visible)\n  • care – an object with exactly four keys: washing, drying, ironing, dry_cleaning. Each key must be present and set to one of the allowed values below, or null if not visible.\n    - washing: machine_wash_cold, machine_wash_warm, machine_wash_hot, machine_wash_gentle, hand_wash_cold, hand_wash_warm\n    - drying: tumble_dry_low, tumble_dry_medium, tumble_dry_high, lay_flat_to_dry, line_dry, do_not_tumble_dry\n    - ironing: iron_low, iron_medium, iron_high, do_not_iron\n    - dry_cleaning: dry_clean, dry_clean_only\nIf you cannot determine a value, use null.\nReturn ONLY the JSON object. Do not return care as a string. Be precise with percentages, fiber names, and care keys.`;

const TAG_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "clothing_tag",
    strict: true,
    schema: {
      type: "object",
      properties: {
        country: { type: ["string", "null"] },
        materials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fiber: { type: "string" },
              pct: { type: "number" },
            },
            required: ["fiber", "pct"],
            additionalProperties: false,
          },
        },
        care: {
          type: "object",
          properties: {
            washing: {
              type: ["string", "null"],
              enum: [
                "machine_wash_cold",
                "machine_wash_warm",
                "machine_wash_hot",
                "machine_wash_gentle",
                "hand_wash_cold",
                "hand_wash_warm",
                null,
              ],
            },
            drying: {
              type: ["string", "null"],
              enum: [
                "tumble_dry_low",
                "tumble_dry_medium",
                "tumble_dry_high",
                "lay_flat_to_dry",
                "line_dry",
                "do_not_tumble_dry",
                null,
              ],
            },
            ironing: {
              type: ["string", "null"],
              enum: [
                "iron_low",
                "iron_medium",
                "iron_high",
                "do_not_iron",
                null,
              ],
            },
            dry_cleaning: {
              type: ["string", "null"],
              enum: ["dry_clean", "dry_clean_only", null],
            },
          },
          required: ["washing", "drying", "ironing", "dry_cleaning"],
          additionalProperties: false,
        },
      },
      required: ["country", "materials", "care"],
      additionalProperties: false,
    },
  },
};

let openaiClient = null;

function getOpenAIClient() {
  if (openaiClient) {
    return openaiClient;
  }
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  return openaiClient;
}

export async function extractTagFromImage(dataUrl) {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          {
            type: "text",
            text: "Extract the country, materials, and care instructions from this clothing tag image.",
          },
        ],
      },
    ],
    response_format: TAG_SCHEMA,
  });
  return JSON.parse(response.choices[0].message.content);
}
