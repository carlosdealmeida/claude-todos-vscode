# SP3 — CI, empacotamento e publicação (JetBrains) — design

**Porta JetBrains, sub-projeto 3 (final).** Ver [overview](2026-07-17-jetbrains-port-overview.md) ·
depende do SP2 (🚧 implementado — smoke humano pendente).
**Entregável:** plugin publicável — CI cobrindo os dois toolchains, release único gerando
`.vsix` + `.zip` assinado, publicação automatizada no JetBrains Marketplace gated por secrets.

## Decisões (fechadas no brainstorm 2026-07-21)

1. **Versão sincronizada, mesma tag** — a tag `v*` é a fonte única de versão dos dois
   artefatos. O plugin lê `pluginVersion` por Gradle property; sem ela, `0.0.0-dev` (builds
   locais nunca colidem com releases).
2. **`publishPlugin` automatizado** com assinatura, gated por secrets — mesmo padrão do
   `OVSX_PAT` do release atual: sem os secrets, o passo pula silenciosamente e o release
   continua válido (zip anexado ao GitHub Release).
3. **Primeira submissão manual** pela web UI (criação de vendor + revisão inicial da
   JetBrains); `publishPlugin` assume dali em diante.
4. **Smoke humano é pré-condição de submissão** — o gate GUI pendente (SP1+SP2) precisa
   passar antes do primeiro upload ao marketplace. Documentado no RELEASING.md.

## Mudanças

### `jetbrains/build.gradle.kts`
- `version = providers.gradleProperty("pluginVersion").getOrElse("0.0.0-dev")` (substitui o
  `version = "0.1.0"` fixo).
- Bloco `intellijPlatform`:
  ```kotlin
  signing {
      certificateChain = providers.environmentVariable("JB_CERTIFICATE_CHAIN")
      privateKey = providers.environmentVariable("JB_PRIVATE_KEY")
      password = providers.environmentVariable("JB_PRIVATE_KEY_PASSWORD")
  }
  publishing {
      token = providers.environmentVariable("JB_MARKETPLACE_TOKEN")
  }
  ```
- `pluginConfiguration`: `changeNotes` estático apontando para
  `https://github.com/carlosdealmeida/claude-todos-vscode/releases`; `vendor` com
  `name`/`url`/`email` (paridade com o publisher do VS Code).

### Erro de tipo pré-existente + gate `tsc`
- Corrigir `src/core/dispatcher.ts` (branch `default` do switch): `cmd` está estreitado para
  `never`, então `cmd.id` não compila sob `tsc --noEmit`. Fix no padrão que a linha já usa:
  `const c = cmd as { cmd: string; id?: string };` e usar `c.cmd`/`c.id`.
- `package.json`: script `"typecheck": "tsc --noEmit"`.

### `ci.yml`
- Job `test` (npm) ganha o passo `npm run typecheck` (antes do `npm test`).
- Job novo `jetbrains`: checkout → setup-node 20 + `npm ci` + `npm run build` (o
  `syncWebAssets` exige `dist/`) → setup-java 21 (temurin) → `gradle/actions/setup-gradle`
  (cache) → `./gradlew test build verifyPlugin --console=plain` em `jetbrains/`.

### `release.yml` (mesmo job, após o empacotamento do `.vsix`)
- setup-java 21 + setup-gradle.
- `./gradlew -PpluginVersion=$TAG_VERSION buildPlugin --console=plain` — sempre; o zip
  (`jetbrains/build/distributions/claude-todos-jetbrains-$V.zip`) entra nos arquivos do
  GitHub Release junto do `.vsix`.
- `signPlugin` + `publishPlugin` num passo **condicionado à presença dos 4 secrets**
  (`JB_MARKETPLACE_TOKEN`, `JB_CERTIFICATE_CHAIN`, `JB_PRIVATE_KEY`,
  `JB_PRIVATE_KEY_PASSWORD`); ausentes → log de skip, release segue.

### Listing
- `jetbrains/src/main/resources/META-INF/pluginIcon.svg` — cópia commitada de
  `media/icon.svg` (o marketplace exige o ícone nesse path; 40×40 recomendado — o SVG atual
  é escalável, serve).
- `plugin.xml`: `<vendor>` ganha `email` e mantém `url`; descrição atual já adequada.

### `RELEASING.md` — seção nova "JetBrains Marketplace"
- Gerar par de chaves de assinatura (comandos `openssl genpkey`/`req` documentados) e onde
  guardar; configurar os 4 secrets no GitHub.
- Primeira publicação: criar vendor no marketplace, **rodar o smoke humano (gate SP1+SP2)**,
  baixar o zip do GitHub Release, upload manual, aguardar revisão.
- Updates: automáticos via tag (o `publishPlugin` cuida); conferir o passo no workflow run.
- Nota: o namespace/vendor do plugin (`com.carlosdealmeida.claude-todos`) é imutável após a
  primeira publicação.

### Overview
- Marcar SP3 na tabela ao concluir (🚧 até o smoke humano + primeira submissão; a parte de
  automação/CI fica ✅ de imediato — a célula distingue as duas coisas).

## Fora de escopo (SP3)

- Extração automática do changeNotes do CHANGELOG (estático por ora).
- Ícone dedicado do plugin (reuso do SVG existente).
- Automação da primeira submissão (manual por decisão 3).
- Rodar o smoke humano (é gate do humano, não task de agente).

## Testes / verificação

- `npm run typecheck` limpo (com o fix do dispatcher) + suíte npm intacta.
- `./gradlew -PpluginVersion=9.9.9 buildPlugin` local: zip gerado com a versão certa no
  nome e no plugin.xml interno (unzip + grep).
- Build local SEM `pluginVersion`: `0.0.0-dev`.
- CI: os dois jobs verdes num push de branch.
- Release: disparo por tag em branch de teste NÃO faz parte (tags são de release real);
  validação do YAML por `workflow_dispatch` a seco onde aplicável + review humano do diff.
