import Papa from 'papaparse';

export interface ParsedCsv<T> {
  rows: T[];
  errors: string[];
  totalRows: number;
}

export function parseCsv<T = Record<string, unknown>>(
  text: string,
): ParsedCsv<T> {
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  });
  return {
    rows: result.data,
    errors: result.errors.map((e) => `row ${e.row}: ${e.message}`),
    totalRows: result.data.length,
  };
}
