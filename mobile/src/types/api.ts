/** same as Python schemas.py */
export interface MaterialComponent {
  fiber: string;
  pct: number;
}

/** Parsed payload returned by POST /api/tag */
export interface ParsedTag {
  country: string | null;
  materials: MaterialComponent[];
  care: {
    washing: string | null;
    drying: string | null;
    ironing: string | null;
    dry_cleaning: string | null;
  };
}

/** Emissions payload returned by POST /api/tag */
export interface TagEmissions {
  total_kgco2e: number;
  breakdown: Record<string, number>;
  assumptions: Record<string, string | number>;
}

/** Response from backend POST /api/tag */
export interface TagApiResponse {
  parsed: ParsedTag;
  emissions: TagEmissions;
}

/** Maps breakdown keys to human-readable row labels */
export const BREAKDOWN_LABELS: Record<string, string> = {
  materials: "Material",
  manufacturing: "Production",
  washing: "Washing",
  drying: "Drying",
  ironing: "Ironing",
  dry_cleaning: "Dry Cleaning",
};

/** Display order for breakdown rows */
export const BREAKDOWN_ORDER: string[] = [
  "materials",
  "manufacturing",
  "washing",
  "drying",
  "ironing",
  "dry_cleaning",
];
