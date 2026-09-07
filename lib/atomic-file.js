'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readOptionalText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function writeTextIfUnchanged(filePath, content, original) {
  // Preserve symlinked config locations while replacing the real file atomically.
  const destination = fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.funplay-${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    const mode = fs.existsSync(destination) ? fs.statSync(destination).mode & 0o777 : 0o600;
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode });
    if (readOptionalText(filePath) !== original) throw new Error(`Configuration changed while editing: ${filePath}. Retry after reviewing it.`);
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = { readOptionalText, writeTextIfUnchanged };
