import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import request from "supertest";

import { app } from "../../server.js";
import {
  __resetTagExtractorForTest,
  __setTagExtractorForTest,
} from "../../api/tag.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureImage = path.resolve(__dirname, "../test_image.jpg");

const mockParsed = {
  country: "Portugal",
  materials: [
    { fiber: "Cotton", pct: 70 },
    { fiber: "Polyester", pct: 30 },
  ],
  care: {
    washing: "machine_wash_cold",
    drying: "line_dry",
    ironing: "iron_low",
    dry_cleaning: null,
  },
};

test.beforeEach(() => {
  __resetTagExtractorForTest();
});

test.after(() => {
  __resetTagExtractorForTest();
});

function assertTagResponseContract(body) {
  assert.ok(body && typeof body === "object");

  assert.ok(body.parsed && typeof body.parsed === "object");
  assert.ok("country" in body.parsed);
  assert.ok(Array.isArray(body.parsed.materials));
  assert.ok(body.parsed.care && typeof body.parsed.care === "object");
  assert.ok("washing" in body.parsed.care);
  assert.ok("drying" in body.parsed.care);
  assert.ok("ironing" in body.parsed.care);
  assert.ok("dry_cleaning" in body.parsed.care);

  assert.ok(body.emissions && typeof body.emissions === "object");
  assert.equal(typeof body.emissions.total_kgco2e, "number");
  assert.ok(body.emissions.breakdown && typeof body.emissions.breakdown === "object");
  assert.ok(body.emissions.assumptions && typeof body.emissions.assumptions === "object");
}

test("POST /api/tag happy path returns parsed + emissions", async (t) => {
  __setTagExtractorForTest(async () => mockParsed);
  t.after(() => __resetTagExtractorForTest());

  const res = await request(app).post("/api/tag").attach("image", fixtureImage);

  assert.equal(res.status, 200);
  assertTagResponseContract(res.body);
  assert.deepEqual(res.body.parsed, mockParsed);
});

test("POST /api/tag missing image returns stable 4xx error JSON", async () => {
  const res = await request(app).post("/api/tag");

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    error: {
      code: "MISSING_IMAGE",
      message: "An image file is required in field 'image'.",
    },
  });
});

test("POST /api/tag provider failure returns safe error JSON", async (t) => {
  __setTagExtractorForTest(async () => {
    throw new Error("OpenAI upstream timeout");
  });
  t.after(() => __resetTagExtractorForTest());

  const res = await request(app).post("/api/tag").attach("image", fixtureImage);

  assert.equal(res.status, 502);
  assert.deepEqual(res.body, {
    error: {
      code: "UPSTREAM_ERROR",
      message: "Failed to analyze image with AI provider.",
    },
  });
  assert.equal(JSON.stringify(res.body).includes("timeout"), false);
  assert.equal("stack" in (res.body.error || {}), false);
});

test("POST /api/tag contract test validates required response fields", async (t) => {
  __setTagExtractorForTest(async () => mockParsed);
  t.after(() => __resetTagExtractorForTest());

  const res = await request(app).post("/api/tag").attach("image", fixtureImage);

  assert.equal(res.status, 200);
  assertTagResponseContract(res.body);
});

const liveEnabled = process.env.E2E_LIVE === "1" && !!process.env.OPENAI_API_KEY;

if (liveEnabled) {
  test("POST /api/tag live OpenAI test", async () => {
    const res = await request(app).post("/api/tag").attach("image", fixtureImage);
    assert.equal(res.status, 200);
    assertTagResponseContract(res.body);
  });
} else {
  test("POST /api/tag live OpenAI test", { skip: true }, () => {});
}
