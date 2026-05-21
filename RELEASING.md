# Releasing

The release pipeline is automated via GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)).
A `git push` of a tag named `v<semver>` will run the full test+build,
publish the extension to the VSCode Marketplace, and create a GitHub Release
with the `.vsix` attached.

## One-time setup

### 1. Create a marketplace publisher

1. Open <https://aka.ms/vscode-create-publisher>.
2. Sign in with a Microsoft account (creates an Azure DevOps org if you don't have one).
3. Pick a unique publisher ID (must be globally unique — e.g. `your-handle`).
4. Confirm.

### 2. Generate a Personal Access Token (PAT)

1. Sign in to <https://dev.azure.com/>.
2. User Settings → Personal Access Tokens → "New Token".
3. Settings:
   - Name: `vscode-marketplace`
   - Organization: `All accessible organizations`
   - Expiration: 1 year (or "Custom defined" + max)
   - Scopes: **Custom defined** → check **Marketplace > Manage** (only this).
4. Copy the token. You'll see it once.

### 3. Add the PAT as a GitHub secret

1. Repo on GitHub → Settings → Secrets and variables → Actions → New repository secret.
2. Name: `VSCE_PAT`
3. Value: the token from step 2.

### 4. Fill in the package.json placeholders

Search for `TODO-PUBLISHER` and `TODO-OWNER` across the repo and replace with:
- `TODO-PUBLISHER` → your marketplace publisher ID.
- `TODO-OWNER` → your GitHub username/org.

Files affected: `package.json`, `README.md`.

### 5. Replace the marketplace icon

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
git tag -f v$(node -p "require('./package.json').version")

# 3. Push
git push origin master --follow-tags
```

The `Release` workflow will:
1. Verify the tag matches `package.json` version.
2. Run `npm test` + `npm run build`.
3. `vsce package` → produces `claude-todos-X.Y.Z.vsix`.
4. `vsce publish` → uploads to the marketplace.
5. Create a GitHub Release with the `.vsix` attached and `CHANGELOG.md` as the body.

## Manual rollback

If a release goes wrong, you can unpublish the version from the marketplace:

```bash
npx vsce unpublish TODO-PUBLISHER.claude-todos@X.Y.Z
```

(Only the most recent version can be unpublished. For older versions, the marketplace UI is needed.)
