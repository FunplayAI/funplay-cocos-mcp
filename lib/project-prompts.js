'use strict';

const fs = require('fs');
const { resolveProjectFilePath: resolveProjectPath } = require('./path-safety');

const PROMPT_DIRECTORY = 'mcp-prompts';
const MAX_PROMPT_FILES = 100;
const MAX_PROMPT_BYTES = 256 * 1024;
const IDENTIFIER = /^[a-z][a-z0-9_-]{0,63}$/;

function parseProjectPrompt(content) {
  const match = String(content).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n([\s\S]*)$/);
  if (!match) throw new Error('Expected a --- frontmatter block followed by a prompt body.');
  const fields = Object.create(null);
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const field = line.match(/^([a-z]+):[ \t]*(.*)$/);
    if (!field || !['name', 'description', 'arguments'].includes(field[1])) throw new Error(`Unsupported frontmatter line: ${line}`);
    if (Object.hasOwn(fields, field[1])) throw new Error(`Duplicate field: ${field[1]}`);
    fields[field[1]] = field[2].trim();
  }
  if (!IDENTIFIER.test(fields.name || '')) throw new Error('Invalid prompt name. Use lowercase letters, digits, hyphens or underscores (1–64 characters).');
  if ((fields.description || '').length > 512) throw new Error('Description exceeds 512 characters.');
  const body = match[2].trim();
  if (!body) throw new Error('Prompt body is empty.');
  const names = new Set();
  const args = fields.arguments ? fields.arguments.split(',').map((value) => {
    const arg = value.trim().match(/^([a-z][a-z0-9_-]{0,63})(\(required\))?$/);
    if (!arg) throw new Error(`Invalid argument declaration: ${value}`);
    if (names.has(arg[1])) throw new Error(`Duplicate argument: ${arg[1]}`);
    names.add(arg[1]);
    return { name: arg[1], description: arg[1], required: Boolean(arg[2]) };
  }) : [];
  return { name: fields.name, description: fields.description || fields.name, arguments: args, body };
}

function loadProjectPrompts(projectPath, reservedNames = []) {
  const prompts = [];
  const warnings = [];
  if (!projectPath) return { prompts, warnings };
  try {
    const directory = resolveProjectPath(projectPath, PROMPT_DIRECTORY);
    if (!fs.existsSync(directory)) return { prompts, warnings };
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('The mcp-prompts directory must not be a symbolic link.');
    const files = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name));
    if (files.length > MAX_PROMPT_FILES) warnings.push(`Only the first ${MAX_PROMPT_FILES} Markdown files are loaded.`);
    const seen = new Set(reservedNames.map((name) => name.toLowerCase()));
    for (const entry of files.slice(0, MAX_PROMPT_FILES)) {
      try {
        if (!entry.isFile()) throw new Error('Only regular files are supported; symbolic links are skipped.');
        const filePath = resolveProjectPath(projectPath, `${PROMPT_DIRECTORY}/${entry.name}`);
        if (fs.statSync(filePath).size > MAX_PROMPT_BYTES) throw new Error(`File exceeds ${MAX_PROMPT_BYTES} bytes.`);
        const prompt = parseProjectPrompt(fs.readFileSync(filePath, 'utf8'));
        if (seen.has(prompt.name.toLowerCase())) throw new Error(`Duplicate or reserved prompt name: ${prompt.name}`);
        seen.add(prompt.name.toLowerCase());
        prompts.push(prompt);
      } catch (error) {
        warnings.push(`${entry.name}: ${error.message}`);
      }
    }
  } catch (error) {
    warnings.push(error.message);
  }
  return { prompts, warnings };
}

function interpolatePrompt(body, args, declarations) {
  const allowed = new Set(declarations.map((arg) => arg.name));
  // One pass: placeholders inside argument values are data, not more template syntax.
  return body.replace(/\{([a-z][a-z0-9_-]{0,63})\}/g, (original, name) => (
    allowed.has(name) ? (Object.hasOwn(args, name) ? args[name] : '') : original
  ));
}

module.exports = { PROMPT_DIRECTORY, MAX_PROMPT_FILES, MAX_PROMPT_BYTES, parseProjectPrompt, loadProjectPrompts, interpolatePrompt };
