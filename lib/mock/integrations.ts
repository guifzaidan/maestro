import { BRANCH_IDS, type WorkspaceId } from "../theme";

const ALL_BRANCHES: WorkspaceId[] = [BRANCH_IDS.dux, BRANCH_IDS.sheep, BRANCH_IDS.pessoal];

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  /** which workspaces this connector is wired for */
  scopes: WorkspaceId[];
  category: "ia" | "drive" | "db" | "docs" | "calendar" | "messaging" | "pm";
}

export const CONNECTORS: Connector[] = [
  {
    id: "claude",
    name: "Claude API",
    description: "Token por branch — DUX, Sheep e Pessoal usam keys distintas.",
    icon: "Sparkles",
    connected: false,
    scopes: ALL_BRANCHES,
    category: "ia",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Acesso a pastas e arquivos da empresa.",
    icon: "HardDrive",
    connected: false,
    scopes: [BRANCH_IDS.dux, BRANCH_IDS.sheep],
    category: "drive",
  },
  {
    id: "gsheets",
    name: "Google Sheets",
    description: "Leitura e escrita em planilhas operacionais.",
    icon: "Table",
    connected: false,
    scopes: [BRANCH_IDS.dux, BRANCH_IDS.sheep],
    category: "docs",
  },
  {
    id: "gdocs",
    name: "Google Docs",
    description: "Geração e edição de documentos.",
    icon: "FileText",
    connected: false,
    scopes: [BRANCH_IDS.dux],
    category: "docs",
  },
  {
    id: "turso",
    name: "Turso (SQLite)",
    description: "Bancos de dados SQLite na edge — múltiplas conexões por branch.",
    icon: "Database",
    connected: false,
    scopes: ALL_BRANCHES,
    category: "db",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Base de conhecimento, wikis e docs via Notion API.",
    icon: "BookOpen",
    connected: false,
    scopes: ALL_BRANCHES,
    category: "docs",
  },
  {
    id: "gcalendar",
    name: "Google Calendar",
    description: "Sincronização de eventos e compromissos por branch.",
    icon: "CalendarDays",
    connected: false,
    scopes: ALL_BRANCHES,
    category: "calendar",
  },
  {
    id: "whatsapp",
    name: "WhatsApp (Twilio)",
    description: "Envio e recebimento de mensagens via Twilio WhatsApp API.",
    icon: "MessageSquare",
    connected: false,
    scopes: ALL_BRANCHES,
    category: "messaging",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Leitura de issues e criação de cards via API — o maestro lê e abre tarefas.",
    icon: "LayoutDashboard",
    connected: false,
    scopes: ALL_BRANCHES,
    category: "pm",
  },
];
