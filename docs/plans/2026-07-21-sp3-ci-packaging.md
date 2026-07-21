# SP3 — CI, empacotamento e publicação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin publicável: CI dos dois toolchains (com gate `tsc`), release por tag gerando `.vsix` + `.zip` do plugin (versão da tag), publicação no JetBrains Marketplace via `signPlugin`/`publishPlugin` gated por secrets, e RELEASING.md documentando o fluxo (primeira submissão manual + smoke humano como pré-condição).

**Architecture:** `build.gradle.kts` lê `pluginVersion` (default `0.0.0-dev`) e ganha os blocos `signing`/`publishing` por env vars. `ci.yml` ganha `npm run typecheck` + job `jetbrains`. `release.yml` builda o plugin com a versão da tag no mesmo job do `.vsix`, anexa o zip ao Release e publica se os 4 secrets existirem. Sem código de produto novo — só o fix de tipo pré-existente do dispatcher.

**Tech Stack:** os mesmos + `actions/setup-java@v4` (temurin 21) e `gradle/actions/setup-gradle@v4`.

**Spec:** [docs/specs/2026-07-21-sp3-ci-packaging-design.md](../specs/2026-07-21-sp3-ci-packaging-design.md)

## Global Constraints

- Zero regressão: npm 295 + kotlin 32 verdes; `verifyPlugin` Compatible.
- Secrets EXATOS: `JB_MARKETPLACE_TOKEN`, `JB_CERTIFICATE_CHAIN`, `JB_PRIVATE_KEY`, `JB_PRIVATE_KEY_PASSWORD`. Sem eles: skip silencioso do publish, release válido (padrão do `OVSX_PAT` existente).
- Versão: builds locais sem property = `0.0.0-dev`; release = versão da tag (`${GITHUB_REF_NAME#v}`); `workflow_dispatch` sem tag = `0.0.0-dev` (dry run).
- Gradle local: `cmd //c "C:\@work\MyProjects\claude-todos-vscode\jetbrains\gradlew.bat" <task> --console=plain` cwd=`jetbrains/`, FOREGROUND. npm na raiz.
- Commits pt-BR, rodapé `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: fix de tipo do dispatcher + gate `typecheck`

**Files:**
- Modify: `src/core/dispatcher.ts` (branch `default` do switch)
- Modify: `package.json` (script)

- [ ] **Step 1: Reproduce**

Run: `npx tsc --noEmit` na raiz.
Expected: erro em `src/core/dispatcher.ts` (~linha 100): `Property 'id' does not exist on type 'never'` (o switch exaustivo estreita `cmd` para `never` no `default`).

- [ ] **Step 2: Fix**

No `default:` do dispatcher, substituir o uso de `cmd` estreitado:

```ts
default: {
  const c = cmd as { cmd: string; id?: string };
  emit(withId({ ev: 'error', message: `unknown command: ${c.cmd}` }, c.id));
}
```

Em `package.json`, scripts: `"typecheck": "tsc --noEmit",` (antes de `"test"`).

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → limpo (exit 0). `npm test` → 295 PASS (o teste existente `unknown command` com id continua cobrindo o comportamento).

- [ ] **Step 4: Commit**

```bash
git add src/core/dispatcher.ts package.json
git commit -m "fix(core): narrowing do default no dispatcher + script typecheck (SP3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `build.gradle.kts` — versão por property, signing/publishing, listing

**Files:**
- Modify: `jetbrains/build.gradle.kts`
- Modify: `jetbrains/src/main/resources/META-INF/plugin.xml` (vendor email)
- Create: `jetbrains/src/main/resources/META-INF/pluginIcon.svg`

- [ ] **Step 1: build.gradle.kts**

Trocar `version = "0.1.0"` por:

```kotlin
// Versão vem da tag no release (-PpluginVersion=X.Y.Z); local = 0.0.0-dev.
version = providers.gradleProperty("pluginVersion").getOrElse("0.0.0-dev")
```

No bloco `intellijPlatform { ... }`, adicionar após `pluginConfiguration`:

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

Dentro de `pluginConfiguration`, adicionar:

```kotlin
changeNotes = "See <a href=\"https://github.com/carlosdealmeida/claude-todos-vscode/releases\">GitHub Releases</a>."
vendor {
    name = "carlosdealmeida"
    url = "https://github.com/carlosdealmeida/claude-todos-vscode"
    email = "carlos.dealmeiida@gmail.com"
}
```

- [ ] **Step 2: plugin.xml + ícone**

`plugin.xml`: `<vendor url="..." email="carlos.dealmeiida@gmail.com">carlosdealmeida</vendor>`.

Criar `jetbrains/src/main/resources/META-INF/pluginIcon.svg` (cópia do media/icon.svg com cor FIXA — `currentColor` renderiza preto/invisível no marketplace):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3574F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 11l3 3L22 4"/>
  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
</svg>
```

- [ ] **Step 3: Verify locally**

```bash
cd jetbrains && cmd //c gradlew.bat -PpluginVersion=9.9.9 buildPlugin --console=plain
ls build/distributions/    # esperado: claude-todos-jetbrains-9.9.9.zip
cmd //c gradlew.bat buildPlugin --console=plain
ls build/distributions/    # esperado: também claude-todos-jetbrains-0.0.0-dev.zip
cmd //c gradlew.bat test verifyPlugin --console=plain   # 32 verdes, Compatible
```

(Sem os env vars de signing, `buildPlugin` não assina — correto; `signPlugin` só roda no release.)

- [ ] **Step 4: Commit**

```bash
git add jetbrains/build.gradle.kts jetbrains/src/main/resources/META-INF/
git commit -m "feat(jetbrains): versão por pluginVersion, signing/publishing por env, vendor + pluginIcon (SP3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `ci.yml` — typecheck + job jetbrains

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Edit**

No job `test`, adicionar entre `npm ci` e `npm test`:

```yaml
      - run: npm run typecheck
```

Adicionar job novo (mesmo nível de `test`):

```yaml
  jetbrains:
    name: JetBrains plugin
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - run: npm ci

      # syncWebAssets do Gradle consome ../dist (webview + core + hook)
      - run: npm run build

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - uses: gradle/actions/setup-gradle@v4

      - name: Test, build & verify plugin
        working-directory: jetbrains
        run: ./gradlew test build verifyPlugin --console=plain
```

- [ ] **Step 2: Validate YAML**

Run: `node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf-8'));console.log('yaml ok')"` (js-yaml está em node_modules? se não: `npx yaml-lint` ou validação com python `python -c "import yaml,io;yaml.safe_load(io.open('.github/workflows/ci.yml',encoding='utf-8'));print('ok')"`).
Expected: ok.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate tsc --noEmit + job do plugin JetBrains (test/build/verifyPlugin) (SP3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `release.yml` — plugin no release por tag + publish gated

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Edit**

Inserir APÓS o step "Upload .vsix as workflow artifact" e ANTES de "Create GitHub Release":

```yaml
      # --- JetBrains plugin -------------------------------------------------
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      - uses: gradle/actions/setup-gradle@v4

      - name: Resolve plugin version
        run: |
          if [ "${GITHUB_REF_TYPE}" = "tag" ]; then
            echo "PLUGIN_VERSION=${GITHUB_REF_NAME#v}" >> "$GITHUB_ENV"
          else
            echo "PLUGIN_VERSION=0.0.0-dev" >> "$GITHUB_ENV"
          fi

      - name: Build JetBrains plugin
        working-directory: jetbrains
        run: ./gradlew -PpluginVersion="$PLUGIN_VERSION" buildPlugin --console=plain

      - name: Upload plugin zip as workflow artifact
        uses: actions/upload-artifact@v4
        with:
          name: jetbrains-plugin
          path: jetbrains/build/distributions/*.zip
```

No step "Create GitHub Release", trocar `files:` por lista:

```yaml
        with:
          files: |
            ${{ steps.package.outputs.vsix }}
            jetbrains/build/distributions/*.zip
          body_path: CHANGELOG.md
          draft: false
          prerelease: false
```

Adicionar AO FINAL do arquivo (após o bloco do Open VSX):

```yaml
      # --- JetBrains Marketplace -------------------------------------------
      # Publishes (signed) when the 4 JB_* secrets exist; skips silently
      # otherwise. First-ever submission must be done manually via the web UI
      # (vendor creation + initial review) — see RELEASING.md.
      - name: Publish to JetBrains Marketplace
        env:
          JB_MARKETPLACE_TOKEN: ${{ secrets.JB_MARKETPLACE_TOKEN }}
          JB_CERTIFICATE_CHAIN: ${{ secrets.JB_CERTIFICATE_CHAIN }}
          JB_PRIVATE_KEY: ${{ secrets.JB_PRIVATE_KEY }}
          JB_PRIVATE_KEY_PASSWORD: ${{ secrets.JB_PRIVATE_KEY_PASSWORD }}
        if: env.JB_MARKETPLACE_TOKEN != '' && startsWith(github.ref, 'refs/tags/v')
        working-directory: jetbrains
        run: ./gradlew -PpluginVersion="$PLUGIN_VERSION" signPlugin publishPlugin --console=plain
```

- [ ] **Step 2: Validate YAML** (mesmo método da Task 3) + revisar o diff com atenção (workflow de release não tem dry-run barato; o `workflow_dispatch` existente vira o teste a seco: sem tag → `PLUGIN_VERSION=0.0.0-dev`, release step pula por `if`, publish pula por `if`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): zip do plugin JetBrains no release da tag + publishPlugin gated por secrets (SP3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: RELEASING.md — seção JetBrains

**Files:**
- Modify: `RELEASING.md`

- [ ] **Step 1: Add section** (após a seção do Open VSX / Marketplace manual, antes de "Removing a version"):

```markdown
## JetBrains Marketplace

O release por tag também builda o plugin JetBrains (`claude-todos-jetbrains-X.Y.Z.zip`,
anexado ao GitHub Release) e — quando os secrets existem — assina e publica via
`signPlugin`/`publishPlugin`.

### One-time setup

1. **Vendor**: crie o vendor em <https://plugins.jetbrains.com> (mesma conta do GitHub
   funciona). O plugin id `com.carlosdealmeida.claude-todos` é imutável após a primeira
   publicação.
2. **Chaves de assinatura** (uma vez):

   ```bash
   openssl genpkey -aes-256-cbc -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:4096
   openssl req -key private.pem -new -x509 -days 3650 -out chain.crt -subj "/CN=carlosdealmeida"
   ```

3. **Secrets no GitHub** (Settings → Secrets → Actions):
   - `JB_MARKETPLACE_TOKEN` — token permanente de <https://plugins.jetbrains.com/author/me/tokens>
   - `JB_CERTIFICATE_CHAIN` — conteúdo de `chain.crt`
   - `JB_PRIVATE_KEY` — conteúdo de `private.pem`
   - `JB_PRIVATE_KEY_PASSWORD` — a senha usada no `genpkey`

   Sem os secrets, o passo de publicação é pulado silenciosamente — o zip continua no
   GitHub Release para upload manual.

### Primeira publicação (manual)

1. **Pré-condição: o smoke humano do plugin** (gate SP1+SP2 — ver
   `docs/specs/2026-07-17-jetbrains-port-overview.md`): `cd jetbrains && gradlew runIde`,
   abrir um projeto com sessões Claude Code e validar painel/tema/picker/clique/toasts/hook.
   Não submeter ao marketplace um plugin que nunca abriu num IDE real.
2. Baixe o `.zip` do GitHub Release e faça o upload em
   <https://plugins.jetbrains.com/plugin/add> (categoria: Tools integration).
3. Aguarde a revisão inicial da JetBrains (~2 dias úteis).

### Updates

Automáticos: a cada tag `v*`, o workflow assina e publica (aparece como update pendente de
revisão leve no marketplace). Confira o passo "Publish to JetBrains Marketplace" no run.
```

- [ ] **Step 2: Commit**

```bash
git add RELEASING.md
git commit -m "docs(releasing): fluxo JetBrains Marketplace — chaves, secrets, primeira publicação e gate de smoke (SP3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: fechamento

**Files:**
- Modify: `docs/specs/2026-07-17-jetbrains-port-overview.md` (célula SP3)

- [ ] **Step 1:** Suites finais: raiz `npm run typecheck` + `npm test` + `npm run build`; jetbrains `test build verifyPlugin`. Tudo verde; totais exatos.
- [ ] **Step 2:** Overview, célula "Entregável" do SP3: prefixar `🚧 **automação pronta YYYY-MM-DD — falta smoke humano + primeira submissão manual** (commits <range>) — ` mantendo o texto.
- [ ] **Step 3: Commit**

```bash
git add docs/specs/2026-07-17-jetbrains-port-overview.md
git commit -m "docs(specs): SP3 — automação de CI/release/publicação pronta (porta JetBrains)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
