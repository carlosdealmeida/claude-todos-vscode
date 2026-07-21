# Releasing

The build is automated via GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)).
A `git push` of a tag named `v<semver>` runs the full test+build, produces
the `.vsix`, and creates a GitHub Release with it attached.

**Publishing to the Marketplace is done manually** — you download the
`.vsix` from the GitHub Release and upload it through the web UI. No
Personal Access Token needed. (If you ever want fully automated publishing,
see the commented-out step at the bottom of `release.yml`.)

## One-time setup

### 1. Marketplace publisher / GitHub owner

This repo is wired to:
- Marketplace publisher: **`CarlosJunior1992`**
- GitHub owner: **`carlosdealmeida`**

The publisher already exists at <https://marketplace.visualstudio.com/manage>.
If you fork or rename, search the repo for those values and update
`package.json`, `README.md`, and this file.

### 2. Replace the marketplace icon

`media/icon.png` is currently a 1×1 transparent placeholder. Replace it with a
real 128×128 (or 256×256) PNG. See the icon brief in `media/README.md`.

## Cutting a release

```bash
# 1. Bump the version
npm version patch    # or minor, major. updates package.json + creates a tag

# 2. Edit CHANGELOG.md — add a "[X.Y.Z] - YYYY-MM-DD" section above the previous one.
$EDITOR CHANGELOG.md
git add CHANGELOG.md
git commit --amend --no-edit   # fold the changelog into the version-bump commit
VERSION=$(node -p "require('./package.json').version")
git tag -fa "v$VERSION" -m "v$VERSION"   # -a matters: see note below

# 3. Push
git push origin master --follow-tags

# 4. Confirm the tag reached the remote (this is what triggers the workflow)
git ls-remote --tags origin "v$VERSION"
```

> **Why `-fa` and not `-f`:** the amend in step 2 moves the branch, so the tag
> `npm version` created must be recreated. A plain `git tag -f` produces a
> *lightweight* tag, and `git push --follow-tags` only pushes *annotated* tags —
> the tag silently never leaves your machine and the Release workflow never
> fires (this happened on 0.13.0). `-a` keeps the tag annotated. If step 4
> prints nothing, push the tag explicitly: `git push origin "v$VERSION"`.

The `Release` workflow will:
1. Verify the tag matches `package.json` version.
2. Run `npm test` + `npm run build`.
3. `vsce package` → produces `claude-todos-X.Y.Z.vsix`.
4. Create a GitHub Release with the `.vsix` attached and `CHANGELOG.md` as the body.

## Publishing to the Marketplace (manual)

1. Open the GitHub Release the workflow created and download `claude-todos-X.Y.Z.vsix`.
2. Go to <https://marketplace.visualstudio.com/manage> and sign in.
3. **First release:** `New extension → Visual Studio Code` → upload the `.vsix`.
4. **Updates:** find the extension in the list → `...` menu → `Update` → upload the new `.vsix`.
5. The Marketplace re-reads `README.md` and `CHANGELOG.md` from inside the
   `.vsix` automatically — no extra steps for docs.

Verification can take a few minutes. The listing goes live once it passes.

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

## Removing a version

From <https://marketplace.visualstudio.com/manage>, open the extension and
use the `...` menu to unpublish or remove a specific version.
