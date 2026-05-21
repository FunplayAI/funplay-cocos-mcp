'use strict';

const PKG = 'funplay-cocos-mcp';

function request(message, ...args) {
  return Editor.Message.request(PKG, message, ...args);
}

function stringify(value) {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

module.exports = Editor.Panel.define({
  template: `
    <div class="mcp-root">
      <header class="hero">
        <div>
          <h1>Funplay Cocos MCP</h1>
          <p id="versionText">Version</p>
        </div>
        <div class="status-pill" id="statusPill">Unknown</div>
      </header>

      <section class="card">
        <h2>Service</h2>
        <div id="statusText" class="status-line muted"></div>
        <div class="row top-actions">
          <label class="checkbox-line checkbox-inline">
            <ui-checkbox id="enabledInput"></ui-checkbox>
            Enable MCP Server
          </label>
          <ui-button id="restartBtn">Restart</ui-button>
          <ui-button id="copyUrlBtn">Copy URL</ui-button>
          <ui-button id="copyHealthCurlBtn">Copy Health Curl</ui-button>
          <ui-button id="copyToolsCurlBtn">Copy Tools Curl</ui-button>
          <ui-button id="checkUpdatesBtn">Check Updates</ui-button>
        </div>
        <div class="grid">
          <label>Server Port <ui-num-input id="portInput"></ui-num-input></label>
          <label>Tool Exposure
            <ui-select id="profileSelect">
              <option value="core">core</option>
              <option value="full">full</option>
              <option value="custom">custom</option>
            </ui-select>
          </label>
          <label class="checkbox-line">
            <ui-checkbox id="sessionsInput"></ui-checkbox>
            MCP Sessions
          </label>
        </div>
        <div id="updateStatus" class="client-status muted"></div>
        <p>Changes auto-save. Port/profile changes restart the server when needed.</p>
      </section>

      <section class="card">
        <h2>Tool Manager</h2>
        <div id="toolSummary" class="status-line muted"></div>
        <div class="row tool-presets">
          <ui-button id="useCoreBtn">Core</ui-button>
          <ui-button id="useFullBtn">Full</ui-button>
          <ui-button id="useCustomBtn">Custom</ui-button>
        </div>
        <div class="tool-config-grid">
          <label>Enabled Categories <ui-textarea id="enabledCategoriesInput"></ui-textarea></label>
          <label>Disabled Categories <ui-textarea id="disabledCategoriesInput"></ui-textarea></label>
          <label>Enabled Tools <ui-textarea id="enabledToolsInput"></ui-textarea></label>
          <label>Disabled Tools <ui-textarea id="disabledToolsInput"></ui-textarea></label>
        </div>
      </section>

      <section class="card">
        <h2>Activity</h2>
        <div class="activity-grid">
          <div class="activity-column">
            <h3>Recent Calls</h3>
            <div id="recentCalls" class="mini-list muted"></div>
          </div>
          <div class="activity-column">
            <h3>Log Preview</h3>
            <div id="recentLogs" class="mini-list muted"></div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>MCP Client Config</h2>
        <div class="row">
          <ui-select id="clientTargetSelect"></ui-select>
          <ui-button id="configureClientBtn" class="primary">One-Click Configure</ui-button>
        </div>
        <div id="clientTargetStatus" class="client-status muted"></div>
        <ui-textarea id="clientConfigText"></ui-textarea>
      </section>

      <section class="card">
        <details>
          <summary>Debug Output</summary>
          <pre id="output"></pre>
        </details>
      </section>
    </div>
  `,
  style: `
    :host {
      color: var(--color-normal-contrast);
      background: var(--color-normal-fill);
      font-size: 13px;
    }
    .mcp-root {
      padding: 14px;
      box-sizing: border-box;
      overflow: auto;
      height: 100%;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
    }
    h2 {
      margin: 0 0 10px 0;
      font-size: 15px;
    }
    h3 {
      margin: 0 0 6px 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-normal-contrast-weak);
    }
    p {
      margin: 4px 0 0 0;
      color: var(--color-normal-contrast-weakest);
    }
    .tip {
      margin: 0 0 10px 0;
    }
    code {
      font-family: Menlo, monospace;
      background: rgba(255,255,255,0.08);
      padding: 1px 4px;
      border-radius: 4px;
      color: var(--color-normal-contrast);
    }
    .card {
      border: 1px solid var(--color-normal-border);
      border-radius: 8px;
      background: var(--color-normal-fill-emphasis);
      padding: 12px;
      margin-bottom: 12px;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .top-actions {
      margin-top: 0;
      margin-bottom: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(140px, 1fr));
      gap: 8px;
      align-items: end;
    }
    .tool-config-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--color-normal-contrast-weak);
    }
    .checkbox-line {
      flex-direction: row;
      align-items: center;
      min-height: 28px;
    }
    .checkbox-inline {
      padding-top: 0;
      color: var(--color-normal-contrast);
      gap: 6px;
    }
    .status-pill {
      border-radius: 999px;
      padding: 6px 10px;
      background: #555;
      color: white;
      font-weight: 600;
    }
    .status-pill.running {
      background: #1f8f4d;
    }
    .status-pill.stopped {
      background: #8f3d3d;
    }
    .muted {
      color: var(--color-normal-contrast-weakest);
    }
    .status-line {
      margin-bottom: 10px;
      line-height: 1.5;
    }
    .client-status {
      margin: 8px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .activity-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, 1fr));
      gap: 10px;
    }
    .mini-list {
      min-height: 74px;
      max-height: 158px;
      overflow: auto;
      box-sizing: border-box;
      border: 1px solid var(--color-normal-border);
      border-radius: 6px;
      padding: 8px;
      background: rgba(0,0,0,0.12);
      line-height: 1.35;
    }
    .mini-item {
      padding: 0 0 8px 0;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .mini-item:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .mini-title {
      color: var(--color-normal-contrast);
      font-weight: 600;
      word-break: break-word;
    }
    .mini-meta {
      margin-top: 2px;
      color: var(--color-normal-contrast-weakest);
      font-size: 11px;
    }
    .mini-body {
      margin-top: 2px;
      word-break: break-word;
    }
    details {
      display: block;
    }
    summary {
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      color: var(--color-normal-contrast);
      outline: none;
      user-select: none;
    }
    ui-textarea {
      width: 100%;
      min-height: 100px;
    }
    .tool-config-grid ui-textarea {
      min-height: 72px;
    }
    pre {
      min-height: 120px;
      max-height: 220px;
      overflow: auto;
      margin: 0;
      background: #111;
      color: #d7ffd7;
      padding: 10px;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .primary {
      border-color: #4aa3ff;
    }
    @media (max-width: 620px) {
      .activity-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  $: {
    root: '.mcp-root',
    statusPill: '#statusPill',
    versionText: '#versionText',
    statusText: '#statusText',
    enabledInput: '#enabledInput',
    portInput: '#portInput',
    profileSelect: '#profileSelect',
    sessionsInput: '#sessionsInput',
    restartBtn: '#restartBtn',
    copyUrlBtn: '#copyUrlBtn',
    copyHealthCurlBtn: '#copyHealthCurlBtn',
    copyToolsCurlBtn: '#copyToolsCurlBtn',
    checkUpdatesBtn: '#checkUpdatesBtn',
    updateStatus: '#updateStatus',
    toolSummary: '#toolSummary',
    useCoreBtn: '#useCoreBtn',
    useFullBtn: '#useFullBtn',
    useCustomBtn: '#useCustomBtn',
    enabledCategoriesInput: '#enabledCategoriesInput',
    disabledCategoriesInput: '#disabledCategoriesInput',
    enabledToolsInput: '#enabledToolsInput',
    disabledToolsInput: '#disabledToolsInput',
    clientTargetSelect: '#clientTargetSelect',
    configureClientBtn: '#configureClientBtn',
    clientTargetStatus: '#clientTargetStatus',
    clientConfigText: '#clientConfigText',
    recentCalls: '#recentCalls',
    recentLogs: '#recentLogs',
    output: '#output',
  },
  methods: {
    async refresh() {
      try {
        this.state = await request('get-panel-state');
        this.renderState();
      } catch (error) {
        this.showOutput(`Refresh failed: ${error.message}`);
      }
    },
    renderState() {
      const state = this.state || {};
      const status = state.status || {};
      const config = state.config || {};
      const isRunning = Boolean(status.running);

      this.$.versionText.textContent = `Version ${status.version || 'unknown'}`;
      this.$.statusPill.textContent = isRunning ? 'Running' : 'Stopped';
      this.$.statusPill.classList.toggle('running', isRunning);
      this.$.statusPill.classList.toggle('stopped', !isRunning);
      const portText = status.portFallbackActive
        ? `  |  Port fallback: ${status.requestedPort} -> ${status.port}`
        : '';
      this.$.statusText.textContent =
        `${status.url || ''}  |  Project: ${status.projectName || ''}  |  Cocos ${status.cocosVersion || ''}${portText}`;

      this.$.enabledInput.value = Boolean(isRunning || config.autostart);
      this.$.portInput.value = Number(config.port || status.port || 8765);
      this.$.profileSelect.value = config.toolProfile || status.toolProfile || 'core';
      this.$.sessionsInput.value = Boolean(config.enableSessions || status.enableSessions);
      this.$.enabledCategoriesInput.value = this.formatList(config.enabledToolCategories);
      this.$.disabledCategoriesInput.value = this.formatList(config.disabledToolCategories);
      this.$.enabledToolsInput.value = this.formatList(config.enabledTools);
      this.$.disabledToolsInput.value = this.formatList(config.disabledTools);
      this.renderUpdateStatus();
      this.renderToolSummary();
      this.renderClientTargets();
      this.renderActivity();
    },
    formatList(value) {
      return Array.isArray(value) ? value.join('\n') : '';
    },
    parseList(value) {
      return String(value || '')
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    },
    renderUpdateStatus() {
      const update = this.state && this.state.updateInfo;
      if (!update) {
        this.$.updateStatus.textContent = '';
        return;
      }
      if (!update.ok) {
        this.$.updateStatus.textContent = `Update check failed: ${update.error}`;
        return;
      }
      this.$.updateStatus.textContent = update.updateAvailable
        ? `Update available: ${update.latestVersion} (${update.releaseUrl})`
        : `Up to date: ${update.currentVersion}`;
    },
    renderToolSummary() {
      const catalog = (this.state && this.state.toolCatalog) || [];
      const enabled = catalog.filter((tool) => tool.enabled);
      const categories = Array.from(new Set(catalog.map((tool) => tool.category))).sort();
      this.$.toolSummary.textContent =
        `Enabled ${enabled.length}/${catalog.length} tools  |  Categories: ${categories.join(', ')}`;
    },
    renderActivity() {
      const state = this.state || {};
      this.renderMiniList(
        this.$.recentCalls,
        state.recentInteractions || [],
        (entry) => ({
          title: `${String(entry.status || '').toUpperCase()} ${entry.toolName || 'tool'}`,
          meta: this.formatTimestamp(entry.timestamp),
          body: entry.summary || '',
        }),
        'No recent MCP calls.'
      );
      this.renderMiniList(
        this.$.recentLogs,
        state.recentRuntimeLogs || [],
        (entry) => ({
          title: `${String(entry.level || 'info').toUpperCase()} ${entry.message || ''}`,
          meta: this.formatTimestamp(entry.timestamp),
          body: entry.details ? stringify(entry.details) : '',
        }),
        'No runtime logs yet.'
      );
    },
    renderMiniList(container, entries, formatEntry, emptyText) {
      container.innerHTML = '';
      if (!entries.length) {
        container.textContent = emptyText;
        return;
      }

      const fragment = document.createDocumentFragment();
      entries.slice(0, 6).forEach((entry) => {
        const formatted = formatEntry(entry);
        const item = document.createElement('div');
        item.className = 'mini-item';

        const title = document.createElement('div');
        title.className = 'mini-title';
        title.textContent = formatted.title;
        item.appendChild(title);

        if (formatted.meta) {
          const meta = document.createElement('div');
          meta.className = 'mini-meta';
          meta.textContent = formatted.meta;
          item.appendChild(meta);
        }

        if (formatted.body) {
          const body = document.createElement('div');
          body.className = 'mini-body';
          body.textContent = formatted.body;
          item.appendChild(body);
        }

        fragment.appendChild(item);
      });
      container.appendChild(fragment);
    },
    formatTimestamp(value) {
      if (!value) {
        return '';
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleTimeString();
    },
    renderClientTargets() {
      const targets = (this.state && this.state.clientTargets) || [];
      const preferred = this.state && this.state.config ? this.state.config.lastClientTargetId : '';
      const selected = this.$.clientTargetSelect.value || preferred || (targets[0] && targets[0].id);
      this.$.clientTargetSelect.innerHTML = targets
        .map((target) => `<option value="${target.id}">${target.name}</option>`)
        .join('');
      if (selected) {
        this.$.clientTargetSelect.value = selected;
      }
      this.renderClientTargetStatus();
    },
    renderClientTargetStatus() {
      const targets = (this.state && this.state.clientTargets) || [];
      const target = targets.find((item) => item.id === this.$.clientTargetSelect.value) || targets[0];
      if (!target) {
        this.$.clientTargetStatus.textContent = 'No client targets available.';
        return;
      }
      this.$.clientTargetStatus.textContent = `${target.configured ? 'Configured' : 'Not configured'}: ${target.configPath}`;
      const previews = this.state && this.state.clientConfig && Array.isArray(this.state.clientConfig.targets)
        ? this.state.clientConfig.targets
        : [];
      const preview = previews.find((item) => item.id === target.id);
      this.$.clientConfigText.value = preview && preview.preview
        ? preview.preview
        : (this.state && this.state.clientConfig ? this.state.clientConfig.codex : '');
    },
    showOutput(value) {
      this.$.output.textContent = stringify(value);
    },
    copyText(text, successMessage) {
      if (!text) {
        this.showOutput('Nothing to copy.');
        return;
      }
      navigator.clipboard.writeText(text)
        .then(() => this.showOutput(successMessage))
        .catch(() => this.showOutput(text));
    },
    getCurlCommand(key) {
      const curl = this.state && this.state.clientConfig && this.state.clientConfig.curl;
      return curl && curl[key] ? curl[key] : '';
    },
    async persistConfig(options = {}) {
      const { showOutput = false } = options;
      try {
        const panelState = await request('save-config', this.collectConfig());
        this.state = panelState;
        this.renderState();
        if (showOutput) {
          this.showOutput('Configuration saved.');
        }
        return panelState;
      } catch (error) {
        this.showOutput(`Save config failed: ${error.message}`);
        throw error;
      }
    },
    async runAction(action) {
      try {
        const result = await action();
        this.showOutput(result);
        await this.refresh();
      } catch (error) {
        this.showOutput(`Error: ${error.message}`);
      }
    },
    collectConfig() {
      return {
        host: (this.state && this.state.config && this.state.config.host) || (this.state && this.state.status && this.state.status.host) || '127.0.0.1',
        port: Number(this.$.portInput.value || 8765),
        toolProfile: this.$.profileSelect.value || 'core',
        enabledToolCategories: this.parseList(this.$.enabledCategoriesInput.value).map((item) => item.toLowerCase()),
        disabledToolCategories: this.parseList(this.$.disabledCategoriesInput.value).map((item) => item.toLowerCase()),
        enabledTools: this.parseList(this.$.enabledToolsInput.value),
        disabledTools: this.parseList(this.$.disabledToolsInput.value),
        enableSessions: Boolean(this.$.sessionsInput.value),
        autostart: Boolean(this.$.enabledInput.value),
        maxInteractionLogEntries: this.state && this.state.config ? this.state.config.maxInteractionLogEntries : 50,
        lastClientTargetId: this.$.clientTargetSelect.value || 'claude_code',
      };
    },
    async handleEnableToggle() {
      const shouldEnable = Boolean(this.$.enabledInput.value);
      const wasRunning = Boolean(this.state && this.state.status && this.state.status.running);

      await this.persistConfig();
      if (shouldEnable && !wasRunning) {
        await this.runAction(() => request('start-server'));
        return;
      }
      if (!shouldEnable && wasRunning) {
        await this.runAction(() => request('stop-server'));
        return;
      }
      await this.refresh();
    },
  },
  ready() {
    this.state = null;

    this.$.restartBtn.addEventListener('click', () => this.runAction(() => request('restart-server')));
    this.$.copyUrlBtn.addEventListener('click', () => {
      const status = this.state && this.state.status;
      const text = status && status.url ? status.url : '';
      this.copyText(text, 'Copied URL to clipboard.');
    });
    this.$.copyHealthCurlBtn.addEventListener('click', () => {
      this.copyText(this.getCurlCommand('health'), 'Copied health curl command.');
    });
    this.$.copyToolsCurlBtn.addEventListener('click', () => {
      this.copyText(this.getCurlCommand('tools'), 'Copied tools curl command.');
    });
    this.$.checkUpdatesBtn.addEventListener('click', () => this.runAction(() => request('check-updates')));
    this.$.enabledInput.addEventListener('change', () => this.handleEnableToggle());
    this.$.portInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.profileSelect.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.sessionsInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.enabledCategoriesInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.disabledCategoriesInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.enabledToolsInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.disabledToolsInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.useCoreBtn.addEventListener('click', () => {
      this.$.profileSelect.value = 'core';
      this.$.enabledCategoriesInput.value = '';
      this.$.disabledCategoriesInput.value = '';
      this.$.enabledToolsInput.value = '';
      this.$.disabledToolsInput.value = '';
      this.persistConfig({ showOutput: true });
    });
    this.$.useFullBtn.addEventListener('click', () => {
      this.$.profileSelect.value = 'full';
      this.$.enabledCategoriesInput.value = '';
      this.$.disabledCategoriesInput.value = '';
      this.$.enabledToolsInput.value = '';
      this.$.disabledToolsInput.value = '';
      this.persistConfig({ showOutput: true });
    });
    this.$.useCustomBtn.addEventListener('click', () => {
      this.$.profileSelect.value = 'custom';
      this.persistConfig({ showOutput: true });
    });
    this.$.clientTargetSelect.addEventListener('confirm', () => this.renderClientTargetStatus());
    this.$.clientTargetSelect.addEventListener('change', () => {
      this.renderClientTargetStatus();
      this.persistConfig();
    });
    this.$.configureClientBtn.addEventListener('click', () => {
      const targetId = this.$.clientTargetSelect.value;
      if (!targetId) {
        this.showOutput('Select a client target first.');
        return;
      }
      this.runAction(() => request('configure-client', targetId));
    });

    this.refresh();
  },
  close() {},
});
