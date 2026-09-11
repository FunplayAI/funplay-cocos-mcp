'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseJsonc, updateJsonc } = require('../lib/jsonc');

test('JSONC parses comments and trailing commas without touching strings', () => {
  const expected = {
    url: 'https://example.test/a//b/*c*/',
    text: 'quote: " backslash: \\ tab: \t 中文 🎮',
    nested: { list: [true, false, null, -0.25e3] },
  };
  const source = '\uFEFF/* header */' + JSON.stringify(expected, null, 2).replace(/\n/g, ' // note\n').replace(/\n}/, ',\n}') + '\n// footer';
  assert.deepEqual(parseJsonc(source), expected);
  assert.deepEqual(parseJsonc('{"items":[1, /* after comma */], "object":{"key":true,},}'), { items: [1], object: { key: true } });
  assert.deepEqual(parseJsonc('// comment only'), {});
  assert.equal(updateJsonc(source, expected), source);
});

test('JSONC rejects malformed syntax, duplicate keys and excessive nesting', () => {
  for (const source of [
    '{', '[', '{,}', '[,]', '[1,,]', '{"x":1,,}', '{"x" 1}', '{"x":}',
    '{"x":1 "y":2}', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}',
    '/* open', '{} /* open', '"unterminated', '"bad\\x"', '"raw\nnewline"',
    '01', '+1', '.1', '1.', '1e', 'NaN', 'undefined', 'true false', '[]{}', '/*a/*b*/c*/{}',
    '{"x":1 / 2}', '{"x":\'single\'}', '[1 2]', '[1}', '{"x":1]',
    '['.repeat(130) + '0' + ']'.repeat(130),
  ]) {
    assert.throws(() => parseJsonc(source), /Invalid JSONC/, source);
    assert.throws(() => updateJsonc(source, {}), /Invalid JSONC/, source);
  }
});

test('JSONC edits only the changed value and preserves escaped keys and all other bytes', () => {
  const source = '\uFEFF{\r\n\t"mc\\u0070": {\r\n\t\t"server": {"type": "remote", "url": "old", /* keep */ "timeout": 15000,},\r\n\t},\r\n}\r\n';
  const next = parseJsonc(source);
  next.mcp.server.url = 'https://example.test/new//path';
  assert.equal(updateJsonc(source, next), source.replace('"old"', JSON.stringify(next.mcp.server.url)));
});

test('JSONC adds and removes properties in compact, multiline and commented objects', () => {
  const sources = [
    '{}', '{ /* empty */ }', '{\n  // empty\n}',
    '{"a":1}', '{"a":1,}', '{"a":1,"b":2}', '{"a":1,"b":2,"c":3,}',
    '{\n  "a":1, // a\n  "b":2 /* b */\n}',
    '{"a":1 /* before comma */, // between\n"b":2, /* trailing */}',
    '{\r\n\t"a":1,\r\n\t"b":2,\r\n}\r\n',
  ];
  for (const source of sources) {
    for (const removed of [[], ['a'], ['b'], ['c'], ['a', 'b'], ['b', 'c'], ['a', 'b', 'c']]) {
      for (const add of [false, true]) {
        const desired = parseJsonc(source);
        for (const key of removed) delete desired[key];
        if (add) { desired.new = { url: 'http://localhost/', enabled: true }; desired.extra = [1, 2]; }
        const written = updateJsonc(source, desired);
        assert.deepEqual(parseJsonc(written), desired, `${source}; removed=${removed}; add=${add}`);
        assert.equal(updateJsonc(written, desired), written);
        for (const comment of source.match(/\/\*.*?\*\/|\/\/[^\r\n]*/g) || []) assert.ok(written.includes(comment), comment);
        if (source.includes('\r\n')) assert.equal(written.replace(/\r\n/g, '').includes('\n'), false);
      }
    }
  }
});

test('JSONC handles nested changes and prototype-like JSON keys without pollution', () => {
  const source = '{"__proto__":{"safe":true}, "constructor":{"a":1}, "mcp":{"old":{"url":"x"}, "keep":{"url":"y"}}}';
  const desired = parseJsonc(source);
  assert.equal(Object.getPrototypeOf(desired), Object.prototype);
  assert.equal(Object.hasOwn(desired, '__proto__'), true);
  desired.__proto__.safe = false;
  desired.constructor.a = 2;
  delete desired.mcp.old;
  desired.mcp.new = { url: 'z' };
  const written = updateJsonc(source, desired);
  assert.deepEqual(parseJsonc(written), desired);
  assert.equal({}.safe, undefined);
  assert.ok(written.includes('"keep":{"url":"y"}'));
});
