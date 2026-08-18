'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createCocosMcpProjectSkill,
  createCocosUiProjectSkill,
  createProjectSkill,
  listProjectInstructions,
  parseSkillMetadata,
  readProjectInstruction,
  writeProjectInstruction,
} = require('../lib/project-instructions');

test('skill metadata validation follows Codex name and description constraints', () => {
  assert.equal(parseSkillMetadata('---\nname: scene-qa\ndescription: "Validate scenes."\n---\n').valid, true);
  assert.equal(parseSkillMetadata('---\nname: scene_qa\ndescription: "Validate scenes."\n---\n').valid, false);
  assert.equal(parseSkillMetadata('---\nname: scene-qa\ndescription: "Use <unsafe>."\n---\n').valid, false);
  assert.equal(parseSkillMetadata(`---\nname: ${'a'.repeat(64)}\ndescription: "Validate scenes."\n---\n`).valid, false);
});

test('project instruction helpers list, read, and write safe project files', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-instructions-'));
  const write = writeProjectInstruction(projectPath, {
    target: 'AGENTS.md',
    content: '# Agent Notes\n',
  });

  assert.equal(write.written, true);
  assert.equal(readProjectInstruction(projectPath, 'AGENTS.md').content, '# Agent Notes\n');

  const listed = listProjectInstructions(projectPath);
  assert.equal(listed.files.some((file) => file.path === 'AGENTS.md'), true);
});

test('createProjectSkill writes a Codex project skill', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-skill-'));
  const result = createProjectSkill(projectPath, {
    skillName: 'scene_qa',
    title: 'Scene QA',
    description: 'Validate Cocos scenes.',
  });

  assert.equal(result.path, '.codex/skills/scene-qa/SKILL.md');
  const content = readProjectInstruction(projectPath, result.path).content;
  assert.match(content, /^---\nname: scene-qa\ndescription: "Validate Cocos scenes\."\n---/);
  const listed = listProjectInstructions(projectPath);
  const listedSkill = listed.skills.find((skill) => skill.path === result.path);
  assert.equal(Boolean(listedSkill), true);
  assert.equal(listedSkill.valid, true);
  assert.equal(listedSkill.name, 'scene-qa');
});

test('createCocosMcpProjectSkill writes the recommended MCP workflow skill', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-default-skill-'));
  const result = createCocosMcpProjectSkill(projectPath);

  assert.equal(result.path, '.codex/skills/funplay-cocos-mcp-workflow/SKILL.md');
  const content = readProjectInstruction(projectPath, result.path).content;
  assert.match(content, /Funplay Cocos MCP Workflow/);
  assert.match(content, /inspect_asset_dependencies/);
  assert.match(content, /do not rebuild the entire prefab unless explicitly requested/);
  assert.match(content, /^---\nname: funplay-cocos-mcp-workflow\n/);
});

test('createCocosUiProjectSkill writes the responsive Cocos UI composition skill', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-ui-skill-'));
  const result = createCocosUiProjectSkill(projectPath);

  assert.equal(result.path, '.codex/skills/funplay-cocos-ui-composition/SKILL.md');
  const content = readProjectInstruction(projectPath, result.path).content;
  assert.match(content, /^---\nname: funplay-cocos-ui-composition\n/);
  assert.match(content, /`UITransform`/);
  assert.match(content, /`Widget`/);
  assert.match(content, /`SafeArea`/);
  assert.match(content, /do not rebuild the entire prefab unless explicitly requested/);
  assert.match(content, /Putting Layout and Widget on the same node/);
});

test('project instruction helpers reject traversal outside the project', () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'funplay-cocos-instructions-safe-'));
  assert.throws(
    () => writeProjectInstruction(projectPath, { target: '../AGENTS.md', content: 'x' }),
    /outside the Cocos project/
  );
});
