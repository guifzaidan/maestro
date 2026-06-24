import ExcelJS from "exceljs";
import mammoth from "mammoth";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const TEXT_TYPES = ["text/plain", "text/csv", "text/markdown", "application/json"];

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return json({ error: "Envie o arquivo como multipart/form-data." }, 400);

  const file = formData.get("file") as File | null;
  if (!file) return json({ error: "Campo 'file' ausente." }, 400);
  if (file.size > MAX_BYTES) return json({ error: `Arquivo muito grande (máx. 20 MB).` }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const name = file.name;

  try {
    // Imagens — Claude Vision nativo
    if (IMAGE_TYPES.includes(mime)) {
      return json({ type: "image", filename: name, mimeType: mime, content: buffer.toString("base64") });
    }

    // PDF — Claude Document nativo
    if (mime === "application/pdf") {
      return json({ type: "pdf", filename: name, mimeType: "application/pdf", content: buffer.toString("base64") });
    }

    // Excel — converte para CSV
    if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || name.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
      const lines: string[] = [];
      wb.eachSheet((sheet) => {
        lines.push(`## Aba: ${sheet.name}`);
        sheet.eachRow((row) => {
          const vals = (row.values as (ExcelJS.CellValue | undefined)[]).slice(1);
          lines.push(
            vals.map((v) => {
              if (v == null) return "";
              if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: string }).text);
              return String(v);
            }).join(",")
          );
        });
      });
      return json({ type: "text", filename: name, content: lines.join("\n") });
    }

    // Word — extrai texto com mammoth
    if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return json({ type: "text", filename: name, content: result.value });
    }

    // Texto puro (.txt, .csv, .md, .json, etc.)
    if (TEXT_TYPES.some((t) => mime.startsWith(t)) || /\.(txt|csv|md|json|xml|yaml|yml|log)$/i.test(name)) {
      return json({ type: "text", filename: name, content: buffer.toString("utf-8") });
    }

    return json({ error: `Tipo de arquivo não suportado: ${mime || name}` }, 415);
  } catch (e) {
    return json({ error: `Erro ao processar arquivo: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
