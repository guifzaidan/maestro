import type { WorkspaceId } from "../theme";

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  /** which workspaces this connector is wired for */
  scopes: WorkspaceId[];
  category: "ia" | "drive" | "db" | "docs" | "calendar" | "messaging";
}

export const CONNECTORS: Connector[] = [
  {
    id: "claude",
    name: "Claude API",
    description: "Token por contexto — DUX, Sheep e Pessoal usam keys distintas.",
    icon: "Sparkles",
    connected: true,
    scopes: ["dux", "sheep", "pessoal"],
    category: "ia",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Acesso a pastas e arquivos da empresa.",
    icon: "HardDrive",
    connected: true,
    scopes: ["dux", "sheep"],
    category: "drive",
  },
  {
    id: "gsheets",
    name: "Google Sheets",
    description: "Leitura e escrita em planilhas operacionais.",
    icon: "Table",
    connected: true,
    scopes: ["dux", "sheep"],
    category: "docs",
  },
  {
    id: "gdocs",
    name: "Google Docs",
    description: "Geração e edição de documentos.",
    icon: "FileText",
    connected: false,
    scopes: ["dux"],
    category: "docs",
  },
  {
    id: "turso",
    name: "Turso (SQLite)",
    description: "Bancos de dados SQLite na edge — múltiplas conexões por contexto.",
    icon: "Database",
    connected: true,
    scopes: ["dux", "sheep", "pessoal"],
    category: "db",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Base de conhecimento, wikis e docs via Notion API.",
    icon: "BookOpen",
    connected: false,
    scopes: ["dux", "sheep", "pessoal"],
    category: "docs",
  },
  {
    id: "gcalendar",
    name: "Google Calendar",
    description: "Sincronização de eventos e compromissos por contexto.",
    icon: "CalendarDays",
    connected: false,
    scopes: ["dux", "sheep", "pessoal"],
    category: "calendar",
  },
  {
    id: "whatsapp",
    name: "WhatsApp (Twilio)",
    description: "Envio e recebimento de mensagens via Twilio WhatsApp API.",
    icon: "MessageSquare",
    connected: false,
    scopes: ["dux", "sheep", "pessoal"],
    category: "messaging",
  },
];
