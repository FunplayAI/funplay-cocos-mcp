# Funplay Cocos MCP Release Workflow

This document records the release workflow for publishing Funplay MCP for Cocos to:

- Git tags
- GitHub Releases
- Downloadable Cocos Creator extension zip packages
- npm stdio wrapper package
- Official MCP Registry

## Published Identity

- GitHub repository: `https://github.com/FunplayAI/funplay-cocos-mcp`
- Git tag format: `v<version>`
- GitHub Release tag: `v<version>`
- Extension package asset: `Funplay.CocosMcp.v<version>.zip`
- Cocos extension folder name inside the zip: `funplay-cocos-mcp`
- npm package id: `funplay-cocos-mcp`
- npm command: `funplay-cocos-mcp`
- MCP Registry server name: `io.github.FunplayAI/funplay-cocos-mcp`
- Default local MCP endpoint: `http://127.0.0.1:8765/`

## Version Alignment Rule

Keep these versions aligned:

- `package.json` `version`
- `CHANGELOG.md` release section
- Git tag `v<version>`
- GitHub Release `v<version>`
- `releases/<version>/release-manifest.json` `version`
- Release zip filename `Funplay.CocosMcp.v<version>.zip`
- `server.json` top-level version
- `server.json` npm package version

Example:

- `package.json`: `0.3.1`
- Git tag: `v0.3.1`
- GitHub Release: `v0.3.1`
- Release asset: `Funplay.CocosMcp.v0.3.1.zip`
- npm package: `funplay-cocos-mcp@0.3.1`
- MCP Registry: `0.3.1`

## Files To Update For A New Release

Update:

1. `package.json`
   - `"version": "<version>"`
2. `CHANGELOG.md`
   - add a dated release notes block
3. `server.json`
   - top-level `"version"`
   - npm package `"version"`

Optional but recommended:

4. `README.md`
5. `README_CN.md`
6. GitHub Release notes text

## Release Steps

### 1. Verify Working Tree

```bash
git status --short --branch
```

The tree should contain only intentional release changes.

### 2. Update Versions And Notes

Update `package.json` and `CHANGELOG.md`.

Use semantic versions such as `0.3.1`, and keep release headings in this format:

```markdown
## [0.3.1] - 2026-05-20
```

### 3. Run Release Verification

```bash
npm run release:verify
```

This runs:

- JavaScript syntax checks
- Node.js tests
- release metadata validation
- npm package dry-run validation
- release package generation

The generated local artifacts are written to:

```text
releases/<version>/
```

Expected contents:

- `Funplay.CocosMcp.v<version>.zip`
- `release-manifest.json`
- `SHA256SUMS.txt`
- `README.md`

### 4. Inspect The Package

The release script validates that every archive path stays under:

```text
funplay-cocos-mcp/
```

The package must not contain local/build content such as:

- `.git/`
- `.github/`
- `.DS_Store`
- `node_modules/`
- `Library/`
- `Temp/`
- `dist/`
- `build/`
- `test/`
- `scripts/`

Verify checksums:

```bash
cd releases/<version>
shasum -a 256 -c SHA256SUMS.txt
```

### 4.5 Validate npm And MCP Registry Metadata

```bash
npm run pack:dry-run
npm run registry:validate
```

The npm package must include the stdio wrapper command:

```bash
npx --yes ./funplay-cocos-mcp-<version>.tgz --version
```

### 5. Commit, Tag, And Push

```bash
git add .
git commit -m "Release v<version>"
git tag v<version>
git push origin main
git push origin v<version>
```

### 6. Create GitHub Release

Regenerate the final release artifacts from the tagged clean commit:

```bash
npm run release:package -- --strict-tag
```

If creating a new release:

```bash
gh release create v<version> \
  -R FunplayAI/funplay-cocos-mcp \
  --title "v<version>" \
  --notes-file /path/to/release-notes.md \
  releases/<version>/Funplay.CocosMcp.v<version>.zip \
  releases/<version>/release-manifest.json \
  releases/<version>/SHA256SUMS.txt \
  releases/<version>/README.md
```

If the release already exists and only assets need to be replaced:

```bash
gh release upload v<version> \
  -R FunplayAI/funplay-cocos-mcp \
  --clobber \
  releases/<version>/Funplay.CocosMcp.v<version>.zip \
  releases/<version>/release-manifest.json \
  releases/<version>/SHA256SUMS.txt \
  releases/<version>/README.md
```

### 7. Verify GitHub Release

```bash
gh release view v<version> \
  -R FunplayAI/funplay-cocos-mcp \
  --json url,assets,isDraft,isPrerelease,publishedAt
```

Confirm the release has all four assets.

### 8. Publish To npm

```bash
npm publish
```

Verify the published package:

```bash
npm view funplay-cocos-mcp@<version> version bin mcpName
```

Notes:

- `package.json` `mcpName` must match `server.json` `name`.
- If `npm publish` returns `ENEEDAUTH`, run `npm adduser` with a publishing account and retry.
- If the package name already exists under another owner, choose a scoped package name and update both `package.json` and `server.json`.

### 9. Publish To MCP Registry

Log in if needed:

```bash
mcp-publisher login github
```

Publish:

```bash
mcp-publisher publish server.json
```

Verify latest:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.FunplayAI/funplay-cocos-mcp&version=latest"
```

Check a specific version:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.FunplayAI%2Ffunplay-cocos-mcp/versions/<version>"
```

### 10. Post-Release Smoke Test

Test the package from the public GitHub Release:

1. Download `Funplay.CocosMcp.v<version>.zip`.
2. Unzip it.
3. Move `funplay-cocos-mcp` into a Cocos project `extensions/` directory.
4. Restart Cocos Creator or reload extensions.
5. Open `Funplay > MCP Server`.
6. Start the MCP server.
7. Connect an MCP client and call `get_project_info`.
8. Install the npm wrapper with `npm install -g funplay-cocos-mcp`.
9. Connect an MCP client through the `funplay-cocos-mcp` command and call `tools/list`.

## Current Verification Commands

```bash
npm run release:verify
npm run registry:validate
gh release view v<version> -R FunplayAI/funplay-cocos-mcp --json url,assets
npm view funplay-cocos-mcp@<version> version bin mcpName
```

## Common Failure Cases

### Release validation says the changelog section is missing

Cause:

- `CHANGELOG.md` does not contain `## [<version>] - YYYY-MM-DD`.

Fix:

- Add a dated release section before packaging.

### `zip` command is missing

Cause:

- The local environment does not have the `zip` CLI installed.

Fix:

- Install `zip`, then rerun `npm run release:package`.

### GitHub Release upload replaces the wrong assets

Cause:

- The version directory or release tag does not match `package.json` version.

Fix:

- Rerun `npm run release:check`.
- Confirm the command uses `releases/<version>/` and `v<version>`.

### npm `ENEEDAUTH`

Cause:

- The local machine is not logged in to npm.

Fix:

```bash
npm adduser
npm publish
```

### MCP Registry `Package validation failed`

Cause:

- npm package has not been published yet.
- `package.json` `mcpName` does not match `server.json` `name`.
- `server.json` package version does not match the npm package version.

Fix:

- Publish the npm package first.
- Rerun `npm run release:check`.
- Rerun `npm run registry:validate`.
