'use strict';

const { createActivityPreview, sanitizeActivityText } = require('./activity-preview');

class InteractionLog {
  constructor(limit = 200) {
    this.limit = limit;
    this.entries = [];
  }

  add(toolName, status, summary, result, execution) {
    const preview = createActivityPreview(result);
    // Execution logs have their own bounded capture budget; do not run them
    // through the result array preview limit or silently turn them into a count.
    const script = execution && {
      context: execution.context,
      durationMs: execution.durationMs,
      logs: execution.logs.map((entry) => ({ level: entry.level, message: entry.message })),
      logsOmitted: execution.logsOmitted,
    };
    this.entries.unshift({
      toolName,
      status,
      summary: sanitizeActivityText(summary || '', 500),
      timestamp: new Date().toISOString(),
      ...(preview === undefined ? {} : { preview }),
      ...(script ? { execution: script } : {}),
    });

    if (this.entries.length > this.limit) {
      this.entries.length = this.limit;
    }
  }

  list(limit = 20) {
    return this.entries.slice(0, Math.max(1, limit));
  }

  clear() {
    const count = this.entries.length;
    this.entries.length = 0;
    return count;
  }

  summary(limit = 20) {
    const items = this.list(limit);
    if (!items.length) {
      return 'No MCP interactions recorded yet.';
    }

    return items
      .map((entry) => `[${entry.timestamp}] ${entry.status.toUpperCase()} ${entry.toolName}: ${entry.summary}`)
      .join('\n');
  }
}

module.exports = {
  InteractionLog,
};
