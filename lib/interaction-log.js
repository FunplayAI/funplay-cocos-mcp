'use strict';

class InteractionLog {
  constructor(limit = 200) {
    this.limit = limit;
    this.entries = [];
  }

  add(toolName, status, summary) {
    this.entries.unshift({
      toolName,
      status,
      summary,
      timestamp: new Date().toISOString(),
    });

    if (this.entries.length > this.limit) {
      this.entries.length = this.limit;
    }
  }

  list(limit = 20) {
    return this.entries.slice(0, Math.max(1, limit));
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
