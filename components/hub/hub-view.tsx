"use client";

import { useState, useRef, useEffect, useCallback, memo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { Icon } from "@/components/ui/icon";
import { PageTransition } from "@/components/shell/page-transition";
import { CONNECTORS } from "@/lib/mock/integrations";
import { cn } from "@/lib/utils";
import { streamAgent, toolLabel, describeTool, groupLabel, friendlyAgentError, type AgentMessage, type AgentAttachment } from "@/lib/agent/client";
import { DatePicker } from "@/components/ui/date-picker";
import { useIsMobile } from "@/lib/use-is-mobile";
import { HeroBackground, type HeroBackgroundVariant } from "@/components/hub/backgrounds/hero-background";

/** Fundo da tela principal. Troque aqui, ou em runtime via ?bg=aurora|colorbends|colorbends3. */
const DEFAULT_HERO_BG: HeroBackgroundVariant = "colorbends3";

interface ChatMessage { id: string; role: "user" | "assistant" | "log" | "artifact" | "choice" | "progress"; content: string; artifact?: ArtifactData; options?: string[]; attachments?: AgentAttachment[]; progressDone?: number; progressTotal?: number; }
interface MindNode   { id: string; label: string; value: string; type: "branch" | "tools" | "deadline" | "text"; }
interface ArtifactData { filename: string; mime: string; base64: string; bytes: number; format?: string; }
interface ExecEvent  { id: string; type: "log" | "assistant" | "user" | "done" | "artifact"; content: string; artifact?: ArtifactData; }

/* ── Web Speech API (transcrição nativa, grátis) ───────────────── */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

/** Cria um SpeechRecognition se o navegador suportar (Chrome/Edge). null se não. */
function createRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "pt-BR";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

/** Render leve de markdown inline: **negrito** e `código`. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return (
      <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]">{p.slice(1, -1)}</code>
    );
    return <span key={i}>{p}</span>;
  });
}

/**
 * Render de markdown com suporte a listas (- item), negrito e código.
 * Agrupa linhas consecutivas com "- " em <ul><li> com bullets reais.
 */
function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let tableRows: string[][] = [];
  let tableHasHeader = false;
  let key = 0;

  const parseTableCells = (line: string) =>
    line.split("|").slice(1, -1).map((c) => c.trim());

  const isTableSep = (line: string) => /^\|?[\s|:-]+\|/.test(line);

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={key++} className="my-1 list-disc space-y-0.5 pl-4">
        {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
      </ul>
    );
    listItems = [];
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    const [head, ...body] = tableRows;
    blocks.push(
      <div key={key++} className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          {tableHasHeader && head ? (
            <thead>
              <tr>
                {head.map((cell, i) => (
                  <th key={i} className="border border-white/10 px-3 py-1.5 text-left font-semibold text-white/90"
                    style={{ background: "rgba(255,255,255,0.07)" }}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {(tableHasHeader ? body : tableRows).map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-white/10 px-3 py-1.5 text-white/75">
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    tableHasHeader = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith("|") && line.trim().endsWith("|");

    if (isTableLine) {
      flushList();
      if (isTableSep(line)) {
        // linha separadora → a primeira linha acumulada é o header
        tableHasHeader = true;
      } else {
        tableRows.push(parseTableCells(line));
      }
      continue;
    }

    flushTable();

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
    } else {
      flushList();
      if (line.trim()) {
        blocks.push(<span key={key++} className="block">{renderInline(line)}</span>);
      } else if (blocks.length) {
        blocks.push(<span key={key++} className="block h-1" />);
      }
    }
  }

  flushList();
  flushTable();

  return <>{blocks}</>;
}

/** Tokens em formato compacto: 1.2M, 340k, 980. */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}

/** Custo em USD com casas conforme a magnitude. */
function fmtUsd(n: number): string {
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

/** Converte base64 → Blob e dispara o download no navegador. */
function downloadArtifact(a: ArtifactData) {
  const bin = atob(a.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = a.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Decodifica o base64 do artefato em texto UTF-8 (para preview de HTML). */
function artifactToText(a: ArtifactData): string {
  const bin = atob(a.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Uma linha do chat (balão / log / artefato / escolha). MEMOIZADO: durante o
 * streaming só re-renderiza o balão cujo conteúdo mudou — os outros (incl. os
 * grandes, com blur) ficam parados, mantendo o glass fluido.
 */
const MessageRow = memo(function MessageRow({ msg, chatBusy, onPick, onPreview }: {
  msg: ChatMessage;
  chatBusy: boolean;
  onPick: (id: string, opt: string) => void;
  onPreview: (a: ArtifactData) => void;
}) {
  if (msg.role === "log") return (
    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }} className="flex items-center gap-2 pl-1">
      <span className="h-1 w-1 flex-shrink-0 rounded-full bg-white/25" />
      <span className="text-[12px] text-white/40">{msg.content}</span>
    </motion.div>
  );

  if (msg.role === "progress") {
    const total = msg.progressTotal ?? 1;
    const done = Math.min(msg.progressDone ?? 0, total);
    const complete = done >= total;
    const pct = Math.round((done / total) * 100);
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex w-full max-w-[300px] items-center gap-2.5 rounded-xl px-3 py-2"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          {complete
            ? <Icon name="CheckCheck" size={14} strokeWidth={2.2} className="text-emerald-400" />
            : <Icon name="Loader" size={14} strokeWidth={2} className="animate-spin text-white/55" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-white/55">{msg.content}</span>
            <span className="flex-shrink-0 font-mono text-[11px] text-white/40">{done}/{total} · {pct}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <motion.div className="h-full rounded-full"
              style={{ background: complete ? "#34d399" : "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.8))" }}
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 28 }} />
          </div>
        </div>
      </motion.div>
    );
  }

  if (msg.role === "artifact" && msg.artifact) {
    const a = msg.artifact;
    const canPreview = a.format === "html";
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3"
        style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.14)" }}>
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(255,255,255,0.10)" }}>
          <Icon name={canPreview ? "LayoutDashboard" : "FileText"} size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">{a.filename}</p>
          <p className="text-[11px] text-white/40">{(a.format ?? "arquivo").toUpperCase()} · {(a.bytes / 1024).toFixed(1)} KB{canPreview ? " · preview + baixar" : " · baixar"}</p>
        </div>
        {canPreview && (
          <motion.button onClick={() => onPreview(a)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            title="Ver preview" aria-label="Ver preview"
            className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <Icon name="Eye" size={15} strokeWidth={2} />
          </motion.button>
        )}
        <motion.button onClick={() => downloadArtifact(a)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          title="Baixar" aria-label="Baixar"
          className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-colors hover:text-white"
          style={{ background: "rgba(255,255,255,0.08)" }}>
          <Icon name="Download" size={15} strokeWidth={2} />
        </motion.button>
      </motion.div>
    );
  }

  if (msg.role === "choice") return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }} className="flex flex-col items-start gap-2">
      {msg.content && (
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed"
          style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)" }}>
          {renderInline(msg.content)}
        </div>
      )}
      {(msg.options ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {msg.options!.map((opt, i) => (
            <motion.button key={i} onClick={() => onPick(msg.id, opt)} disabled={chatBusy}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              className="cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/90 transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
              {opt}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );

  // Balão de conversa (user / assistant).
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
      {/* Chips de anexos do usuário */}
      {msg.role === "user" && msg.attachments?.length ? (
        <div className="mb-1 flex flex-wrap justify-end gap-1.5">
          {msg.attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-white/60"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Icon name={a.type === "image" ? "Image" : a.type === "pdf" ? "FileText" : "File"} size={11} strokeWidth={2} />
              <span className="max-w-[140px] truncate">{a.filename}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed", msg.role === "user" ? "rounded-br-sm whitespace-pre-wrap" : "rounded-bl-sm")}
        style={msg.role === "user" ? { background: "rgba(255,255,255,0.10)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }
          : { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)" }}>
        {msg.role === "assistant" ? (msg.content ? renderMarkdown(msg.content) : "…") : msg.content}
      </div>
    </motion.div>
  );
});

type Phase = "idle" | "choosing" | "panel" | "chat" | "confirm" | "executing";
type InputMode = "text" | "audio";

export function HubView() {
  const { active, setActive, branches, activeWorkspace: activeWs } = useWorkspace();
  const isMobile = useIsMobile();
  // Fundo da hero: ?bg=aurora|colorbends sobrescreve o padrão (pra testar ao vivo).
  // Inicia no default (estável no SSR) e só aplica a query após montar — senão
  // o HTML do servidor diverge do cliente e dá erro de hidratação.
  const [bgVariant, setBgVariant] = useState<HeroBackgroundVariant>(DEFAULT_HERO_BG);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("bg");
    if (q === "aurora" || q === "colorbends" || q === "colorbends3") setBgVariant(q);
  }, []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<InputMode>("text");
  const [selected, setSelected] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [linked, setLinked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioPhase, setAudioPhase] = useState<"listening" | "processing" | "done">("listening");
  const [micError, setMicError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");  // transcrição ao vivo (Web Speech API)
  const [voiceMode, setVoiceMode] = useState(false);  // conversa por voz ativa (escuta + fala)
  const [speaking, setSpeaking] = useState(false);    // maestro falando (TTS)
  const [micActive, setMicActive] = useState(false);  // mic captando agora
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStep, setChatStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [activity, setActivity] = useState<string | null>(null); // rótulo do que o maestro está fazendo
  const [chatBusy, setChatBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<AgentAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [usage, setUsage] = useState<{ tokensUsed: number; costUsd: number } | null>(null);
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mindNodes, setMindNodes] = useState<MindNode[]>([]);
  const [execEvents, setExecEvents] = useState<ExecEvent[]>([]);
  const [execInput, setExecInput] = useState("");
  const [execWaiting, setExecWaiting] = useState(false);
  const [execFinished, setExecFinished] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoundRef = useRef<number>(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<string>(""); // transcrição final acumulada
  const chatEndRef = useRef<HTMLDivElement>(null);
  const execEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const execInputRef = useRef<HTMLInputElement>(null);
  const doAutoSubmitRef = useRef<(() => void) | null>(null);
  const agentConvoRef = useRef<AgentMessage[]>([]);
  const agentBufferRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const chatBranchRef = useRef("");  // branch fixada pela conversa (vazio = home/orquestrador)
  const voiceModeRef = useRef(false);   // espelho de voiceMode p/ closures
  const startedChatRef = useRef(false); // sessão de áudio já abriu o chat
  const turnDoneRef = useRef(true);     // turno atual do agente terminou

  const ws = selected ? getWorkspace(selected) : null;
  const tools = selected ? CONNECTORS.filter((c) => c.scopes.includes(selected) && c.id !== "claude") : [];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input, selected]);

  useEffect(() => {
    if (phase === "panel" && mode === "audio") startMic();
    else stopMic();
    return () => stopMic();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode]);

  // Ao desmontar (sair da home), corta qualquer fala em andamento.
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Uso REAL do mês (tokens + custo estimado) — atualiza ao abrir o chat.
  const fetchUsage = useCallback(async () => {
    try {
      const r = await fetch("/api/usage");
      const d = await r.json();
      setUsage({ tokensUsed: Number(d.tokensUsed ?? 0), costUsd: Number(d.costUsd ?? 0) });
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    if (phase === "chat") void fetchUsage();
  }, [phase, fetchUsage]);

  useEffect(() => {
    execEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [execEvents, execWaiting]);

  // Keep chat input focused (even after sending / maestro reply)
  useEffect(() => {
    if (phase === "chat" && !chatBusy) chatInputRef.current?.focus();
  }, [phase, chatBusy, messages]);

  // Auto-cresce o textarea do chat conforme o texto (estilo WhatsApp).
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [chatInput]);

  // Keep execution input focused while running
  useEffect(() => {
    if (phase === "executing" && !execFinished) execInputRef.current?.focus();
  }, [phase, execFinished, execEvents, execWaiting]);

  // Clicar em "maestro" no topbar sempre volta para a tela principal limpa,
  // mesmo já estando na home no meio de um fluxo (chat/execução).
  useEffect(() => {
    const reset = () => {
      abortRef.current?.abort();
      abortRef.current = null;
      agentConvoRef.current = [];
      // Encerra qualquer voz em andamento.
      voiceModeRef.current = false; setVoiceMode(false); setSpeaking(false);
      startedChatRef.current = false; turnDoneRef.current = true;
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      setPhase("idle");
      setMode("text");
      setSelected(null); setInput(""); setLinked([]); setSent(false);
      setMessages([]); setChatStep(0); setIsTyping(false);
      setMindNodes([]);
      setExecEvents([]); setExecWaiting(false); setExecFinished(false); setExecInput("");
    };
    window.addEventListener("maestro:home", reset);
    return () => window.removeEventListener("maestro:home", reset);
  }, []);

  // Atalho global ⌘/Ctrl+B → inicia um chat com o maestro. Funciona tanto já na
  // home (evento) quanto ao chegar de outra página (flag no sessionStorage).
  const startChatRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onNewChat = () => startChatRef.current();
    window.addEventListener("maestro:new-chat", onNewChat);
    if (sessionStorage.getItem("maestro:start-chat") === "1") {
      sessionStorage.removeItem("maestro:start-chat");
      startChatRef.current();
    }
    return () => window.removeEventListener("maestro:new-chat", onNewChat);
  }, []);

  const startMic = async () => {
    setMicError(null);
    lastSoundRef.current = 0;
    setTranscript("");
    transcriptRef.current = "";
    try {
      // Não escuta enquanto o maestro fala (evita captar a própria voz).
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      setSpeaking(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setMicActive(true);

      // Transcrição real (Web Speech API). Sem suporte → segue só com a forma de onda.
      const recog = createRecognition();
      if (recog) {
        recognitionRef.current = recog;
        recog.onresult = (e) => {
          let finals = "";
          let interim = "";
          for (let i = 0; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finals += res[0].transcript;
            else interim += res[0].transcript;
          }
          transcriptRef.current = finals.trim();
          setTranscript((finals + interim).trim());
        };
        recog.onerror = (ev) => {
          if (ev.error !== "no-speech" && ev.error !== "aborted") setMicError(`Transcrição: ${ev.error}`);
        };
        try { recog.start(); } catch { /* já iniciado */ }
      }
      const ctx = new AudioContext();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.88;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.fftSize);

      const doAutoSubmit = () => {
        doAutoSubmitRef.current = null;
        cancelAnimationFrame(rafRef.current);
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        audioCtxRef.current = null; analyserRef.current = null; streamRef.current = null;
        try { recognitionRef.current?.stop(); } catch { /* ignore */ }
        setAudioLevel(0);
        setMicActive(false);
        setAudioPhase("processing");
        setTimeout(() => {
          setAudioPhase("done");
          setTimeout(() => {
            setAudioPhase("listening");
            recognitionRef.current = null;
            const said = transcriptRef.current.trim();
            // 1ª vez abre o chat; nas próximas (loop de voz) só anexa a fala.
            if (!startedChatRef.current) { startAgentChat(); startedChatRef.current = true; }
            if (said) sendText(said); // a fala vira a mensagem do usuário
          }, 700);
        }, 2000);
      };

      doAutoSubmitRef.current = doAutoSubmit;
      const SILENCE_THRESHOLD = 0.008;
      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const n = (buf[i] - 128) / 128; sum += n * n; }
        const rms = Math.sqrt(sum / buf.length);
        setAudioLevel(rms);
        if (rms > SILENCE_THRESHOLD) {
          lastSoundRef.current = Date.now();
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        } else if (lastSoundRef.current > 0 && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => { silenceTimerRef.current = null; doAutoSubmit(); }, 1500);
        }
      };
      tick();
    } catch (err: unknown) {
      setMicError(err instanceof Error ? err.message : String(err));
    }
  };

  const stopMic = () => {
    doAutoSubmitRef.current = null;
    cancelAnimationFrame(rafRef.current);
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null; analyserRef.current = null; streamRef.current = null;
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    recognitionRef.current = null;
    setAudioLevel(0);
    setMicActive(false);
  };

  /* ── Voz: síntese de fala (TTS nativo, grátis) ─────────────────── */

  // Limpa markdown pra leitura natural (sem *, #, |, links, código).
  const stripForSpeech = (md: string) =>
    md.replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[\s>#*-]+/gm, " ")
      .replace(/[|*_#>]/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const pickPtVoice = (): SpeechSynthesisVoice | null => {
    const vs = window.speechSynthesis?.getVoices() ?? [];
    return vs.find((v) => /pt[-_]?br/i.test(v.lang)) ?? vs.find((v) => /^pt/i.test(v.lang)) ?? null;
  };

  // Re-abre o mic pra continuar a conversa — só quando o turno acabou E a fala
  // terminou (pra não captar a própria voz nem cortar a resposta).
  const maybeReListen = () => {
    if (!voiceModeRef.current || !turnDoneRef.current) return;
    const ss = window.speechSynthesis;
    if (ss && (ss.speaking || ss.pending)) return;
    void startMic();
  };

  const speak = (text: string) => {
    if (!voiceModeRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    const clean = stripForSpeech(text);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "pt-BR";
    const v = pickPtVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    u.onstart = () => setSpeaking(true);
    u.onend = () => { setSpeaking(false); maybeReListen(); };
    u.onerror = () => { setSpeaking(false); maybeReListen(); };
    window.speechSynthesis.speak(u);
  };

  // Encerra o modo de voz por completo (botão "Encerrar áudio").
  const stopVoice = () => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setSpeaking(false);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    stopMic();
  };

  const handlePlayClick = () => {
    if (phase === "idle") setPhase("choosing");
    else if (phase === "choosing") setPhase("idle");
    else if (phase === "panel" && mode === "audio") { if (doAutoSubmitRef.current) doAutoSubmitRef.current(); else closePanel(); }
  };

  /** Abre o chat com o agente REAL. Saudação estática + espera a 1ª mensagem. */
  const startAgentChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    agentConvoRef.current = [];
    agentBufferRef.current = "";
    chatBranchRef.current = "";
    setSelected(null); setInput(""); setLinked([]); setSent(false);
    setChatInput(""); setIsTyping(false); setChatBusy(false);
    setMessages([{
      id: "greet",
      role: "assistant",
      content: `Olá! Me conta o que você precisa — pode descrever do seu jeito. Se for sobre uma branch específica, é só dizer qual; senão eu pergunto.`,
    }]);
    setPhase("chat");
  };
  startChatRef.current = startAgentChat;

  // Dispara uma rodada do agente no chat: streama texto + ferramentas + artefatos.
  const runChatTurn = () => {
    setChatBusy(true);
    setIsTyping(true);
    setActivity(null);
    turnDoneRef.current = false;
    // Novo turno do usuário corta qualquer fala em andamento.
    if (voiceModeRef.current) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } setSpeaking(false); }

    // `fullText` guarda tudo (p/ o histórico); cada rodada (entre ferramentas)
    // vira um balão separado, pra não colar "texto1Texto2".
    let fullText = "";
    let roundText = "";
    let roundId: string | null = null;
    let seq = 0;
    let rafPending = false;

    // Atualiza o balão atual no máximo 1x por frame (coalesce os tokens) — fluido
    // mesmo com texto grande, em vez de re-renderizar a cada token.
    const flush = () => {
      rafPending = false;
      const id = roundId;
      const text = roundText; // captura o valor — o updater do React roda depois
      if (id) setMessages(prev => prev.map(m => m.id === id ? { ...m, content: text } : m));
    };
    const closeRound = () => { flush(); if (roundId && roundText.trim()) speak(roundText); roundId = null; roundText = ""; };

    // Agrupa ferramentas repetidas (ex: 10× criar_card_linear) numa linha de
    // progresso só: name → id da mensagem + total do grupo.
    const groups: Record<string, { id: string; total: number }> = {};

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Home: começa sem branch; o agente fixa via selecionar_branch e o front
    // passa a usar o token dessa branch nas próximas mensagens.
    streamAgent(
      { branch: chatBranchRef.current, messages: agentConvoRef.current },
      {
        onToolPending: (e) => {
          // O modelo começou a gerar uma ferramenta (ex: o HTML do dashboard).
          // Mostra o indicador "trabalhando" com rótulo durante a geração.
          setIsTyping(true);
          setActivity(describeTool(e.name, {}));
        },
        onText: (delta) => {
          setIsTyping(false);
          setActivity(null);
          fullText += delta;
          roundText += delta;
          if (roundId === null) {
            const id = `a${Date.now()}-${seq++}`;
            roundId = id;
            const text = roundText; // captura — o updater roda depois
            setMessages(prev => [...prev, { id, role: "assistant", content: text }]);
          } else if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flush);
          }
        },
        onToolStart: (e) => {
          setActivity(null);
          closeRound(); // o próximo texto começa um balão novo
          if (e.name === "selecionar_branch") { setIsTyping(true); return; } // silencioso — vira a tag de branch no result
          if (e.name === "perguntar_opcoes") {
            setIsTyping(false);
            const inp = e.input as { pergunta?: string; opcoes?: string[] } | undefined;
            setMessages(prev => [...prev, {
              id: `q${e.id}`, role: "choice",
              content: inp?.pergunta ?? "",
              options: Array.isArray(inp?.opcoes) ? inp!.opcoes : [],
            }]);
            if (inp?.pergunta) speak(inp.pergunta); // lê a pergunta em voz alta
            return;
          }
          setIsTyping(true); // ferramenta executando — segue mostrando "trabalhando"
          // Grupo de ferramentas repetidas: 1 linha de progresso x/total.
          const total = e.groupTotal ?? 1;
          if (total > 1) {
            if (!groups[e.name]) {
              const gid = `g${e.id}`;
              groups[e.name] = { id: gid, total };
              setMessages(prev => [...prev, { id: gid, role: "progress", content: groupLabel(e.name), progressDone: 0, progressTotal: total }]);
            }
            return;
          }
          setMessages(prev => [...prev, { id: `t${e.id}`, role: "log", content: `${describeTool(e.name, e.input)}…` }]);
        },
        onToolResult: (e) => {
          const r = e.result as { ok?: boolean; artifact?: ArtifactData; branch_id?: string; branch_name?: string } | undefined;
          // Avança a linha de progresso do grupo (ferramentas repetidas).
          if ((e.groupTotal ?? 1) > 1 && groups[e.name]) {
            const g = groups[e.name];
            const done = e.groupDone ?? 0;
            setMessages(prev => prev.map(m => m.id === g.id ? { ...m, progressDone: done } : m));
            if (done >= g.total) delete groups[e.name];
            return;
          }
          if (e.name === "selecionar_branch" && r?.ok && r.branch_id) {
            chatBranchRef.current = r.branch_id; // próximas mensagens usam o token dessa branch
            setMessages(prev => [...prev, { id: `br${e.id}`, role: "log", content: `Branch: ${r.branch_name}` }]);
            return;
          }
          if (e.name === "gerar_artefato" && r?.artifact) {
            setMessages(prev => [...prev, { id: `art${e.id}`, role: "artifact", content: r.artifact!.filename, artifact: r.artifact }]);
          }
        },
        onDone: () => {
          closeRound(); // fecha e fala o último balão
          abortRef.current = null;
          setIsTyping(false);
          setActivity(null);
          setChatBusy(false);
          turnDoneRef.current = true;
          if (fullText.trim()) {
            agentConvoRef.current = [...agentConvoRef.current, { role: "assistant", content: fullText }];
          }
          void fetchUsage(); // atualiza o consumo do mês após o turno
          maybeReListen(); // volta a ouvir se nada estiver sendo falado
        },
        onError: (msg) => {
          abortRef.current = null;
          setIsTyping(false);
          setActivity(null);
          setChatBusy(false);
          turnDoneRef.current = true;
          setMessages(prev => [...prev, { id: `err${Date.now()}`, role: "log", content: `⚠ ${friendlyAgentError(msg)}` }]);
        },
      },
      ctrl.signal,
    );
  };

  const pickMode = (m: InputMode) => {
    setInput(""); setLinked([]); setSent(false); setSelected(null);
    if (m === "audio") {
      setMode("audio"); setPhase("panel"); setAudioPhase("listening");
      setVoiceMode(true); voiceModeRef.current = true; startedChatRef.current = false;
    }
    else { setMode("text"); setVoiceMode(false); voiceModeRef.current = false; startAgentChat(); }
  };

  const closePanel = () => { setPhase("idle"); setSelected(null); setInput(""); setLinked([]); setSent(false); };

  const pickBranch = (id: string) => { setSelected(id); setActive(id); setLinked([]); };

  const toggleTool = (id: string) =>
    setLinked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = () => {
    if (!input.trim()) return;
    setSent(true);
    setTimeout(() => { setSent(false); setInput(""); setLinked([]); }, 2400);
  };

  /** Envia um texto (e opcionais anexos pendentes) como mensagem do usuário. */
  const sendText = (text: string, attachments?: AgentAttachment[]) => {
    const t = text.trim();
    const atts = attachments ?? pendingFiles;
    if ((!t && !atts.length) || chatBusy) return;
    setPendingFiles([]);
    setMessages(prev => [...prev, { id: `u${Date.now()}`, role: "user", content: t, attachments: atts.length ? atts : undefined }]);
    const msg: AgentMessage = { role: "user", content: t };
    if (atts.length) msg.attachments = atts;
    agentConvoRef.current = [...agentConvoRef.current, msg];
    runChatTurn();
  };

  const sendChatMessage = () => {
    if ((!chatInput.trim() && !pendingFiles.length) || chatBusy) return;
    const text = chatInput.trim();
    setChatInput("");
    sendText(text);
  };

  /** Faz upload do arquivo para /api/upload e adiciona à lista de pendentes. */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json() as { error?: string } & AgentAttachment;
      if (!res.ok || data.error) throw new Error(data.error ?? `Erro ${res.status}`);
      setPendingFiles(prev => [...prev, data]);
    } catch (err) {
      setMessages(prev => [...prev, { id: `fe${Date.now()}`, role: "log", content: `⚠ ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setUploadingFile(false);
    }
  };

  // Ref pro sendText mais recente, pra manter pickChoice estável (memoização).
  const sendTextRef = useRef(sendText);
  sendTextRef.current = sendText;

  /** Clique numa opção de escolha: remove os botões daquela pergunta e envia. */
  const pickChoice = useCallback((msgId: string, opt: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, options: [] } : m));
    sendTextRef.current(opt);
  }, []);

  const openPreview = useCallback((a: ArtifactData) => setPreviewArtifact(a), []);

  // Drives one agent turn: streams text + tool events, accumulates the
  // assistant reply into the conversation history when the turn ends.
  const runAgentTurn = () => {
    setExecWaiting(false);
    agentBufferRef.current = "";
    const assistantId = `a${Date.now()}`;
    let opened = false;

    const ensureAssistant = () => {
      if (!opened) {
        opened = true;
        setExecEvents(prev => [...prev, { id: assistantId, type: "assistant", content: "" }]);
      }
    };

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    streamAgent(
      { branch: active, messages: agentConvoRef.current },
      {
        onText: (delta) => {
          agentBufferRef.current += delta;
          ensureAssistant();
          setExecEvents(prev => prev.map(e => e.id === assistantId ? { ...e, content: agentBufferRef.current } : e));
        },
        onToolStart: (e) => {
          setExecEvents(prev => [...prev, { id: `t${e.id}`, type: "log", content: `${describeTool(e.name, e.input)}…` }]);
        },
        onToolResult: (e) => {
          const r = e.result as {
            ok?: boolean; simulated?: boolean; task?: { title?: string };
            artifact?: ArtifactData; rowCount?: number; count?: number;
          } | undefined;

          // Artefato gerado → card com botão de download.
          if (e.name === "gerar_artefato" && r?.artifact) {
            setExecEvents(prev => [...prev, { id: `art${e.id}`, type: "artifact", content: r.artifact!.filename, artifact: r.artifact }]);
            return;
          }

          let note = `${toolLabel(e.name)} ✓`;
          if (e.name === "criar_tarefa" && r?.task?.title) note = `Tarefa criada: ${r.task.title}`;
          if (e.name === "consultar_base_de_dados" && typeof r?.rowCount === "number") note = `${r.rowCount} linha(s) lidas`;
          if (e.name === "consultar_tarefas" && typeof r?.count === "number") note = `${r.count} tarefa(s)`;
          if (r?.ok === false) note = `${toolLabel(e.name)} — falhou`;
          if (r?.simulated) note += " (simulado)";
          setExecEvents(prev => [...prev, { id: `r${e.id}`, type: "log", content: note }]);
        },
        onDone: () => {
          abortRef.current = null;
          if (agentBufferRef.current.trim()) {
            agentConvoRef.current = [...agentConvoRef.current, { role: "assistant", content: agentBufferRef.current }];
          }
          setExecWaiting(true); // turn ended �?' ready for the user to reply / continue
        },
        onError: (msg) => {
          abortRef.current = null;
          setExecEvents(prev => [...prev, { id: `err${Date.now()}`, type: "log", content: `�s� ${friendlyAgentError(msg)}` }]);
          setExecWaiting(true);
        },
      },
      ctrl.signal,
    );
  };

  const sendExecMessage = () => {
    if (!execInput.trim()) return;
    const msg = execInput.trim();
    setExecInput("");
    // If a turn is mid-stream, interrupt it (committing partial text) so the
    // new context redirects the maestro right away.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      if (agentBufferRef.current.trim()) {
        agentConvoRef.current = [...agentConvoRef.current, { role: "assistant", content: agentBufferRef.current }];
      }
    }
    setExecEvents(prev => [...prev, { id: `u${Date.now()}`, type: "user", content: msg }]);
    agentConvoRef.current = [...agentConvoRef.current, { role: "user", content: msg }];
    runAgentTurn();
  };

  const confirmAction = () => {
    // Seed the agent with the confirmed plan as the first user message.
    const plan = mindNodes.map(n => `${n.label}: ${n.value}`).join("\n");
    const seed = `Plano confirmado. Execute a tarefa com base nestes dados:\n${plan}`;
    agentConvoRef.current = [{ role: "user", content: seed }];
    setExecEvents([]); setExecWaiting(false); setExecFinished(false); setExecInput("");
    setPhase("executing");
    runAgentTurn();
  };

  const interruptExecution = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    agentConvoRef.current = [];
    setPhase("idle");
    setMessages([]); setChatStep(0); setMindNodes([]);
    setExecEvents([]); setExecWaiting(false); setExecFinished(false);
  };

  return (
    <PageTransition>
      <div className="relative flex min-h-[calc(100vh-72px)] flex-col items-center justify-center pb-16 pt-6">

        {/* Fundo da hero — variante trocável (aurora original ou ColorBends WebGL).
            Mobile usa a versão leve da aurora; ColorBends roda só no desktop. */}
        <HeroBackground variant={isMobile ? "aurora" : bgVariant} isMobile={isMobile} activeWs={activeWs} />

        {/* Hero — colapsa quando a conversa começa, liberando espaço vertical */}
        <AnimatePresence initial={false}>
          {phase !== "chat" && phase !== "confirm" && phase !== "executing" && (
            <motion.div key="hero" layout
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { type: "spring", stiffness: 260, damping: 30 } }}
              className={cn("overflow-hidden text-center", phase === "panel" ? "mb-6" : "mb-12")}
            >
              <motion.div
                animate={{ scale: phase === "panel" ? 0.82 : 1 }}
                style={{ transformOrigin: "center bottom" }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
              >
                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">O que deseja fazer?</h1>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-2">Dê ordens para o maestro trabalhar</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stage �?" idle / choosing / panel */}
        <AnimatePresence mode="wait">
          {(phase === "idle" || phase === "choosing" || phase === "panel") && (
            <motion.div key="stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12, scale: 0.97 }} transition={{ duration: 0.3 }}
              className="relative flex w-full max-w-3xl flex-col items-center">

              <motion.div layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, layout: { type: "spring", stiffness: 300, damping: 28 } }}
                className="relative z-10 flex items-center justify-center gap-4">

                <AnimatePresence>
                  {phase === "choosing" && (
                    <motion.button key="opt-text"
                      initial={{ opacity: 0, x: 24, scale: 0.85 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 24, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 340, damping: 26 }}
                      onClick={() => pickMode("text")}
                      className="flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:text-white"
                      style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 10px 30px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                      <Icon name="MessageSquare" size={16} strokeWidth={1.75} /> Texto
                    </motion.button>
                  )}
                </AnimatePresence>

                <motion.button onClick={handlePlayClick} initial="rest" whileHover="hover" whileTap="tap" className="flex cursor-pointer flex-col items-center gap-2.5">
                  <motion.span className="relative block"
                    animate={{ y: phase === "idle" ? [0, -7, 0] : 0 }}
                    transition={phase === "idle" ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}>
                    <motion.span className="absolute -inset-3 rounded-full"
                      variants={{ rest: { opacity: phase !== "idle" ? 0.5 : 0, scale: 0.85 }, hover: { opacity: 0.7, scale: 1 }, tap: { opacity: 0.6, scale: 0.95 } }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.6), transparent 72%)", filter: "blur(8px)" }} />
                    <motion.span
                      variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.08, y: -4 }, tap: { scale: 0.94, y: 0 } }}
                      transition={{ type: "spring", stiffness: 320, damping: 20 }}
                      className="relative flex h-16 w-16 items-center justify-center rounded-2xl sm:h-[68px] sm:w-[68px]"
                      style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid ${phase !== "idle" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.12)"}`, boxShadow: phase !== "idle" ? "0 0 20px -8px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.1)" : "0 10px 30px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                      <span className="relative flex h-[26px] w-[40px] items-center justify-center">
                        <motion.span className="absolute inset-0 flex items-center justify-center"
                          animate={{ opacity: phase === "choosing" || (phase === "panel" && mode === "audio") ? 0 : 1, scale: phase === "choosing" || (phase === "panel" && mode === "audio") ? 0.6 : 1 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}>
                          <Icon name="Play" size={26} strokeWidth={1.75} />
                        </motion.span>
                        <motion.span className="absolute inset-0 flex items-center justify-center"
                          animate={{ opacity: phase === "choosing" ? 1 : 0, scale: phase === "choosing" ? 1 : 0.6 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}>
                          <Icon name="HelpCircle" size={26} strokeWidth={1.75} />
                        </motion.span>
                        <motion.span className="absolute inset-0 flex items-center justify-center"
                          animate={{ opacity: phase === "panel" && mode === "audio" ? 1 : 0, scale: phase === "panel" && mode === "audio" ? 1 : 0.6 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}>
                          <Waveform level={audioLevel} audioPhase={audioPhase} />
                        </motion.span>
                      </span>
                    </motion.span>
                  </motion.span>
                  <AnimatePresence initial={false}>
                    {phase === "idle" && (
                      <motion.span key="label" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="text-sm font-medium text-white/55">
                        Maestro
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>

                <AnimatePresence>
                  {phase === "choosing" && (
                    <motion.button key="opt-audio"
                      initial={{ opacity: 0, x: -24, scale: 0.85 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -24, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 340, damping: 26, delay: 0.05 }}
                      onClick={() => pickMode("audio")}
                      className="flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:text-white"
                      style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 10px 30px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                      <Icon name="Mic" size={16} strokeWidth={1.75} /> Áudio
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>

              <AnimatePresence>
                {phase === "choosing" && (
                  <motion.p key="hint" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, delay: 0.1 }} className="mt-4 text-[13px] text-white">
                    Como quer mandar as instruções?
                  </motion.p>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {phase === "panel" && mode === "audio" && (
                  <motion.div key="listening" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="mt-5 flex flex-col items-center gap-3">
                    {micError && <p className="text-xs text-red-400">{micError}</p>}
                    {/* Transcrição ao vivo */}
                    <AnimatePresence>
                      {transcript && (audioPhase === "listening" || audioPhase === "processing") && (
                        <motion.p key="transcript" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="max-w-[420px] text-center text-sm leading-relaxed text-white/85">
                          {transcript}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <AnimatePresence mode="wait">
                      {audioPhase === "listening" && (
                        <motion.button key="cancel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={closePanel} className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-muted-2 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
                          Cancelar
                        </motion.button>
                      )}
                      {audioPhase === "processing" && (
                        <motion.p key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-[13px] text-muted-2">
                          Processando...
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div layout className={phase === "panel" ? "h-5" : "h-10"} />

              <div className="w-full max-w-[540px]">
                <AnimatePresence>
                  {phase === "panel" && mode === "text" && (
                    <motion.div key="order-panel" layout
                      initial={{ opacity: 0, y: -16, scale: 0.95, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -12, scale: 0.96, filter: "blur(8px)" }}
                      transition={{ type: "spring", stiffness: 190, damping: 23, mass: 0.9, opacity: { duration: 0.32, ease: "easeOut" }, filter: { duration: 0.4, ease: "easeOut" }, layout: { type: "spring", stiffness: 280, damping: 30 } }}
                      className="relative overflow-hidden rounded-[24px]"
                      style={{ transformOrigin: "top center", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(48px)", WebkitBackdropFilter: "blur(48px)", border: `1px solid rgba(255,255,255,0.09)`, boxShadow: ws ? `0 0 0 1px ${ws.accent}18, 0 32px 70px -24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)` : `0 32px 70px -24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)` }}>

                      <button onClick={closePanel} className="absolute right-4 top-4 cursor-pointer text-muted-2 transition-colors hover:text-white">
                        <Icon name="X" size={14} />
                      </button>

                      <div className="px-5 pt-5 pb-3">
                        <p className="mb-2.5 text-[11px] text-muted-2">Selecionar branch</p>
                        <div className="flex gap-2">
                          {branches.map((w) => {
                            const isSel = selected === w.id;
                            return (
                              <motion.button key={w.id} onClick={() => pickBranch(w.id)} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                                className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                                style={{ borderColor: isSel ? w.accent : "var(--border)", background: isSel ? `${w.accent}1f` : "var(--surface)", color: isSel ? "#fff" : "var(--muted)" }}>
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: w.accent }} />
                                {w.name}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="px-5 pb-2">
                        <AnimatePresence mode="wait">
                          {sent && ws ? (
                            <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex h-[80px] items-center gap-3">
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${ws.accent}, ${ws.accent2})` }}>
                                <Icon name="Check" size={15} strokeWidth={2.5} />
                              </motion.span>
                              <div>
                                <p className="text-sm font-medium">Ordem enviada!</p>
                                <p className="text-xs text-muted">{linked.length > 0 ? `Com ${linked.length} ferramenta${linked.length > 1 ? "s" : ""} linkada${linked.length > 1 ? "s" : ""}` : "Executando no branch " + ws.name}</p>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.textarea key="input" ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} autoFocus
                              placeholder={ws ? `O que fazer no branch ${ws.name}?` : "Selecione uma branch acima..."}
                              className="w-full resize-none bg-transparent text-sm leading-relaxed text-white outline-none placeholder:text-muted-2" style={{ minHeight: "80px" }} />
                          )}
                        </AnimatePresence>
                      </div>

                      {!sent && ws && (
                        <div className="px-5 pb-3">
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-2"><Icon name="Link2" size={12} /> Linkar ferramentas</p>
                          <div className="flex flex-wrap gap-2">
                            {tools.map((t) => {
                              const on = linked.includes(t.id);
                              return (
                                <motion.button key={t.id} onClick={() => t.connected && toggleTool(t.id)} whileHover={t.connected ? { scale: 1.04 } : {}} whileTap={t.connected ? { scale: 0.96 } : {}} disabled={!t.connected}
                                  className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-all disabled:opacity-40"
                                  style={{ borderColor: on ? ws.accent : "var(--border)", background: on ? `${ws.accent}1f` : "var(--surface)", color: on ? "#fff" : "var(--muted)" }}>
                                  <Icon name={t.icon} size={13} style={on ? { color: ws.accent } : undefined} />
                                  {t.name}
                                  {on && <Icon name="Check" size={12} style={{ color: ws.accent }} />}
                                  {!t.connected && <span className="text-[10px] text-muted-2">·off</span>}
                                </motion.button>
                              );
                            })}
                            {tools.length === 0 && <span className="text-xs text-muted-2">Nenhuma ferramenta neste branch ainda.</span>}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
                        <span className="text-[11px] text-muted-2">{linked.length > 0 ? `${linked.length} linkada${linked.length > 1 ? "s" : ""} · �O~�?�` : "�O~�?� para enviar"}</span>
                        <motion.button whileHover={{ scale: 1.05, boxShadow: ws ? `0 0 28px -6px ${ws.accent}` : undefined }} whileTap={{ scale: 0.95 }} onClick={send} disabled={!input.trim() || sent || !selected}
                          className="flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-white transition-all disabled:opacity-35"
                          style={{ background: ws ? `linear-gradient(135deg, ${ws.accent}, ${ws.accent2})` : "rgba(255,255,255,0.15)" }}>
                          <Icon name="SendHorizontal" size={13} strokeWidth={2} /> Enviar ordem
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat phase */}
        <AnimatePresence>
          {phase === "chat" && (
            <motion.div key="chat"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="w-full max-w-[480px] md:max-w-[640px] lg:max-w-[760px] xl:max-w-[860px]">

              <div className="mb-4 flex max-h-[min(60vh,640px)] flex-col gap-3 overflow-y-auto px-1 py-1" style={{ scrollbarWidth: "none" }}>
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <MessageRow key={msg.id} msg={msg} chatBusy={chatBusy} onPick={pickChoice} onPreview={openPreview} />
                  ))}
                </AnimatePresence>

                <AnimatePresence>
                  {isTyping && (
                    <motion.div key="typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex justify-start">
                      <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-sm px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div className="flex items-center gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-white/40"
                              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                          ))}
                        </div>
                        <span className="text-[12px] text-white/45">{activity ?? "Maestro trabalhando…"}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>

              {/* Barra de voz — só no modo áudio: ouvindo / falando / toque pra falar */}
              <AnimatePresence>
                {voiceMode && (
                  <motion.div key="voicebar"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.25 }}
                    className="mb-2 flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
                    style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <motion.button
                      onClick={() => { if (micActive) { doAutoSubmitRef.current?.(); } else { void startMic(); } }}
                      whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                      title={micActive ? "Concluir fala" : "Falar"}
                      className="relative flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-white"
                      style={{ background: micActive ? `linear-gradient(135deg, ${activeWs.accent}, ${activeWs.accent2})` : "rgba(255,255,255,0.08)" }}>
                      {micActive && (
                        <motion.span className="absolute inset-0 rounded-full"
                          style={{ border: `2px solid ${activeWs.accent}` }}
                          animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }} />
                      )}
                      <Icon name={micActive ? "Mic" : speaking ? "Volume2" : "Mic"} size={15} strokeWidth={2} />
                    </motion.button>

                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium" style={{ color: micActive ? activeWs.accent : speaking ? "#34d399" : "rgba(255,255,255,0.5)" }}>
                        {micActive ? "Ouvindo…" : speaking ? "Maestro falando…" : "Toque o microfone para falar"}
                      </p>
                      {micActive && transcript && (
                        <p className="truncate text-[12px] text-white/70">{transcript}</p>
                      )}
                      {speaking && (
                        <div className="mt-1 flex items-center gap-0.5">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <motion.span key={i} className="w-0.5 rounded-full bg-emerald-400/70"
                              animate={{ height: [3, 11, 3] }}
                              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }} />
                          ))}
                        </div>
                      )}
                    </div>

                    <button onClick={stopVoice}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-white/45 transition-colors hover:text-white/80"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <Icon name="X" size={11} strokeWidth={2.5} /> Encerrar
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-2 rounded-2xl px-4 py-2.5"
                style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {/* Chips de arquivos pendentes */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-white/70"
                        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
                        <Icon name={f.type === "image" ? "Image" : f.type === "pdf" ? "FileText" : "File"} size={11} strokeWidth={2} />
                        <span className="max-w-[120px] truncate">{f.filename}</span>
                        <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                          className="ml-0.5 cursor-pointer text-white/40 hover:text-white/80">
                          <Icon name="X" size={10} strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-3">
                  {/* Input oculto de arquivo */}
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept="image/*,.pdf,.xlsx,.xls,.docx,.txt,.csv,.md,.json"
                    onChange={handleFileChange} />
                  {/* Botão paperclip */}
                  <motion.button onClick={() => fileInputRef.current?.click()} disabled={chatBusy || uploadingFile}
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    className="mb-0.5 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/40 transition-colors hover:text-white/70 disabled:opacity-30">
                    {uploadingFile
                      ? <Icon name="Loader" size={14} strokeWidth={2} className="animate-spin" />
                      : <Icon name="Paperclip" size={14} strokeWidth={2} />}
                  </motion.button>
                  <textarea ref={chatInputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                    placeholder={chatBusy ? "Maestro está respondendo…" : "Descreva o que precisa…"} autoFocus disabled={chatBusy}
                    rows={1}
                    className="flex-1 resize-none self-center bg-transparent py-1 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 disabled:opacity-60"
                    style={{ maxHeight: 140 }} />
                  <motion.button onClick={sendChatMessage} disabled={(!chatInput.trim() && !pendingFiles.length) || chatBusy}
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                    className="mb-0.5 flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl text-white/60 transition-colors hover:text-white disabled:opacity-30"
                    style={{ background: "rgba(255,255,255,0.08)" }}>
                    <Icon name="SendHorizontal" size={14} strokeWidth={2} />
                  </motion.button>
                </div>
              </div>

              {/* Medidor de uso real do mês — abaixo da barra, no canto direito */}
              <AnimatePresence>
                {usage && (usage.tokensUsed > 0 || usage.costUsd > 0) && (
                  <motion.div key="usage"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    title="Consumo real deste mês através do Maestro (todas as branches). Estimado pelos tokens × tabela de preços da Anthropic."
                    className="mt-2 flex items-center justify-end gap-2 px-1 text-[10.5px] text-white/35">
                    <span className="flex items-center gap-1">
                      <Icon name="Zap" size={10} strokeWidth={2} className="text-white/30" />
                      {fmtTokens(usage.tokensUsed)} tokens
                    </span>
                    <span className="text-white/15">·</span>
                    <span>{fmtUsd(usage.costUsd)}</span>
                    <span className="text-white/25">este mês</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-3 flex justify-center">
                <button onClick={() => { abortRef.current?.abort(); abortRef.current = null; stopVoice(); setPhase("idle"); }} className="cursor-pointer text-xs text-white/30 transition-colors hover:text-white/60">
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm / Mind map */}
        <AnimatePresence>
          {phase === "confirm" && (
            <motion.div key="confirm"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex w-full max-w-[720px] flex-col items-center gap-6">
              <MindMap nodes={mindNodes} onChange={setMindNodes} />
              <div className="flex items-center gap-4">
                <motion.button onClick={confirmAction}
                  whileHover={{ scale: 1.04, boxShadow: "0 0 28px -6px rgba(255,255,255,0.25)" }} whileTap={{ scale: 0.96 }}
                  className="flex cursor-pointer items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white"
                  style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.07))", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <Icon name="Check" size={14} strokeWidth={2.5} /> Confirmar e executar
                </motion.button>
                <button onClick={() => { setPhase("idle"); setMessages([]); setChatStep(0); setMindNodes([]); }} className="cursor-pointer text-sm text-white/35 transition-colors hover:text-white/65">
                  Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Executing phase */}
        <AnimatePresence>
          {phase === "executing" && (
            <motion.div key="executing"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex w-full max-w-[500px] flex-col overflow-hidden rounded-[20px]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>

              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  {!execFinished ? (
                    <motion.span className="h-2 w-2 rounded-full bg-white/55"
                      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/12">
                      <Icon name="Check" size={9} strokeWidth={2.5} />
                    </span>
                  )}
                  <span className="text-sm font-medium text-white/80">
                    {execFinished ? "Concluído" : execWaiting ? "Aguardando sua resposta" : "Executando..."}
                  </span>
                </div>
                {!execFinished && (
                  <motion.button onClick={interruptExecution} title="Interromper"
                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-white/35 transition-all hover:border-white/20 hover:text-white/75">
                    <Icon name="Square" size={11} strokeWidth={2.5} style={{ fill: "currentColor" }} />
                  </motion.button>
                )}
              </div>

              {/* Event feed */}
              <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "none" }}>
                <AnimatePresence initial={false}>
                  {execEvents.map((evt) => {
                    if (evt.type === "assistant") return (
                      <motion.div key={evt.id} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }} className="flex justify-start py-0.5">
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}>
                          {evt.content || "�?�"}
                        </div>
                      </motion.div>
                    );
                    if (evt.type === "user") return (
                      <motion.div key={evt.id} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }} className="flex justify-end py-0.5">
                        <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed"
                          style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}>
                          {evt.content}
                        </div>
                      </motion.div>
                    );
                    if (evt.type === "done") return (
                      <motion.div key={evt.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        className="flex items-center gap-2.5 py-1">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ background: "rgba(255,255,255,0.14)" }}>
                          <Icon name="Check" size={11} strokeWidth={2.5} />
                        </span>
                        <span className="text-sm font-semibold text-white/90">{evt.content}</span>
                      </motion.div>
                    );
                    if (evt.type === "artifact" && evt.artifact) return (
                      <motion.button key={evt.id} onClick={() => downloadArtifact(evt.artifact!)}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        whileHover={{ scale: 1.015, borderColor: "rgba(255,255,255,0.28)" }} whileTap={{ scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 300, damping: 26 }}
                        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: "rgba(255,255,255,0.10)" }}>
                          <Icon name="FileText" size={16} strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white/90">{evt.artifact.filename}</p>
                          <p className="text-[11px] text-white/40">
                            {(evt.artifact.format ?? "arquivo").toUpperCase()} · {(evt.artifact.bytes / 1024).toFixed(1)} KB · clique para baixar
                          </p>
                        </div>
                        <Icon name="Download" size={16} className="flex-shrink-0 text-white/40 transition-colors group-hover:text-white/80" />
                      </motion.button>
                    );
                    // log
                    return (
                      <motion.div key={evt.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }} className="flex items-center gap-2.5">
                        <span className="h-1 w-1 flex-shrink-0 rounded-full bg-white/25" />
                        <span className="text-[13px] text-white/40">{evt.content}</span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Working indicator */}
                {!execWaiting && !execFinished && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 pl-3.5">
                    {[0,1,2].map(i => (
                      <motion.span key={i} className="h-1 w-1 rounded-full bg-white/20"
                        animate={{ opacity: [0.2, 0.6, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </motion.div>
                )}

                <div ref={execEndRef} />
              </div>

              {/* Input bar */}
              <div className="px-5 py-3">
                {execFinished ? (
                  <div className="flex justify-center">
                    <button onClick={() => { setPhase("idle"); setMessages([]); setChatStep(0); setMindNodes([]); setExecEvents([]); }}
                      className="cursor-pointer rounded-full border border-white/15 px-5 py-2 text-sm text-white/55 transition-all hover:border-white/25 hover:text-white/85">
                      Nova tarefa
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input ref={execInputRef} value={execInput} onChange={e => setExecInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendExecMessage(); } }}
                      placeholder={execWaiting ? "Responda o maestro..." : "Adicionar detalhes..."}
                      autoFocus
                      className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
                    <motion.button onClick={sendExecMessage} disabled={!execInput.trim()}
                      whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                      className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl text-white/50 transition-colors hover:text-white disabled:opacity-25"
                      style={{ background: "rgba(255,255,255,0.07)" }}>
                      <Icon name="SendHorizontal" size={14} strokeWidth={2} />
                    </motion.button>
                  </div>
                )}
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Live preview de artefato HTML (dashboard) — efêmero, em modal */}
        <AnimatePresence>
          {previewArtifact && (
            <ArtifactPreview artifact={previewArtifact} onClose={() => setPreviewArtifact(null)} />
          )}
        </AnimatePresence>

      </div>
    </PageTransition>
  );
}

/* ── Preview de artefato HTML em modal (live, efêmero) ─────────── */
function ArtifactPreview({ artifact, onClose }: { artifact: ArtifactData; onClose: () => void }) {
  const html = artifactToText(artifact);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl"
        style={{ height: "min(88vh, 900px)", background: "#0f0f12", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 30px 80px -24px rgba(0,0,0,0.85)" }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
          <Icon name="LayoutDashboard" size={15} className="text-white/60" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/85">{artifact.filename}</span>
          <span className="hidden text-[11px] text-white/30 sm:inline">preview ao vivo · não fica salvo</span>
          <motion.button onClick={() => downloadArtifact(artifact)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            title="Baixar" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <Icon name="Download" size={15} strokeWidth={2} />
          </motion.button>
          <motion.button onClick={onClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            title="Fechar" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <Icon name="X" size={15} strokeWidth={2.2} />
          </motion.button>
        </div>
        {/* sandbox sem allow-same-origin: HTML isolado, sem acesso ao app */}
        <iframe title={artifact.filename} srcDoc={html} sandbox="allow-scripts"
          className="min-h-0 flex-1 border-0 bg-white" />
      </motion.div>
    </motion.div>
  );
}

/* �"?�"? Waveform �"?�"? */
const BAR_MULTS = [0.45, 0.72, 1.0, 1.35, 1.0, 0.72, 0.45];

function Waveform({ level, audioPhase }: { level: number; audioPhase: "listening" | "processing" | "done" }) {
  if (audioPhase === "done") {
    return (
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className="flex items-center justify-center">
        <Icon name="Check" size={22} strokeWidth={2.5} />
      </motion.span>
    );
  }
  return (
    <div className="flex items-center gap-[3px]" style={{ width: 36, height: 26 }}>
      {BAR_MULTS.map((mul, i) => (
        <motion.span key={i} className="flex-1 rounded-full bg-white"
          animate={{ scaleY: audioPhase === "processing" ? [0.12, mul * 0.55, 0.12] : Math.max(0.08, level * mul * 3.2) }}
          transition={audioPhase === "processing" ? { duration: 1.0, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" } : { type: "spring", stiffness: 60, damping: 14, mass: 1.4 }}
          style={{ height: "100%", transformOrigin: "center" }} />
      ))}
    </div>
  );
}

/* �"?�"? MindMap �"?�"? */
const NODE_H = 76;
const NODE_GAP = 12;
const ARM = 46;

function MindMap({ nodes, onChange }: { nodes: MindNode[]; onChange: (nodes: MindNode[]) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Level 2 (middle column): branch / prazo / ferramentas. Level 3: instrução (free text).
  const middle = nodes.filter((n) => n.type !== "text");
  const instruction = nodes.find((n) => n.type === "text") ?? null;
  const m = middle.length;
  const colH = m * NODE_H + (m - 1) * NODE_GAP;
  const nodeY = (i: number) => i * (NODE_H + NODE_GAP) + NODE_H / 2;

  const update = (id: string, val: string) =>
    onChange(nodes.map((nd) => (nd.id === id ? { ...nd, value: val } : nd)));

  const stroke = "rgba(255,255,255,0.18)";
  const arrowStroke = "rgba(255,255,255,0.3)";

  return (
    <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-stretch sm:justify-center sm:gap-0">
      {/* Level 1 �?" Maestro */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, type: "spring", stiffness: 300, damping: 24 }}
        className="w-full self-stretch rounded-2xl px-4 py-3 text-center text-[13px] font-semibold leading-snug text-white sm:w-[120px] sm:flex-shrink-0 sm:self-center"
        style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      >
        Plano de ação
      </motion.div>

      {/* Connector 1 �?" Maestro fans out to the 3 nodes */}
      <svg width={ARM} height={colH} className="hidden flex-shrink-0 overflow-visible sm:block" style={{ alignSelf: "flex-start" }}>
        <g fill="none" stroke={stroke} strokeWidth={1}>
          <line x1={0} y1={colH / 2} x2={ARM * 0.42} y2={colH / 2} />
          <line x1={ARM * 0.42} y1={nodeY(0)} x2={ARM * 0.42} y2={nodeY(m - 1)} />
          {middle.map((_, i) => {
            const y = nodeY(i);
            return (
              <g key={i}>
                <line x1={ARM * 0.42} y1={y} x2={ARM - 6} y2={y} />
                <path d={`M${ARM - 12},${y - 4} L${ARM - 6},${y} L${ARM - 12},${y + 4}`} stroke={arrowStroke} />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Level 2 �?" middle column (z-index elevated when a dropdown is open) */}
      <div className="flex w-full flex-col sm:w-[184px] sm:flex-shrink-0" style={{ gap: NODE_GAP }}>
        {middle.map((node, i) => (
          <div key={node.id} style={{ height: NODE_H, position: "relative", zIndex: activeId === node.id ? 20 : 1 }}>
            <motion.div style={{ height: "100%" }}
              initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 280, damping: 26 }}>
              <NodeCard
                node={node}
                onChange={(val) => update(node.id, val)}
                onOpenChange={(o) => setActiveId(o ? node.id : null)}
              />
            </motion.div>
          </div>
        ))}
      </div>

      {instruction && (
        <>
          {/* Connector 2 �?" the 3 nodes fan in to instrução */}
          <svg width={ARM} height={colH} className="hidden flex-shrink-0 overflow-visible sm:block" style={{ alignSelf: "flex-start" }}>
            <g fill="none" stroke={stroke} strokeWidth={1}>
              {middle.map((_, i) => (
                <line key={i} x1={0} y1={nodeY(i)} x2={ARM * 0.55} y2={nodeY(i)} />
              ))}
              <line x1={ARM * 0.55} y1={nodeY(0)} x2={ARM * 0.55} y2={nodeY(m - 1)} />
              <line x1={ARM * 0.55} y1={colH / 2} x2={ARM - 6} y2={colH / 2} />
              <path d={`M${ARM - 12},${colH / 2 - 4} L${ARM - 6},${colH / 2} L${ARM - 12},${colH / 2 + 4}`} stroke={arrowStroke} />
            </g>
          </svg>

          {/* Level 3 �?" instrução (auto-grows from NODE_H up to colH) */}
          <motion.div className="w-full sm:flex-1 sm:self-center sm:min-w-[200px]"
            initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.34, type: "spring", stiffness: 280, damping: 26 }}>
            <NodeCard node={instruction} onChange={(val) => update(instruction.id, val)} growMaxH={colH} />
          </motion.div>
        </>
      )}
    </div>
  );
}

/* �"?�"? NodeCard �"?�"? */
function NodeCard({ node, onChange, onOpenChange, growMaxH }: { node: MindNode; onChange: (val: string) => void; onOpenChange?: (open: boolean) => void; growMaxH?: number }) {
  const { branches } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [localVal, setLocalVal] = useState(node.value);
  const ref = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Chrome around the textarea: py-3 (24) + label line + its mb-1.5 �?^ 44px.
  const CHROME = 44;
  const maxTextH = growMaxH ? growMaxH - CHROME : undefined;

  const resizeTextarea = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = maxTextH ? Math.min(ta.scrollHeight, maxTextH) : ta.scrollHeight;
    ta.style.height = `${next}px`;
    ta.style.overflowY = maxTextH && ta.scrollHeight > maxTextH ? "auto" : "hidden";
  };

  useEffect(() => { resizeTextarea(); }, [localVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const setOpenWithCb = (val: boolean) => { setOpen(val); onOpenChange?.(val); };

  useEffect(() => setLocalVal(node.value), [node.value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenWithCb(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ddStyle = {
    background: "rgba(12,12,14,0.97)",
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 24px 48px -12px rgba(0,0,0,0.85)",
  };

  const renderDropdown = () => {
    if (node.type === "branch") {
      return branches.map(w => (
        <button key={w.id} onClick={() => { onChange(w.name); setOpenWithCb(false); }}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white">
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: w.accent }} />
          {w.name}
        </button>
      ));
    }

    if (node.type === "tools") {
      const selected = localVal === "" ? [] : localVal.split(" · ");
      return CONNECTORS.filter(c => c.id !== "claude").map(c => {
        const on = selected.includes(c.name);
        return (
          <button key={c.id}
            onClick={() => {
              if (!c.connected) return;
              const next = on ? selected.filter(s => s !== c.name) : [...selected, c.name];
              onChange(next.length ? next.join(" · ") : "");
            }}
            disabled={!c.connected}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-white/8 disabled:opacity-35"
            style={{ color: on ? "#fff" : "rgba(255,255,255,0.65)" }}>
            <Icon name={c.icon} size={13} />
            <span className="flex-1 text-left">{c.name}</span>
            {!c.connected && <span className="text-[10px] text-white/25">off</span>}
            {on && <Icon name="Check" size={12} style={{ color: "rgba(255,255,255,0.5)" }} />}
          </button>
        );
      });
    }

    if (node.type === "deadline") {
      return (
        <div className="p-3">
          <DatePicker value={localVal} onChange={(val) => { setLocalVal(val); onChange(val); }} onClose={() => setOpenWithCb(false)} />
        </div>
      );
    }

    return null;
  };

  const isText = node.type === "text";
  const autoGrow = isText && growMaxH != null;

  return (
    <motion.div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(
        "relative flex flex-col rounded-xl px-3.5 py-3 cursor-default",
        autoGrow ? "justify-start" : isText ? "h-full justify-start" : "h-full justify-center",
      )}
      style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        ...(autoGrow ? { minHeight: NODE_H, maxHeight: growMaxH } : {}),
      }}
      whileHover={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px -8px rgba(0,0,0,0.5)" }}
      transition={{ duration: 0.18 }}
    >
      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-white/35">{node.label}</p>

      {isText ? (
        <textarea ref={taRef} value={localVal} onChange={e => { setLocalVal(e.target.value); onChange(e.target.value); }}
          placeholder={`Descreva ${node.label.toLowerCase()}�?�`}
          rows={1}
          className={cn("w-full resize-none bg-transparent text-sm leading-relaxed text-white/85 outline-none placeholder:text-white/25 cursor-text", !autoGrow && "flex-1")}
          style={{ scrollbarWidth: "none" }} />
      ) : (
        <button onClick={() => setOpenWithCb(!open)}
          className="flex w-full cursor-pointer items-center gap-1.5 text-left text-sm text-white/85 transition-colors hover:text-white">
          <span className="flex-1 truncate">{localVal}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <Icon name="ChevronDown" size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
          </motion.span>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            key="dd"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 bottom-full z-50 mb-2 w-full min-w-[210px] max-h-[220px] overflow-y-auto rounded-xl"
            style={{ ...ddStyle, scrollbarWidth: "none" }}
          >
            {renderDropdown()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

