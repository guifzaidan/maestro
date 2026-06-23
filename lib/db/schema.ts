import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Tarefas do hub. `workspace` é o branch (dux|sheep|pessoal), `list` é o dia
 * da semana (seg..dom). `tools` guarda um JSON array de ids de conector.
 */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  workspace: text("workspace").notNull(),
  list: text("list"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  due: text("due"),
  tools: text("tools"),
  instruction: text("instruction"),
  createdAt: integer("created_at").notNull(),
});

/** Uma execução/conversa do maestro. */
export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  workspace: text("workspace").notNull(),
  status: text("status").notNull(), // chatting | executing | done | interrupted
  createdAt: integer("created_at").notNull(),
});

/** Eventos de uma run: mensagens de chat, chamadas de ferramenta, logs. */
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  role: text("role").notNull(), // user | assistant | tool | log
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

/**
 * Conexões/integrações configuradas pela UI. `connector` é o id do conector
 * (claude|gdrive|turso|notion…). `config` guarda JSON de campos não-secretos
 * (url, número, etc.). `secret` guarda o token/key CIFRADO (AES-256-GCM).
 */
export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  connector: text("connector").notNull(),
  workspace: text("workspace"),
  name: text("name"),
  config: text("config"),
  secret: text("secret"),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
