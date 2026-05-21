# Release Checklist

Use this checklist before publishing a new release of Funplay MCP for Cocos.

## 1. Repository Hygiene

- [ ] `git status` contains only intended release changes
- [ ] No tracked local junk is present (`.DS_Store`, `.idea/`, `node_modules/`, `Library/`, `Temp/`, `dist/`, `build/`)
- [ ] `package.json` version matches the intended release
- [ ] `CHANGELOG.md` includes the release notes for the target version
- [ ] `README.md` and `README_CN.md` match the current product behavior

## 2. Automated Verification

- [ ] `npm run check` passes
- [ ] `npm test` passes
- [ ] `npm run release:check` passes
- [ ] `npm run pack:dry-run` passes
- [ ] `npm run registry:validate` passes when `mcp-publisher` is available
- [ ] `npm run release:package` creates `releases/<version>/`
- [ ] `shasum -a 256 -c releases/<version>/SHA256SUMS.txt` passes

## 3. Package Contents

- [ ] The zip is named `Funplay.CocosMcp.v<version>.zip`
- [ ] The zip contains a single top-level `funplay-cocos-mcp/` folder
- [ ] The zip contains runtime files: `package.json`, `browser.js`, `scene.js`, `panel/`, and `lib/`
- [ ] The zip contains stdio wrapper metadata: `bin/funplay-cocos-mcp.js` and `server.json`
- [ ] The zip includes docs: `README.md`, `README_CN.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, and `LICENSE`
- [ ] The zip does not contain `.git/`, `.github/`, `.DS_Store`, `node_modules/`, `Library/`, `Temp/`, `dist/`, `build/`, `test/`, or `scripts/`
- [ ] `release-manifest.json` references the correct GitHub download URL
- [ ] `SHA256SUMS.txt` includes the zip, manifest, and release README

## 4. Cocos Smoke Test

- [ ] Test in a clean Cocos Creator `3.8+` project
- [ ] Install from the generated zip into `<project>/extensions/funplay-cocos-mcp`
- [ ] Restart Cocos Creator or reload extensions
- [ ] Open `Funplay > MCP Server`
- [ ] Start the MCP server successfully
- [ ] If the configured port is already in use, verify automatic fallback is reported clearly
- [ ] Run a read-only tool such as `get_project_info`
- [ ] Run a scene inspection tool such as `get_scene_info`
- [ ] Run a screenshot tool when the editor has a visible scene or preview
- [ ] Verify interaction logs appear in the MCP Server panel

## 5. MCP Client Verification

- [ ] Verify at least one primary client can connect (`Claude Code`, `Cursor`, `Codex`, etc.)
- [ ] Confirm `tools/list` returns the expected `core` profile tools
- [ ] Confirm a tool call succeeds end-to-end from the external client
- [ ] Verify one-click config output still matches the documented config snippets
- [ ] Verify the stdio wrapper can connect with `funplay-cocos-mcp --url http://127.0.0.1:8765/`

## 6. npm And MCP Registry Readiness

- [ ] `package.json` `name` is `funplay-cocos-mcp`
- [ ] `package.json` `version` matches `server.json` version
- [ ] `package.json` `mcpName` matches `server.json` name
- [ ] `package.json` `bin.funplay-cocos-mcp` points to `bin/funplay-cocos-mcp.js`
- [ ] `server.json` npm package identifier and version match `package.json`
- [ ] `server.json` npm transport type is `stdio`
- [ ] npm package dry-run includes `bin/`, `lib/`, `panel/`, `browser.js`, `scene.js`, and `server.json`
- [ ] npm credentials are available for `npm publish`
- [ ] MCP Registry credentials are available for `mcp-publisher publish`

## 7. GitHub Release Readiness

- [ ] CI passes on `main`
- [ ] Release commit message is `Release v<version>`
- [ ] Tag is `v<version>`
- [ ] GitHub Release title is `v<version>`
- [ ] GitHub Release includes the zip, manifest, checksum file, and release README
- [ ] Public GitHub Release page renders the release notes and assets correctly

## 8. Publish

- [ ] Commit the release changes
- [ ] Create and push the release tag
- [ ] Create or update the GitHub Release
- [ ] Upload generated release assets
- [ ] Verify the GitHub Release asset list
- [ ] Publish npm package with `npm publish`
- [ ] Verify npm package with `npm view funplay-cocos-mcp@<version>`
- [ ] Publish MCP Registry metadata with `mcp-publisher publish server.json`
- [ ] Verify MCP Registry latest and specific-version endpoints

## 9. Post-Release

- [ ] Re-test installation from the public GitHub Release zip
- [ ] Re-test stdio wrapper installation from npm
- [ ] Check the update checker reports the new latest version
- [ ] Check README install instructions and download links
- [ ] Announce the release where appropriate
