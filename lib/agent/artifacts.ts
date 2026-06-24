import ExcelJS from "exceljs";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx";

/**
 * Geração de artefatos baixáveis pelo agente.
 *
 * Texto puro (sem deps): md, txt, csv, json, html.
 * Office nativo (via libs): xlsx (exceljs) e docx (docx).
 *   - xlsx: o `conteudo` é um CSV → planilha estilizada (cabeçalho em negrito, filtro, larguras).
 *   - docx: o `conteudo` é Markdown → documento Word real (títulos, listas, tabelas, negrito).
 *
 * Cada artefato vira base64 + mime + filename, entregue inline no resultado da
 * ferramenta. O cliente monta um Blob e oferece o download.
 */

export type ArtifactFormat = "md" | "txt" | "csv" | "json" | "html" | "xlsx" | "docx";

export interface Artifact {
  filename: string;
  mime: string;
  base64: string;
  bytes: number;
  format: ArtifactFormat;
}

const MIME: Record<ArtifactFormat, string> = {
  md:   "text/markdown",
  txt:  "text/plain",
  csv:  "text/csv",
  json: "application/json",
  html: "text/html",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Remove caracteres inválidos de nome de arquivo e força a extensão certa. */
function safeName(name: string, format: ArtifactFormat): string {
  const base = (name || "artefato")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim() || "artefato";
  return `${base}.${format}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Envolve um fragmento HTML num documento estilizado e imprimível (→ PDF). */
function wrapHtml(title: string, body: string): string {
  if (/<html[\s>]/i.test(body) || /<!doctype/i.test(body)) return body;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 15px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 820px; margin: 40px auto; padding: 0 24px; }
  h1, h2, h3 { line-height: 1.25; margin: 1.4em 0 .5em; }
  h1 { font-size: 1.9em; border-bottom: 2px solid #eee; padding-bottom: .3em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .92em; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
  th { background: #f5f5f7; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  code { background: #f3f3f5; padding: 2px 5px; border-radius: 4px; font-size: .9em; }
  @media print { body { margin: 0; max-width: none; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/* ── CSV ──────────────────────────────────────────────────────── */

/** Parse simples de CSV (suporta aspas e vírgulas escapadas). */
function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const all = lines.map(parseLine);
  return { columns: all[0] ?? [], rows: all.slice(1) };
}

/** Converte linhas (objetos) em texto CSV — útil pra exportar resultados de query. */
export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(esc).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/* ── XLSX (exceljs) ───────────────────────────────────────────── */

async function buildXlsx(name: string, csv: string): Promise<Buffer> {
  const { columns, rows } = parseCsv(csv);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Maestro";
  const ws = wb.addWorksheet("Dados");

  ws.addRow(columns);
  rows.forEach((r) => ws.addRow(r));

  // Cabeçalho em negrito com fundo.
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
  header.alignment = { vertical: "middle" };

  // Largura automática por coluna (limitada).
  ws.columns.forEach((col, i) => {
    let max = String(columns[i] ?? "").length;
    rows.forEach((r) => { max = Math.max(max, String(r[i] ?? "").length); });
    col.width = Math.min(Math.max(max + 2, 10), 60);
  });

  if (columns.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/* ── DOCX (docx) ──────────────────────────────────────────────── */

/** Divide texto em runs alternando negrito por **...**. */
function inlineRuns(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    const bold = /^\*\*[^*]+\*\*$/.test(p);
    return new TextRun({ text: bold ? p.slice(2, -2) : p, bold });
  });
}

const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" };

function mdTable(lines: string[]): Table {
  const cells = (line: string) =>
    line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = cells(lines[0]);
  const bodyLines = lines.slice(2); // pula a linha separadora |---|
  const rows: TableRow[] = [];

  rows.push(new TableRow({
    children: header.map((h) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
      shading: { fill: "F5F5F7" },
    })),
  }));
  bodyLines.forEach((line) => {
    const cs = cells(line);
    rows.push(new TableRow({
      children: header.map((_, i) => new TableCell({
        children: [new Paragraph({ children: inlineRuns(cs[i] ?? "") })],
      })),
    }));
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: TABLE_BORDER, bottom: TABLE_BORDER, left: TABLE_BORDER, right: TABLE_BORDER, insideHorizontal: TABLE_BORDER, insideVertical: TABLE_BORDER },
  });
}

/** Conversão leve de Markdown → elementos docx (títulos, listas, tabelas, parágrafos). */
function markdownToDocx(md: string): (Paragraph | Table)[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: (Paragraph | Table)[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Tabela markdown: bloco de linhas começando com |
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|?$/)) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { block.push(lines[i].trim()); i++; }
      out.push(mdTable(block));
      out.push(new Paragraph({ text: "" }));
      continue;
    }

    if (/^#\s+/.test(trimmed)) out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: inlineRuns(trimmed.replace(/^#\s+/, "")) }));
    else if (/^##\s+/.test(trimmed)) out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: inlineRuns(trimmed.replace(/^##\s+/, "")) }));
    else if (/^###\s+/.test(trimmed)) out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: inlineRuns(trimmed.replace(/^###\s+/, "")) }));
    else if (/^[-*]\s+/.test(trimmed)) out.push(new Paragraph({ bullet: { level: 0 }, children: inlineRuns(trimmed.replace(/^[-*]\s+/, "")) }));
    else if (trimmed === "") out.push(new Paragraph({ text: "" }));
    else out.push(new Paragraph({ children: inlineRuns(trimmed) }));
    i++;
  }
  return out;
}

async function buildDocx(name: string, md: string): Promise<Buffer> {
  const doc = new Document({
    creator: "Maestro",
    title: name,
    sections: [{ children: markdownToDocx(md) }],
  });
  return Packer.toBuffer(doc);
}

/* ── Entry point ──────────────────────────────────────────────── */

/** Constrói um artefato baixável a partir do conteúdo produzido pelo agente. */
export async function buildArtifact(format: ArtifactFormat, name: string, content: string): Promise<Artifact> {
  let buf: Buffer;

  if (format === "xlsx") {
    buf = await buildXlsx(name, content ?? "");
  } else if (format === "docx") {
    buf = await buildDocx(name, content ?? "");
  } else {
    let text = content ?? "";
    if (format === "html") text = wrapHtml(name, text);
    if (format === "json") {
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* mantém */ }
    }
    buf = Buffer.from(text, "utf8");
  }

  return {
    filename: safeName(name, format),
    mime: MIME[format],
    base64: buf.toString("base64"),
    bytes: buf.byteLength,
    format,
  };
}
