'use strict';

const { isDeepStrictEqual } = require('util');

// Keep source ranges so config edits do not discard comments or reformat
// unrelated settings. No runtime dependency is needed in the Cocos ZIP.
function parseDocument(source) {
  let offset = source.charCodeAt(0) === 0xFEFF ? 1 : 0;
  const fail = (message) => { throw new SyntaxError(`Invalid JSONC at offset ${offset}: ${message}. File was left unchanged.`); };
  function trivia() {
    while (offset < source.length) {
      if (/[ \t\r\n]/.test(source[offset])) { offset += 1; continue; }
      if (source.startsWith('//', offset)) {
        offset += 2;
        while (offset < source.length && !/[\r\n]/.test(source[offset])) offset += 1;
      } else if (source.startsWith('/*', offset)) {
        const end = source.indexOf('*/', offset + 2);
        if (end < 0) fail('unterminated comment');
        offset = end + 2;
      } else break;
    }
  }
  function string() {
    const start = offset++;
    while (offset < source.length) {
      const character = source[offset++];
      if (character === '"') {
        try { return { start, end: offset, value: JSON.parse(source.slice(start, offset)) }; }
        catch (error) { fail('invalid string'); }
      }
      if (character === '\\') offset += 1;
    }
    fail('unterminated string');
  }
  function value(depth = 0) {
    if (depth > 128) fail('configuration nesting is too deep');
    trivia();
    const start = offset;
    const character = source[offset];
    if (character === '"') return string();
    if (character !== '{' && character !== '[') {
      const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(offset));
      if (!literal) fail('expected a JSON value');
      offset += literal[0].length;
      return { start, end: offset, value: JSON.parse(literal[0]) };
    }
    const object = character === '{';
    const closing = object ? '}' : ']';
    const result = object ? {} : [];
    const properties = [];
    offset += 1;
    trivia();
    while (source[offset] !== closing) {
      let key;
      if (object) {
        if (source[offset] !== '"') fail('expected an object key');
        key = string();
        if (Object.hasOwn(result, key.value)) fail('duplicate object key');
        trivia();
        if (source[offset++] !== ':') fail('expected a colon');
      }
      const child = value(depth + 1);
      const property = object ? { key: key.value, start: key.start, node: child, comma: null } : null;
      if (object) {
        // Treat __proto__ like a normal JSON key, never as a prototype setter.
        Object.defineProperty(result, key.value, { value: child.value, enumerable: true, writable: true, configurable: true });
        properties.push(property);
      } else result.push(child.value);
      trivia();
      if (source[offset] === closing) break;
      if (source[offset] !== ',') fail('expected a comma or closing delimiter');
      if (property) property.comma = offset;
      offset += 1;
      trivia(); // A single trailing comma is allowed, but not holes or doubled commas.
    }
    offset += 1;
    return { start, end: offset, value: result, properties: object ? properties : undefined };
  }
  trivia();
  if (offset === source.length) return null;
  const root = value();
  trivia();
  if (offset !== source.length) fail('unexpected content after the root value');
  return root;
}

function parseJsonc(source) {
  const document = parseDocument(source);
  return document ? document.value : {};
}

function updateJsonc(source, desired) {
  const root = parseDocument(source);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const indent = (/\r?\n([ \t]+)"/.exec(source) || [null, '  '])[1];
  const lineIndent = (position) => /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', position - 1) + 1))[0];
  const serialize = (value, prefix) => JSON.stringify(value, null, indent).replace(/\n/g, newline + prefix);
  if (!root) {
    const separator = source && !/[\r\n]$/.test(source) ? newline : '';
    return source + separator + serialize(desired, '') + newline;
  }
  const edits = [];
  const edit = (start, end, text) => edits.push({ start, end, text, order: edits.length });
  function visit(node, next) {
    if (isDeepStrictEqual(node.value, next)) return;
    if (!node.properties || !next || typeof next !== 'object' || Array.isArray(next)) {
      edit(node.start, node.end, serialize(next, lineIndent(node.start)));
      return;
    }
    const retained = [];
    const existing = new Set();
    for (const property of node.properties) {
      existing.add(property.key);
      if (Object.hasOwn(next, property.key)) {
        retained.push(property);
        visit(property.node, next[property.key]);
      } else {
        edit(property.start, property.node.end, '');
        // Leave surrounding comments intact. A previous separator may become
        // a valid trailing comma when removing the final property.
        if (property.comma !== null) edit(property.comma, property.comma + 1, '');
      }
    }
    const added = Object.keys(next).filter((key) => !existing.has(key));
    if (!added.length) return;
    const last = retained[retained.length - 1];
    if (last && last.comma === null) edit(last.node.end, last.node.end, ',');
    const base = lineIndent(node.start);
    const prefix = base + indent;
    const closing = node.end - 1;
    const closingLine = source.lastIndexOf('\n', closing - 1) + 1;
    const onOwnLine = /^[ \t]*$/.test(source.slice(closingLine, closing));
    const trailingComma = node.properties.length && node.properties[node.properties.length - 1].comma !== null;
    const fields = added.map((key) => `${prefix}${JSON.stringify(key)}: ${serialize(next[key], prefix)}`).join(',' + newline);
    const text = (onOwnLine ? '' : newline) + fields + (trailingComma ? ',' : '') + newline + (onOwnLine ? '' : base);
    edit(onOwnLine ? closingLine : closing, onOwnLine ? closingLine : closing, text);
  }
  visit(root, desired);
  let result = source;
  for (const change of edits.sort((a, b) => b.start - a.start || b.end - a.end || b.order - a.order)) {
    result = result.slice(0, change.start) + change.text + result.slice(change.end);
  }
  // Fail closed before the caller performs its atomic write.
  if (!isDeepStrictEqual(parseJsonc(result), desired)) throw new Error('JSONC edit could not be verified; the file was left unchanged.');
  return result;
}

module.exports = { parseJsonc, updateJsonc };
