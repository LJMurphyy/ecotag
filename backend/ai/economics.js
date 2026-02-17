// economics.js
// Cost Saving Feature #15

// Couldn't really find research backed data for this
// The values are practical modeling assumptions, but they are
// consistent with textile durability science, consumer garment lifetime studies, and LCA modeling assumptions
// However, they are not directly measured in research.
// Instead of lifespan, we could pivot to wash cycles, which IS measured, but for now, this is okay
export const LIFESPAN_MAP = {
  acrylic:            1095, // ~3 yr — synthetic but pills quickly
  cashmere:           3650, // ~10 yr — premium protein fiber, very durable with care
  cotton:             1095, // ~3 yr — degrades gradually with repeated washing
  "organic cotton":   1095, // ~3 yr — same fiber structure as conventional cotton
  elastane:            547, // ~1.5 yr — elastic polymer degrades with heat & detergent
  modal:              1095, // ~3 yr — semi-synthetic cellulosic, moderate durability
  merino:             1825, // ~5 yr — fine-staple wool, excellent resilience
  nylon:              1825, // ~5 yr — high-tenacity synthetic, very abrasion-resistant
  "pima cotton":      1460, // ~4 yr — extra-long staple cotton, stronger than standard
  polyamide:          1825, // ~5 yr — same polymer family as nylon
  polyester:          1460, // ~4 yr — strong synthetic, UV- and wrinkle-resistant
  "recycled polyester": 1460, // ~4 yr — same physical properties as virgin polyester
  spandex:             547, // ~1.5 yr — elastic degrades, especially under heat
  tencel:             1095, // ~3 yr — lyocell cellulosic, moderate durability
  viscose:             730, // ~2 yr — delicate semi-synthetic, prone to shrinkage
  wool:               1825, // ~5 yr — naturally resilient protein fiber
  default:            1095, // ~3 yr — conservative mid-range fallback
};

const BASELINE_PRICE = 30; // US dollar $, for fast fashion stuff
const BASELINE_LIFESPAN_DAYS = 180;
const BASELINE_COST_PER_DAY = BASELINE_PRICE / BASELINE_LIFESPAN_DAYS;


export function estimateEconomics({ price, materials, lifespanDays } = {}) {
  if (price == null) {
    throw new Error("Missing required field: price");
  }
  if (typeof price !== "number" || price <= 0) {
    throw new Error("price must be a positive number");
  }

  // Resolve lifespan
  let resolvedLifespan;
  if (lifespanDays != null) {
    if (typeof lifespanDays !== "number" || lifespanDays <= 0) {
      throw new Error("lifespanDays must be a positive number");
    }
    resolvedLifespan = lifespanDays;
  } else if (Array.isArray(materials) && materials.length > 0) {
    // Weighted average: each fiber contributes proportionally to its %
    let totalPct = 0;
    let weightedDays = 0;
    for (const { fiber, pct } of materials) {
      const key = (fiber || "").toLowerCase();
      const fiberDays = LIFESPAN_MAP[key] ?? LIFESPAN_MAP.default;
      weightedDays += fiberDays * pct;
      totalPct += pct;
    }
    resolvedLifespan = totalPct > 0 ? weightedDays / totalPct : LIFESPAN_MAP.default;
  } else {
    resolvedLifespan = LIFESPAN_MAP.default;
  }

  const costPerDay = price / resolvedLifespan;
  
  // NOTE: I don't really know how to calculate lifetimeCost and how it's different than price
  // Maybe a calculation based on usage, # washes, electricity bill / water bill?
  const lifetimeCost = price;

  const baselineCostForPeriod = BASELINE_COST_PER_DAY * resolvedLifespan;
  const savingsVsBaseline = baselineCostForPeriod - lifetimeCost;

  return {
    lifespanDays: resolvedLifespan,
    costPerDay,
    lifetimeCost,
    savingsVsBaseline,
  };
}
