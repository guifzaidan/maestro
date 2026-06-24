import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Branches (contextos de trabalho): DUX, Sheep Tech, Pessoal, etc.
 * `claudeToken` é o token da API Claude da branch, CIFRADO (AES-256-GCM).
 * Nunca é exposto em claro ao cliente — só decifrado no servidor.
 */
export const branches = sqliteTable("branches", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  short:       text("short").notNull(),
  icon:        text("icon").notNull(),
  accent:      text("accent").notNull(),
  accent2:     text("accent2").notNull(),
  accentSoft:  text("accent_soft").notNull(),
  tagline:     text("tagline"),
  sort:        integer("sort").notNull().default(0),
  claudeToken: text("claude_token"),
  createdAt:   integer("created_at").notNull(),
});

/**
 * Tarefas do hub. `branch` é o id da branch (coluna branch_id, FK → branches.id).
 * `list` é o dia da semana (seg..dom). `tools` guarda JSON array de ids de conector.
 */
export const tasks = sqliteTable("tasks", {
  id:               text("id").primaryKey(),
  title:            text("title").notNull(),
  branch:           text("branch_id").notNull().references(() => branches.id),
  list:             text("list"),
  done:             integer("done", { mode: "boolean" }).notNull().default(false),
  due:              text("due"),
  tools:            text("tools"),
  instruction:      text("instruction"),
  createdAt:        integer("created_at").notNull(),
  sourceConnection: text("source_connection"),
  sourceTable:      text("source_table"),
  sourcePk:         text("source_pk"),
});

/** Uma execução/conversa do maestro. */
export const agentRuns = sqliteTable("agent_runs", {
  id:        text("id").primaryKey(),
  branch:    text("branch_id").notNull().references(() => branches.id),
  status:    text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Eventos de uma run: mensagens de chat, chamadas de ferramenta, logs. */
export const messages = sqliteTable("messages", {
  id:        text("id").primaryKey(),
  runId:     text("run_id").notNull(),
  role:      text("role").notNull(),
  content:   text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

/**
 * Conexões/integrações configuradas pela UI. `connector` é o id do conector
 * (claude|gdrive|turso|notion…). `branch` é o id da branch (coluna branch_id,
 * FK → branches.id). `config` guarda JSON não-secreto. `secret` é o token CIFRADO.
 */
export const connections = sqliteTable("connections", {
  id:        text("id").primaryKey(),
  connector: text("connector").notNull(),
  branch:    text("branch_id").references(() => branches.id),
  name:      text("name"),
  config:    text("config"),
  secret:    text("secret"),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Branch       = typeof branches.$inferSelect;
export type NewBranch    = typeof branches.$inferInsert;
export type Task         = typeof tasks.$inferSelect;
export type NewTask      = typeof tasks.$inferInsert;
export type AgentRun     = typeof agentRuns.$inferSelect;
export type Message      = typeof messages.$inferSelect;
export type Connection   = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
