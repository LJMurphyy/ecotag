export interface ScanRecord {
  id: string;
  created_at: number;
  success: 0 | 1;
  co2e_grams: number;
  display_name: string | null;
  category: string | null;
  error_code: string | null;
  result_json: string | null;
}

export interface NewScanRecord {
  id: string;
  created_at: number;
  success: 0 | 1;
  co2e_grams: number;
  display_name: string | null;
  category: string | null;
  error_code: string | null;
  result: unknown;
}
