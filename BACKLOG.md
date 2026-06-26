# Backlog de implementações

## Integrações / Turso

- **Write-back para banco de origem** — ao marcar uma task como feita ou editar campos no hub, propagar a mudança de volta ao banco Turso externo usando o mapeamento de colunas já salvo. Requer decisão de conflito quando o próximo import rodar.

---

## Integrações / Slack

- **Mensagem do Slack → task (via atalho na própria mensagem)** — transformar qualquer mensagem do Slack em task do hub clicando num botão/atalho no próprio Slack.
  - **Fluxo:** message shortcut do Slack ("Virar task no Maestro") no menu "…" da mensagem → Slack faz POST para `app/api/webhooks/slack/route.ts` → backend valida a assinatura, mapeia o workspace/canal do Slack para a branch configurada e cria a task (título = texto da mensagem; `due` = hoje, `list` = dia da semana de hoje; usuário ajusta a data depois).
  - **A construir (tudo é código, funciona assim que houver URL pública):**
    1. Card "Slack" no catálogo (`lib/mock/integrations.ts`, category `messaging`) + form pra colar **Bot Token** + **Signing Secret** na branch (padrão do Linear; connection id `slack--<branch>`).
    2. Guardar o **team/workspace id do Slack** no `config` da connection → é como o webhook descobre a branch.
    3. `lib/slack.ts` (verificação de assinatura HMAC + chamadas à API do Slack).
    4. `app/api/webhooks/slack/route.ts` — recebe o atalho, valida, cria a task na branch mapeada via `createTask`, responde efêmero "Task criada".
  - **Pré-requisito (bloqueia o teste local):** o app precisa de **URL pública HTTPS** — Slack não alcança `localhost`. Exige **deploy** (Vercel) ou túnel (ngrok). E criar **um Slack App** uma vez (Interactivity apontando pra nossa URL, atalho de mensagem, Bot Token + Signing Secret).
  - **Decisões em aberto:** (a) deploy onde/quando; (b) mapeamento Slack→branch é 1 workspace por branch, ou um mesmo workspace com canais diferentes indo pra branches diferentes?

---

## A definir

<!-- Adicione novos itens aqui -->
