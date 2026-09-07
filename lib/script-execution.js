'use strict';

const { formatWithOptions, types } = require('util');
const { createActivityPreview, sanitizeActivityText } = require('./activity-preview');

const SCRIPT_EXECUTION_PACKET = 'funplay.script-execution.v1';
const LOG_LIMITS = { entries: 50, message: 1000, characters: 20000 };

// Inject a console into this invocation only. Never patch the process console:
// concurrent/nested scripts and ordinary project logging must stay independent.
async function captureScriptExecution(run, { context, targetConsole = console }) {
  const logs = [];
  let logsOmitted = 0;
  let characters = 0;
  let active = true;
  const started = Date.now();
  const methods = Object.create(null);
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    methods[method] = (...values) => {
      if (active) {
        if (logs.length >= LOG_LIMITS.entries || characters >= LOG_LIMITS.characters) {
          logsOmitted++;
        } else {
          // No custom inspection or getter evaluation while retaining a log.
          let message;
          try {
            const safe = values.slice(0, 20).map((value) => types.isNativeError(value)
              ? sanitizeActivityText(Object.getOwnPropertyDescriptor(value, 'message')?.value || 'Error')
              : createActivityPreview(value));
            message = sanitizeActivityText(formatWithOptions({
              depth: 6, getters: false, customInspect: false, maxArrayLength: 12,
            }, ...safe), Math.min(LOG_LIMITS.message, LOG_LIMITS.characters - characters));
          } catch (error) { message = '[unavailable]'; }
          logs.push({ level: method === 'log' ? 'info' : method, message });
          characters += message.length;
        }
      }
      // The MCP print preference only controls MCP's own logger, not user scripts.
      if (typeof targetConsole[method] === 'function') targetConsole[method](...values);
    };
  }
  const scriptConsole = new Proxy(methods, {
    get(target, key) {
      if (Object.prototype.hasOwnProperty.call(target, key)) return target[key];
      const value = targetConsole[key];
      return typeof value === 'function' ? value.bind(targetConsole) : value;
    },
  });
  const packet = { kind: SCRIPT_EXECUTION_PACKET };
  try {
    packet.value = await run(scriptConsole);
  } catch (error) {
    let message = 'Script execution failed.';
    try { message = String(error && error.message || error); } catch (_) { /* Keep the fallback. */ }
    packet.error = { message };
  } finally {
    active = false;
    packet.execution = { context, durationMs: Math.max(0, Date.now() - started), logs, logsOmitted };
  }
  return packet;
}

module.exports = { captureScriptExecution, SCRIPT_EXECUTION_PACKET, LOG_LIMITS };
