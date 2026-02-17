// economics.test.js
// Testing file for backend/ai/economics.js

import { estimateEconomics, LIFESPAN_MAP } from "../ai/economics.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertThrows(fn, label) {
  try {
    fn();
    console.error(`  ✗ ${label} (expected error, got none)`);
    failed++;
  } catch {
    console.log(`  ✓ ${label}`);
    passed++;
  }
}

function assertClose(a, b, label, tol = 1e-10) {
  assert(Math.abs(a - b) < tol, `${label} (${a} ≈ ${b})`);
}

// 1. Fiber mapping applied correctly
console.log("\n1. Fiber mapping from materials.json keys");

const singleFibers = ["cotton", "wool", "polyester", "nylon", "cashmere", "spandex"];
for (const fiber of singleFibers) {
  const r = estimateEconomics({ price: 100, materials: [{ fiber, pct: 100 }] });
  assert(
    r.lifespanDays === LIFESPAN_MAP[fiber],
    `"${fiber}" → ${LIFESPAN_MAP[fiber]} days`
  );
}

// 2. Weighted average across fiber blend
console.log("\n2. Weighted average for blended materials");
{
  // 80% cotton (1095) + 20% elastane (547) = (1095*80 + 547*20) / 100 = 985.4
  const expected = (LIFESPAN_MAP.cotton * 80 + LIFESPAN_MAP.elastane * 20) / 100;
  const r = estimateEconomics({
    price: 50,
    materials: [
      { fiber: "cotton", pct: 80 },
      { fiber: "elastane", pct: 20 },
    ],
  });
  assertClose(r.lifespanDays, expected, "80% cotton / 20% elastane weighted avg");
}
{
  // 60% polyester + 40% wool
  const expected = (LIFESPAN_MAP.polyester * 60 + LIFESPAN_MAP.wool * 40) / 100;
  const r = estimateEconomics({
    price: 120,
    materials: [
      { fiber: "polyester", pct: 60 },
      { fiber: "wool", pct: 40 },
    ],
  });
  assertClose(r.lifespanDays, expected, "60% polyester / 40% wool weighted avg");
}

// 3. Lifespan override respected
console.log("\n3. Lifespan override");
{
  const r = estimateEconomics({
    price: 80,
    materials: [{ fiber: "cotton", pct: 100 }],
    lifespanDays: 730,
  });
  assert(r.lifespanDays === 730, "lifespanDays override takes precedence over materials");
  assertClose(r.costPerDay, 80 / 730, "costPerDay uses override lifespan");
}

// 4. Baseline comparison math correct
console.log("\n4. Baseline comparison");
{
  // 100% cotton → 1095 days
  // baselineCostForPeriod = (30/180) * 1095 = 182.5
  // savingsVsBaseline = 182.5 - 100 = 82.5
  const r = estimateEconomics({ price: 100, materials: [{ fiber: "cotton", pct: 100 }] });
  const expectedBaseline = (30 / 180) * LIFESPAN_MAP.cotton;
  const expectedSavings = expectedBaseline - 100;
  assertClose(r.savingsVsBaseline, expectedSavings, "savingsVsBaseline formula (cotton)");
}
{
  const r = estimateEconomics({ price: 10, materials: [{ fiber: "cotton", pct: 100 }] });
  assert(r.savingsVsBaseline > 0, "cheap garment yields positive savings vs baseline");
}

// 5. Negative savings ?
console.log("\n5. Negative savings");
{
  // Cashmere lasts 3650 days, baseline covers (30/180)*3650 = 608 — far below a $2000 coat
  const r = estimateEconomics({ price: 2000, materials: [{ fiber: "cashmere", pct: 100 }] });
  assert(r.savingsVsBaseline < 0, "expensive cashmere coat yields negative savings");
}

// 6. Deterministic outputs and referential transparency
console.log("\n6. Determinism");
{
  const mats = [{ fiber: "wool", pct: 100 }];
  const r1 = estimateEconomics({ price: 75, materials: mats });
  const r2 = estimateEconomics({ price: 75, materials: mats });
  assert(
    r1.costPerDay === r2.costPerDay &&
      r1.lifespanDays === r2.lifespanDays &&
      r1.savingsVsBaseline === r2.savingsVsBaseline,
    "Same inputs produce identical outputs"
  );
}

// 7. Testing unknown fiber and default fallbacks
console.log("\n7. Unknown fiber → default");
{
  const r = estimateEconomics({ price: 50, materials: [{ fiber: "bamboo", pct: 100 }] });
  assert(r.lifespanDays === LIFESPAN_MAP.default, "Unknown fiber uses default lifespan");
}
{
  const r = estimateEconomics({ price: 50 }); // no materials
  assert(r.lifespanDays === LIFESPAN_MAP.default, "Missing materials uses default lifespan");
}
{
  const r = estimateEconomics({ price: 50, materials: [] }); // empty array
  assert(r.lifespanDays === LIFESPAN_MAP.default, "Empty materials array uses default lifespan");
}

// 8. Edge cases / validation for error handling and stuff
console.log("\n8. Edge cases");
assertThrows(() => estimateEconomics({ materials: [{ fiber: "cotton", pct: 100 }] }), "Missing price throws");
assertThrows(() => estimateEconomics({ price: 0, materials: [{ fiber: "cotton", pct: 100 }] }), "price=0 throws");
assertThrows(() => estimateEconomics({ price: -10, materials: [{ fiber: "cotton", pct: 100 }] }), "price<0 throws");
assertThrows(
  () => estimateEconomics({ price: 50, materials: [{ fiber: "cotton", pct: 100 }], lifespanDays: 0 }),
  "lifespanDays=0 throws"
);
assertThrows(
  () => estimateEconomics({ price: 50, materials: [{ fiber: "cotton", pct: 100 }], lifespanDays: -5 }),
  "lifespanDays<0 throws"
);
{
  const r = estimateEconomics({ price: 120, materials: [{ fiber: "wool", pct: 100 }] });
  assert(r.lifetimeCost === 120, "lifetimeCost equals price");
}

// Summary log
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
