// Small CSV reader/writer (RFC 4180 quoting). Enough for the import template and list downloads.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Columns of the equipment import template (PRD F14). */
export const importColumns = [
  "Equipment type",
  "Manufacturer",
  "Model",
  "Serial number",
  "Hospital tag",
  "Service provider",
  "Home department",
  "Installed on (YYYY-MM-DD)",
  "Last PMS done on (YYYY-MM-DD)",
  "Notes",
] as const;

export function importTemplate(): string {
  return toCsv(
    [...importColumns],
    [["Ventilator", "Dräger", "Savina 300", "ASKL-0093", "", "Shrestha Medical", "ICU", "2024-03-15", "", ""]],
  );
}
