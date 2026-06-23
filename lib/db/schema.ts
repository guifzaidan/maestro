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

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Message = typeof messages.$inferSelect;
