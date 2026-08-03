"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { JSONContent } from "@tiptap/react";

/**
 * Editor da descrição da task. Formata enquanto digita: "- " vira bullet e
 * "[] " vira checkbox, na hora, sem sair pra um "modo leitura".
 *
 * O banco continua guardando TEXTO PURO com marcadores ("- item", "[] item",
 * "[x] item") — a conversão acontece aqui na entrada e na saída. Assim as
 * descrições antigas seguem valendo e nada mais no app precisa entender HTML.
 */

const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;
const CHECK_RE = /^(\s*)(?:[-*]\s+)?\[([ xX]?)\]\s?(.*)$/;
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Escapa e transforma URLs em <a> (o autolink do Tiptap só age ao digitar). */
function inline(text: string): string {
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    let url = m[0];
    let trail = "";
    const t = /[.,;:!?)\]]+$/.exec(url);
    if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
    const href = url.startsWith("http") ? url : `https://${url}`;
    out += `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
    out += escapeHtml(trail);
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/** Texto puro (com marcadores) → HTML que o Tiptap entende. */
export function textToHtml(text: string): string {
  if (!text.trim()) return "";
  const lines = text.split("\n");
  const html: string[] = [];
  let list: { type: "bullet" | "task"; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    html.push(
      list.type === "bullet"
        ? `<ul>${list.items.join("")}</ul>`
        : `<ul data-type="taskList">${list.items.join("")}</ul>`,
    );
    list = null;
  };

  for (const line of lines) {
    const check = CHECK_RE.exec(line);
    if (check) {
      const done = check[2].toLowerCase() === "x";
      if (list?.type !== "task") { flush(); list = { type: "task", items: [] }; }
      list.items.push(
        `<li data-type="taskItem" data-checked="${done}"><p>${inline(check[3])}</p></li>`,
      );
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      if (list?.type !== "bullet") { flush(); list = { type: "bullet", items: [] }; }
      list.items.push(`<li><p>${inline(bullet[2])}</p></li>`);
      continue;
    }
    flush();
    html.push(line.trim() ? `<p>${inline(line)}</p>` : "<p></p>");
  }
  flush();
  return html.join("");
}

/** Concatena o texto de um nó (mantendo o texto dos links). */
function nodeText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodeText).join("");
}

/** Documento do Tiptap → texto puro com marcadores (o que vai pro banco). */
export function docToText(doc: JSONContent): string {
  const lines: string[] = [];

  const walk = (nodes: JSONContent[], depth: number) => {
    for (const node of nodes) {
      const indent = "  ".repeat(depth);
      switch (node.type) {
        case "paragraph":
          lines.push(indent + nodeText(node));
          break;
        case "bulletList":
        case "orderedList":
          for (const li of node.content ?? []) {
            const blocks = li.content ?? [];
            const [first, ...rest] = blocks;
            lines.push(`${indent}- ${first ? nodeText(first) : ""}`);
            if (rest.length) walk(rest, depth + 1);
          }
          break;
        case "taskList":
          for (const li of node.content ?? []) {
            const blocks = li.content ?? [];
            const [first, ...rest] = blocks;
            const mark = li.attrs?.checked ? "[x]" : "[]";
            lines.push(`${indent}${mark} ${first ? nodeText(first) : ""}`);
            if (rest.length) walk(rest, depth + 1);
          }
          break;
        default:
          lines.push(indent + nodeText(node));
      }
    }
  };

  walk(doc.content ?? [], 0);
  // Tira linhas em branco sobrando no fim (o editor sempre mantém um parágrafo).
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join("\n");
}

export function DescriptionEditor({
  value,
  onChange,
  placeholder,
  maxHeight = 240,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  maxHeight?: number;
}) {
  // Guarda o último texto emitido pra não reescrever o editor com o que ele
  // mesmo acabou de produzir (isso mataria o cursor a cada tecla).
  const emitted = useRef(value);

  const editor = useEditor({
    immediatelyRender: false, // evita mismatch de hidratação no Next
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: { openOnClick: true, autolink: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: textToHtml(value),
    editorProps: { attributes: { class: "desc-prose" } },
    onUpdate: ({ editor }) => {
      const text = docToText(editor.getJSON());
      emitted.current = text;
      onChange(text);
    },
  });

  // Sincroniza quando o valor muda POR FORA (ex: abrir outra task).
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(textToHtml(value), { emitUpdate: false });
  }, [value, editor]);

  return (
    <div
      className="desc-editor overflow-y-auto rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90"
      style={{
        maxHeight,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
      onClick={() => editor?.commands.focus()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
