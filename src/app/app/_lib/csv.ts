export function parseCsv(text: string): string[][] {
  // Minimal CSV parser: supports quoted fields and commas/newlines.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      pushField();
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      pushRow();
      continue;
    }
    field += c;
  }

  // trailing
  if (inQuotes) inQuotes = false;
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export function normalizeHeader(h: string): string {
  return (h || "").trim().toLowerCase().replace(/\s+/g, "_");
}

