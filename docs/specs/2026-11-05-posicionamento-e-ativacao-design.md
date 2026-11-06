# Posicionamento e ativação da lista de tarefas — design

**Roadmap:** R2, passo 3 (decisão de posicionamento), com o que sobrou dos passos 1 e 2. Decidido
em 2026-11-05.

## A decisão

**A lista de tarefas é o coração do Claude Todos.** Quem abre o painel quer saber duas coisas: o
que está rodando agora e como estão as tarefas em andamento. Sem a lista, falta o principal. A
árvore de agentes, os tokens, o contexto e as notificações são o contexto em volta da lista, não
um produto separado.

Por isso a tese que estava no roadmap, de reposicionar para "observability" e rebaixar a lista a
recurso opt-in, **cai**. E o reposicionamento do item 18 (0.14.0), que pôs "observability" no
título do README e na descrição das lojas, é **desfeito em parte**: a vitrine volta a abrir pela
lista, e a observability passa a ser o que vem junto.

O problema real que a 2.1.233 criou é de **ativação**, não de posicionamento. Desde essa versão o
coração vem desligado de fábrica nos modelos novos, e o usuário novo precisa ligar
`CLAUDE_CODE_ENABLE_TODO_TOOLS` para ter o produto de verdade. **Sucesso = quem instala liga a flag
nos primeiros minutos.** Tudo neste documento serve a isso.

### Destino dos itens que esperavam a decisão

| Item | Destino |
|---|---|
| 8 — histórico global entre projetos | Backlog comum, sem bloqueio. Observability pura; só se houver pedido. |
| 23 — background tasks (shells) no painel | Backlog comum, sem bloqueio. Mesmo motivo. |
| 25(b) — mod "Claude Todos" no terminal | Continua parado. O terminal já tem `Ctrl+T`; o diferencial está no painel do editor. |
| `mcp__ccd_turn__update_plan` (desktop, R2) | Backlog comum, prioridade baixa. Encaixa na tese, mas quem usa o desktop já vê a lista lá. |
| Lacuna (b) do R2 passo 1 (flag do IDE ≠ flag do shell) | Fica como está; o próprio botão de ativar resolve. |

## Objetivos

1. A pessoa que instala sabe, antes de instalar, que a lista depende da flag e que a extensão liga
   com um clique.
2. Logo depois de instalar (ou atualizar), antes da primeira sessão, a extensão oferece ligar a
   flag.
3. Enquanto a flag estiver desligada, o painel sempre diz isso — inclusive em sessões com
   sub-agents (hoje a dica some nesse caso: lacuna (a) do R2 passo 1).
4. VS Code e JetBrains se comportam igual.

## Não-objetivos

- Mudar o nome da extensão.
- Ler o formato `update_plan` do desktop.
- Detectar a versão do Claude Code ou o modelo antes de existir uma sessão.
- Tratar a divergência entre o ambiente do IDE e o do shell.
- Ligar a flag sem perguntar.

## Anti-objetivos (o que faria isto fracassar mesmo funcionando)

- Gravar no `settings.json` sem a confirmação modal que já existe.
- Duas notificações da extensão empilhadas na primeira abertura.
- Uma faixa que grita em quem usa modelo antigo, que ainda tem as ferramentas, ou em quem já
  desligou a flag de propósito (`"0"`).
- Um usuário que clicou em "Não perguntar mais" continuar recebendo a notificação.
- Quebrar a extração da landing do site a partir do README.

## Peças

### 1. Notificação na ativação da extensão

Quando a extensão ativa (VS Code: `activate`, que roda em `onStartupFinished`; JetBrains: **ao
abrir o projeto**, não quando a tool window abre — ver "JetBrains" abaixo):

- **Condição para mostrar:** a flag está **ausente** em todas as fontes que o
  `TaskToolsFlagReader` já lê (ambiente do processo, `~/.claude/settings.json` e os dois settings
  de projeto de **cada** pasta do workspace) **e** o usuário não clicou em "Não perguntar mais".
  - Se qualquer fonte estiver `on`, não mostra.
  - Se alguma estiver `off` explícito, não mostra: o usuário já decidiu. Mesma regra do
    `evaluateTaskTools`. *(Chamada minha.)*
- **Sem checagem de versão nem de modelo** — antes da primeira sessão não há como saber. O texto
  diz que vale "no Claude Code 2.1.233+ com os modelos novos".
- **Botões:**
  - **Ativar** → o mesmo fluxo de hoje: confirmação modal mostrando o caminho, grava, avisa.
  - **Agora não** → não grava nada. A notificação volta na próxima ativação.
  - **Não perguntar mais** → grava a dispensa (VS Code: `globalState`; JetBrains:
    `PropertiesComponent`) e a notificação nunca mais aparece.
- **Quem atualiza** de uma versão antiga sem a flag recebe pelas mesmas regras; não há caso
  especial.
- **Convivência com o convite do hook** (`maybePromptInstallHook`, que já sai na ativação com os
  mesmos três botões): **nunca duas notificações da extensão ao mesmo tempo**. *(Chamadas minhas.)*
  - Convite do hook não precisa aparecer (já instalado, dispensado ou `autoInstallHook` desligado)
    → a notificação da flag sai direto.
  - Convite respondido com **Instalar** → a confirmação "hook instalado" (`hook.installedAuto`)
    **não** sai como toast separado quando a notificação da flag vai sair em seguida; a
    notificação da flag ocupa o lugar dela (o texto pode abrir dizendo que o hook foi instalado).
    Se o hook falhar, o erro sai como hoje e a notificação da flag vem depois dele.
  - Convite respondido com **Agora não** ou **Não perguntar mais** → a notificação da flag sai
    em seguida.
  - Convite **ignorado** (o toast foi para a central de notificações sem clique e a promise fica
    pendente) → a notificação da flag **não** sai nesta ativação; volta na próxima. Nesse meio
    tempo a faixa do painel (peça 2) cobre.
- **JetBrains — decidido em 2026-11-05: ao abrir o projeto**, igual ao VS Code, mesmo que o painel
  nunca seja aberto.
  - Uma `ProjectActivity` (registrada como `postStartupActivity` no `plugin.xml`) lê a flag
    **direto em Kotlin**: a variável de ambiente, `~/.claude/settings.json` (respeitando o
    `claudeDir` configurado, se houver) e os dois settings de projeto do base path. É uma
    duplicação pequena e consciente do `TaskToolsFlagReader`, com as mesmas regras (`on` vence,
    `off` explícito conta como decisão, arquivo ilegível conta como ausente). O sidecar continua
    preso à tool window, sem mudança de ciclo de vida.
  - O botão **Ativar** dessa notificação precisa gravar sem depender do sidecar estar de pé. Como
    fazer (subir o sidecar sob demanda, abrir o painel e reaproveitar o fluxo atual, ou gravar em
    Kotlin com a mesma proteção contra `settings.json` inválido) fica com quem implementa, desde
    que passe pela confirmação modal e preserve as outras chaves.
  - O convite do hook continua onde está (abertura da tool window). Se a tool window abrir já na
    inicialização, vale a mesma regra de nunca empilhar.
  - Usa o grupo `claude-todos-sticky`, como o convite do hook, para não sumir sozinha. A dispensa
    vale para a aplicação inteira (`PropertiesComponent` de aplicação), não por projeto.
- **Textos novos:** em 5 idiomas (en, pt-br, es, zh-cn, zh-tw), nos dois catálogos
  (`src/i18n/messages.ts` e `NotifyMessages.kt`).

### 2. Faixa no painel enquanto a flag estiver desligada

- **Quando aparece:** a sessão exibida tem versão ≥ 2.1.233, modelo do main entre os que perdem as
  ferramentas e flag ausente — o `evaluateTaskTools` atual — **e nenhum agente da sessão chamou
  a ferramenta de lista** (`TodoWrite` ou `TaskCreate`/`TaskUpdate`) nenhuma vez. Um agente que
  chamou a ferramenta conta mesmo que a lista dele esteja vazia agora: a ferramenta está
  funcionando (por exemplo, com a flag só no ambiente do shell, a lacuna (b)), e a faixa seria
  falso alarme. *(Chamada minha.)* Hoje o parser lista todo `agent-*.jsonl` mesmo sem tarefas,
  então "estar em `agents`" não basta como sinal; o snapshot precisa saber se houve chamada.
- **Sai a condição `agents.length === 0`** de [snapshotService.ts:126](../../src/services/snapshotService.ts#L126). É ela que esconde a dica em
  sessões com sub-agents.
- **Onde e como:**
  - Sem nenhum agente na lista, continua o **estado vazio grande** de hoje (título, explicação,
    botão).
  - Com agentes na lista (sub-agents sem tarefas), entra uma **faixa discreta no topo**, sempre
    visível: texto curto ("Lista de tarefas desligada neste Claude Code") e o mesmo botão
    **Ativar**, que dispara o fluxo com confirmação.
  - A faixa fica **abaixo** da faixa de perguntas pendentes, que é mais urgente. *(Chamada minha.)*
- **"Não perguntar mais" não esconde a faixa.** A faixa é informação, não pergunta; quem não quer
  vê-la liga a flag ou a desliga explicitamente com `"0"`.
- **Temas:** a faixa precisa funcionar nos cinco temas (Clássico, Papel, Painel, Terminal, Mission
  Control), em claro e escuro, usando os tokens e traços de cada tema como as outras faixas. Entra
  um caso novo em `scripts/themeShots/cases.ts`.
- **JetBrains:** o painel é o mesmo webview, então a faixa vem junto. O botão já passa pelo
  `MessageRouter` (`enableTaskTools`).

### 3. Vitrine

**Descrição curta das lojas** — `extension.description` nos 5 `package.nls*.json` e a primeira
frase do `<description>` do `plugin.xml`. Base em inglês, traduzida para os outros quatro:

> Live task list for your Claude Code agents, with agent tree, tokens and cache — scoped to your
> workspace. Claude Code 2.1.233+: task tools are off by default; the extension turns them on in
> one click.

**READMEs** (os 5 idiomas):

- O título deixa de ser "Observability para seus agentes Claude Code" e passa a ser a lista ao
  vivo — em pt-br, algo como "A lista de tarefas dos seus agentes Claude Code, ao vivo". Na mesma
  frase ou logo abaixo: árvore de agentes, tempos, tokens e contexto, restrito ao workspace, 100%
  local.
- O aviso ⚠️ sobre a 2.1.233 continua logo abaixo do GIF e passa a citar a ativação com um clique
  (notificação e faixa no painel), além do caminho manual em Instalação.
- Em "O que você vê", **tarefas em tempo real** sobe para o primeiro item; a árvore de agentes vem
  em segundo.
- **A ordem e a quantidade de seções não mudam** — a landing extrai o README por índice, e os
  testes de `tests/site` precisam continuar verdes. Conferir também se `site/src/i18n/site.ts` tem
  texto de título próprio que repita "observability".

**Também:**

- A keyword `"observability"` no `package.json` pode ficar: ela ajuda na busca e não é pitch.
  *(Chamada minha.)*
- CHANGELOG da versão nova e as notas do release do JetBrains citam a mudança.

### 4. Roadmap

No [ROADMAP.md](../ROADMAP.md):

- R2 passo 3 marcado como decidido, com link para este documento.
- Itens 8 e 23 sem o "bloqueado por posicionamento".
- Passo 2 com a descrição da loja resolvida.
- Lacuna (a) fechada, quando entregue.

## Restrições

- Toda gravação no `settings.json` passa pelo `core.enableTaskTools()` atual, atrás da confirmação
  modal. Um `settings.json` inválido continua protegido contra sobrescrita (0.19.0).
- A ativação da extensão não pode falhar por causa da leitura da flag: leitura tolerante, como a do
  `TaskToolsFlagReader`.
- Paridade de idiomas: toda chave nova nos 5 idiomas, nos dois catálogos.
- Paridade de hosts: VS Code e JetBrains na mesma versão.

## Fica com quem implementa

- Nome do campo novo (ou mudança de semântica do `taskToolsOff`) no snapshot e no protocolo do
  sidecar.
- Texto exato da faixa e da notificação, dentro do tom dos textos atuais.
- Visual da faixa em cada tema.
- Testes: unidade para a condição da faixa (com e sem sub-agents, agente que chamou a ferramenta
  com lista vazia, modelo antigo, flag `off`) e para a condição da notificação (ausente, `on`,
  `off`, dispensada, multi-root), nos dois leitores (TypeScript e Kotlin); teste do
  sequenciamento com o convite do hook.
- Divisão em commits e o número da versão.
