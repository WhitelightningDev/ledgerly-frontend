function parseDelimited(text: string, delimiter: string): string[][] {
  // Minimal delimited-text parser: supports quoted fields and delimiter/newlines.
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
    if (c === delimiter) {
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

function detectDelimiter(text: string): string {
  const firstLine = (text || "").split(/\r?\n/, 1)[0] ?? "";
  const comma = (firstLine.match(/,/g) || []).length;
  const semi = (firstLine.match(/;/g) || []).length;
  const tab = (firstLine.match(/\t/g) || []).length;
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma) return ";";
  return ",";
}

export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  return parseDelimited(text, delimiter);
}

export function normalizeHeader(h: string): string {
  return (h || "").trim().toLowerCase().replace(/\s+/g, "_");
}
