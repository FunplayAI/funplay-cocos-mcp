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
          <p>Operate the embedded MCP server from Cocos Creator.</p>
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
        </div>
        <div class="grid">
          <label>Server Port <ui-num-input id="portInput"></ui-num-input></label>
          <label>Tool Exposure
            <ui-select id="profileSelect">
              <option value="core">core</option>
              <option value="full">full</option>
            </ui-select>
          </label>
        </div>
        <p>Changes auto-save. Port/profile changes restart the server when needed.</p>
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
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--color-normal-contrast-weak);
    }
    .checkbox-line {
      flex-direction: row;
      align-items: center;
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
  `,
  $: {
    root: '.mcp-root',
    statusPill: '#statusPill',
    statusText: '#statusText',
    enabledInput: '#enabledInput',
    portInput: '#portInput',
    profileSelect: '#profileSelect',
    restartBtn: '#restartBtn',
    copyUrlBtn: '#copyUrlBtn',
    clientTargetSelect: '#clientTargetSelect',
    configureClientBtn: '#configureClientBtn',
    clientTargetStatus: '#clientTargetStatus',
    clientConfigText: '#clientConfigText',
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

      this.$.statusPill.textContent = isRunning ? 'Running' : 'Stopped';
      this.$.statusPill.classList.toggle('running', isRunning);
      this.$.statusPill.classList.toggle('stopped', !isRunning);
      this.$.statusText.textContent = `${status.url || ''}  |  Project: ${status.projectName || ''}  |  Cocos ${status.cocosVersion || ''}`;

      this.$.enabledInput.value = Boolean(isRunning || config.autostart);
      this.$.portInput.value = Number(config.port || status.port || 8765);
      this.$.profileSelect.value = config.toolProfile || status.toolProfile || 'core';

      this.$.clientConfigText.value = state.clientConfig ? state.clientConfig.codex : '';
      this.renderClientTargets();
    },
    renderClientTargets() {
      const targets = (this.state && this.state.clientTargets) || [];
      const selected = this.$.clientTargetSelect.value || (targets[0] && targets[0].id);
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
    },
    showOutput(value) {
      this.$.output.textContent = stringify(value);
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
        autostart: Boolean(this.$.enabledInput.value),
        maxInteractionLogEntries: this.state && this.state.config ? this.state.config.maxInteractionLogEntries : 50,
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
      navigator.clipboard.writeText(text)
        .then(() => this.showOutput('Copied URL to clipboard.'))
        .catch(() => this.showOutput(text));
    });
    this.$.enabledInput.addEventListener('change', () => this.handleEnableToggle());
    this.$.portInput.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.profileSelect.addEventListener('change', () => this.persistConfig({ showOutput: true }));
    this.$.clientTargetSelect.addEventListener('confirm', () => this.renderClientTargetStatus());
    this.$.clientTargetSelect.addEventListener('change', () => this.renderClientTargetStatus());
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
