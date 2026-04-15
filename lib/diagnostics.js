'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function findTypescriptBinary(projectPath) {
  const tscName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
  const possibleRoots = [
    global.Editor && Editor.App && Editor.App.path,
    process.resourcesPath,
    global.Editor && Editor.App && Editor.App.path ? path.dirname(Editor.App.path) : '',
    global.Editor && Editor.App && Editor.App.path ? path.resolve(Editor.App.path, '..') : '',
  ].filter(Boolean);

  const editorBundledCandidates = [];
  for (const root of possibleRoots) {
    editorBundledCandidates.push(
      path.join(root, 'resources', '3d', 'engine', 'node_modules', '.bin', tscName),
      path.join(root, 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(root, 'resources', '3d', 'engine', 'node_modules', '@cocos', 'typescript', 'bin', 'tsc'),
      path.join(root, 'app.asar.unpacked', 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', '.bin', tscName),
      path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(root, 'Contents', 'Resources', 'resources', '3d', 'engine', 'node_modules', '@cocos', 'typescript', 'bin', 'tsc')
    );
  }

  const candidates = [
    path.join(projectPath, 'node_modules', '.bin', tscName),
    path.join(projectPath, 'node_modules', 'typescript', 'bin', 'tsc'),
    ...editorBundledCandidates,
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ];

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && exists(candidate)) {
      return candidate;
    }
    if (!candidate.includes(path.sep)) {
      return candidate;
    }
  }

  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function findTsConfig(projectPath, explicitPath) {
  if (explicitPath) {
    return path.isAbsolute(explicitPath) ? explicitPath : path.join(projectPath, explicitPath);
  }

  const candidates = [
    path.join(projectPath, 'tsconfig.json'),
    path.join(projectPath, 'temp', 'tsconfig.cocos.json'),
  ];

  return candidates.find((candidate) => exists(candidate)) || '';
}

function runExec(file, args, cwd) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : '',
      });
    });
  });
}

function parseTscOutput(output) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const diagnostics = [];
  const regex = /^(.*)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/i;
  for (const line of lines) {
    const match = regex.exec(line);
    if (!match) {
      continue;
    }

    diagnostics.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5],
    });
  }

  return diagnostics;
}

async function runScriptDiagnostics(projectPath, options = {}) {
  const tsconfigPath = findTsConfig(projectPath, options.tsconfigPath);
  if (!tsconfigPath || !exists(tsconfigPath)) {
    return {
      ok: false,
      tool: 'typescript',
      summary: 'No tsconfig.json was found in the Cocos project.',
      diagnostics: [],
      stdout: '',
      stderr: '',
    };
  }

  const binary = findTypescriptBinary(projectPath);
  const args = binary.endsWith('npx') || binary.endsWith('npx.cmd')
    ? ['tsc', '--noEmit', '-p', tsconfigPath, '--pretty', 'false']
    : ['--noEmit', '-p', tsconfigPath, '--pretty', 'false'];

  const result = await runExec(binary, args, projectPath);
  const mergedOutput = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
  const diagnostics = parseTscOutput(mergedOutput);
  const ok = result.code === 0 && diagnostics.length === 0;

  return {
    ok,
    tool: 'typescript',
    binary,
    tsconfigPath,
    exitCode: result.code,
    summary: ok
      ? 'TypeScript diagnostics completed successfully with no errors.'
      : diagnostics.length
        ? `Found ${diagnostics.length} TypeScript error(s).`
        : mergedOutput || 'TypeScript diagnostics reported a non-zero exit code.',
    diagnostics,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

module.exports = {
  runScriptDiagnostics,
};
