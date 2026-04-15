'use strict';

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, current) => {
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) {
          return '[Circular]';
        }
        seen.add(current);
      }
      return current;
    },
    2
  );
}

module.exports = {
  safeJsonParse,
  safeStringify,
};
