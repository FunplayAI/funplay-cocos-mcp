'use strict';

const PRIVATE_FIELD = /password|passwd|secret|token|authorization|credential|cookie|apikey/i;
const BODY_FIELDS = new Set(['content', 'contents', 'text', 'code', 'script', 'source', 'stdout', 'stderr', 'html', 'raw', 'diff', 'datauri', 'imagedata', 'base64', 'buffer']);
const PREVIEW_LIMITS = { nodes: 200, depth: 6, keys: 24, items: 12, string: 800, characters: 16000 };

function sanitizeActivityText(value, limit = PREVIEW_LIMITS.string) {
  const text = String(value)
    .replace(/data:[^\s"']+/gi, '[omitted]')
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/(["']?(?:password|passwd|secret|access[_-]?token|api[_-]?key|token|credential|cookie|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,\s;}]+)/gi, '$1[redacted]');
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

// Snapshot the actual result in its original order and shape. Bound retained data,
// not a hand-picked set of fields, and never execute getters for the dashboard.
function createActivityPreview(value) {
  const seen = new WeakSet();
  let remaining = PREVIEW_LIMITS.nodes;
  let characters = PREVIEW_LIMITS.characters;
  function visit(input, depth) {
    if (remaining-- <= 0 || characters <= 0) return '[truncated]';
    if (typeof input === 'string') {
      const text = sanitizeActivityText(input, Math.min(PREVIEW_LIMITS.string, characters));
      characters -= text.length;
      return text;
    }
    if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
    if (typeof input === 'bigint') return String(input);
    if (!input || typeof input !== 'object') return undefined;
    if (seen.has(input)) return '[circular]';
    if (depth > PREVIEW_LIMITS.depth) return '[truncated]';
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        const preview = [];
        let i = 0;
        for (; i < Math.min(PREVIEW_LIMITS.items, input.length) && remaining > 0 && characters > 0; i++) {
          const property = Object.getOwnPropertyDescriptor(input, String(i));
          preview.push(property && 'value' in property ? visit(property.value, depth + 1) ?? null : null);
        }
        if (i < input.length) preview.push({ $remaining: input.length - i });
        return preview;
      }
      const preview = Object.create(null);
      const keys = Object.keys(input);
      let i = 0;
      for (; i < Math.min(PREVIEW_LIMITS.keys, keys.length) && remaining > 0 && characters > 0; i++) {
        const key = keys[i];
        const label = sanitizeActivityText(key, 160);
        characters -= label.length;
        const normalized = key.replace(/[^a-z0-9]/gi, '');
        if (PRIVATE_FIELD.test(normalized)) { preview[label] = '[redacted]'; remaining--; continue; }
        if (BODY_FIELDS.has(normalized.toLowerCase())) { preview[label] = '[omitted]'; remaining--; continue; }
        const property = Object.getOwnPropertyDescriptor(input, key);
        if (!property || !('value' in property)) continue;
        const result = visit(property.value, depth + 1);
        if (result !== undefined) preview[label] = result;
      }
      if (i < keys.length) preview.$remaining = keys.length - i;
      return preview;
    } finally { seen.delete(input); }
  }
  try { return visit(value, 0); } catch (error) { return undefined; }
}

module.exports = { createActivityPreview, sanitizeActivityText, PREVIEW_LIMITS };
