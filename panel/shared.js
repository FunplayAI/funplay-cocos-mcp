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

function statusMarkup() {
  return `
    <header class="titlebar">
      <div>
        <h1>Funplay Cocos MCP</h1>
        <div id="versionText" class="subtle">Version</div>
      </div>
      <div id="statusPill" class="status-pill">Unknown</div>
    </header>
    <div id="statusText" class="status-line"></div>
  `;
}

function outputMarkup() {
  return `
    <section class="section output-section">
      <details>
        <summary>Output</summary>
        <pre id="output"></pre>
      </details>
    </section>
  `;
}

function dashboardTemplate() {
  return `
    <div class="mcp-root dashboard">
      ${statusMarkup()}
      <div id="updateStatus" class="update-strip"></div>

      <section class="section">
        <div class="section-title">Service</div>
        <div class="service-grid">
          <label>Server Port <ui-num-input id="portInput"></ui-num-input></label>
          <label>Tool Exposure
            <ui-select id="profileSelect">
              <option value="core">core</option>
              <option value="full">full</option>
              <option value="custom">custom</option>
            </ui-select>
          </label>
        </div>
        <div id="toolSummary" class="hint-line"></div>
        <div class="toolbar">
          <label class="checkbox-inline">
            <ui-checkbox id="enabledInput"></ui-checkbox>
            Enable MCP Server
          </label>
          <ui-button id="restartBtn">Restart</ui-button>
          <ui-button id="copyUrlBtn">Copy URL</ui-button>
          <ui-button id="checkUpdatesBtn">Check Updates</ui-button>
          <ui-button id="openReleaseBtn">Open Release</ui-button>
          <ui-button id="installUpdateBtn">Install Update</ui-button>
          <ui-button id="openToolsBtn">Edit Tools</ui-button>
          <ui-button id="openSettingsBtn">Settings</ui-button>
        </div>
      </section>

      <section class="section">
        <div class="section-title">MCP Client</div>
        <div class="toolbar">
          <ui-select id="clientTargetSelect"></ui-select>
          <ui-button id="configureClientBtn" class="primary">One-Click Configure</ui-button>
        </div>
        <div id="clientTargetStatus" class="inline-status"></div>
        <details class="preview-details">
          <summary>Preview selected config</summary>
          <ui-textarea id="clientConfigText" class="client-preview"></ui-textarea>
        </details>
      </section>

      <section class="section">
        <div class="section-heading">
          <div class="section-title">Recent Activity</div>
          <ui-button id="openActivityBtn">Open Activity</ui-button>
        </div>
        <div id="recentCalls" class="mini-list compact-list"></div>
      </section>

      ${outputMarkup()}
    </div>
  `;
}

function toolExposureTemplate() {
  return `
    <div class="mcp-root">
      <header class="plain-header">
        <h1>Tool Exposure</h1>
        <div class="hint-line">Edit exactly which tools MCP clients can see. Changes restart the running server automatically.</div>
      </header>
      <section class="section">
        <div class="section-heading">
          <div class="section-title">Edit Tool List</div>
          <div id="toolSummary" class="inline-status"></div>
        </div>
        <div class="service-grid">
          <label>Tool Exposure
            <ui-select id="profileSelect">
              <option value="core">core</option>
              <option value="full">full</option>
              <option value="custom">custom</option>
            </ui-select>
          </label>
          <div class="toolbar inline-toolbar">
            <ui-button id="useCoreBtn">Core</ui-button>
            <ui-button id="useFullBtn">Full</ui-button>
            <ui-button id="useCustomBtn">Custom</ui-button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div class="section-title">Tools</div>
          <div class="toolbar compact">
            <ui-button id="selectAllToolsBtn">Select All</ui-button>
            <ui-button id="clearToolsBtn">Clear</ui-button>
            <ui-button id="useDefaultToolsBtn">Use Default</ui-button>
          </div>
        </div>
        <div id="toolList" class="tool-list"></div>
      </section>

      <section class="section">
        <details>
          <summary>Named Profiles</summary>
          <div class="toolbar profile-row">
            <ui-input id="toolProfileNameInput" placeholder="Profile name"></ui-input>
            <ui-select id="savedToolProfileSelect"></ui-select>
            <ui-button id="saveToolProfileBtn">Save</ui-button>
            <ui-button id="applyToolProfileBtn">Apply</ui-button>
            <ui-button id="deleteToolProfileBtn">Delete</ui-button>
            <ui-button id="exportToolProfilesBtn">Export</ui-button>
            <ui-button id="importToolProfilesBtn">Import</ui-button>
          </div>
          <ui-textarea id="toolProfileImportText" class="short-textarea"></ui-textarea>
        </details>
      </section>

      <section class="section">
        <details>
          <summary>Raw Include / Exclude Lists</summary>
          <div class="tool-config-grid">
            <label>Enabled Categories <ui-textarea id="enabledCategoriesInput"></ui-textarea></label>
            <label>Disabled Categories <ui-textarea id="disabledCategoriesInput"></ui-textarea></label>
            <label>Enabled Tools <ui-textarea id="enabledToolsInput"></ui-textarea></label>
            <label>Disabled Tools <ui-textarea id="disabledToolsInput"></ui-textarea></label>
          </div>
        </details>
      </section>

      ${outputMarkup()}
    </div>
  `;
}

function settingsTemplate() {
  return `
    <div class="mcp-root">
      <header class="plain-header">
        <h1>MCP Settings</h1>
        <div class="hint-line">Project-level defaults for transport, JavaScript safety, and local diagnostics.</div>
      </header>
      <section class="section">
        <div class="section-title">Safety</div>
        <div class="settings-grid">
          <label class="checkbox-line">
            <ui-checkbox id="javascriptSafetyInput"></ui-checkbox>
            Default JavaScript safety checks
          </label>
        </div>
        <div class="hint-line">Default for execute_javascript calls when safety_checks is omitted. Explicit safety_checks=false can still bypass this for trusted local calls.</div>
      </section>

      <section class="section">
        <div class="section-title">Transport</div>
        <div class="settings-grid">
          <label class="checkbox-line">
            <ui-checkbox id="sessionsInput"></ui-checkbox>
            MCP Sessions
          </label>
        </div>
        <div class="hint-line">Direct HTTP is the default. Sessions add MCP-Session-Id handling for clients that require session-aware Streamable HTTP.</div>
      </section>

      <section class="section">
        <div class="section-title">Diagnostics</div>
        <div class="toolbar">
          <ui-button id="copyUrlBtn">Copy URL</ui-button>
          <ui-button id="copyHealthCurlBtn">Copy Health Curl</ui-button>
          <ui-button id="copyToolsCurlBtn">Copy Tools Curl</ui-button>
        </div>
      </section>

      ${outputMarkup()}
    </div>
  `;
}

function activityTemplate() {
  return `
    <div class="mcp-root">
      <header class="plain-header">
        <h1>Recent Activity</h1>
        <div class="hint-line">Recent MCP calls, results, and runtime traces for troubleshooting.</div>
      </header>
      <section class="section">
        <div class="section-heading">
          <div class="section-title">Tool Calls</div>
          <div class="toolbar compact">
            <ui-button id="refreshBtn">Refresh</ui-button>
            <ui-button id="clearActivityBtn">Clear</ui-button>
            <ui-button id="copyHealthCurlBtn">Copy Health Curl</ui-button>
            <ui-button id="copyToolsCurlBtn">Copy Tools Curl</ui-button>
          </div>
        </div>
        <div id="recentCalls" class="mini-list"></div>
      </section>
      <section class="section">
        <details>
          <summary>Runtime Logs</summary>
          <div id="recentLogs" class="mini-list log-list"></div>
        </details>
      </section>
      ${outputMarkup()}
    </div>
  `;
}

function templateForMode(mode) {
  if (mode === 'tool-exposure') return toolExposureTemplate();
  if (mode === 'settings') return settingsTemplate();
  if (mode === 'activity') return activityTemplate();
  return dashboardTemplate();
}

const STYLE = `
  :host {
    color: var(--color-normal-contrast);
    background: var(--color-normal-fill);
    font-size: 13px;
  }
  .mcp-root {
    height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 12px;
  }
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }
  h1 {
    margin: 0;
    font-size: 16px;
    line-height: 1.2;
    font-weight: 700;
  }
  h2 {
    margin: 0 0 6px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-normal-contrast-weak);
  }
  .subtle,
  .inline-status,
  .status-line,
  .hint-line {
    color: var(--color-normal-contrast-weakest);
  }
  .plain-header {
    margin-bottom: 10px;
  }
  .plain-header h1 {
    font-size: 17px;
    margin-bottom: 4px;
  }
  .status-line {
    min-height: 18px;
    margin-bottom: 10px;
    white-space: normal;
    word-break: break-word;
  }
  .status-pill {
    min-width: 68px;
    box-sizing: border-box;
    text-align: center;
    border-radius: 999px;
    padding: 4px 9px;
    color: #fff;
    background: #666;
    font-size: 12px;
    font-weight: 600;
  }
  .status-pill.running {
    background: #23884f;
  }
  .status-pill.stopped {
    background: #8a3f3f;
  }
  .section {
    border: 1px solid var(--color-normal-border);
    border-radius: 6px;
    background: var(--color-normal-fill-emphasis);
    padding: 10px;
    margin-bottom: 10px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .section-title {
    font-weight: 700;
    color: var(--color-normal-contrast);
  }
  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 8px;
  }
  .toolbar.compact {
    margin-top: 0;
  }
  .inline-toolbar {
    margin-top: 18px;
  }
  .service-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(180px, 1fr));
    gap: 8px;
  }
  .update-strip {
    display: none;
    color: var(--color-normal-contrast-weak);
    margin-bottom: 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .update-strip.status,
  .update-strip.has-update {
    display: block;
    border-left: 3px solid #d28a2d;
    background: rgba(210,138,45,0.12);
    border-radius: 5px;
    padding: 7px 8px;
    color: var(--color-normal-contrast);
  }
  .update-strip.error {
    display: block;
    border-left: 3px solid #b85353;
    background: rgba(184,83,83,0.12);
    border-radius: 5px;
    padding: 7px 8px;
  }
  .settings-grid,
  .tool-config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(180px, 1fr));
    gap: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--color-normal-contrast-weak);
  }
  .checkbox-inline,
  .checkbox-line {
    flex-direction: row;
    align-items: center;
    color: var(--color-normal-contrast);
    min-height: 28px;
  }
  ui-select,
  ui-input,
  ui-num-input {
    min-width: 132px;
  }
  ui-textarea {
    width: 100%;
    min-height: 90px;
  }
  .client-preview {
    margin-top: 8px;
    min-height: 120px;
  }
  .preview-details {
    margin-top: 8px;
  }
  .short-textarea {
    min-height: 54px;
    margin-top: 8px;
  }
  .profile-row ui-input,
  .profile-row ui-select {
    min-width: 150px;
  }
  .category-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tool-list {
    min-height: 320px;
    max-height: 520px;
    overflow: auto;
    border: 1px solid var(--color-normal-border);
    border-radius: 5px;
    padding: 6px;
    background: rgba(0,0,0,0.12);
  }
  .tool-group {
    margin-bottom: 8px;
  }
  .tool-group:last-child {
    margin-bottom: 0;
  }
  .tool-group summary {
    display: flex;
    align-items: center;
    min-height: 24px;
  }
  .tool-group-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 4px 0 6px 15px;
  }
  .tool-row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 6px;
    align-items: start;
    padding: 4px 4px 4px 15px;
    border-radius: 4px;
  }
  .tool-row:hover {
    background: rgba(255,255,255,0.04);
  }
  .tool-name {
    color: var(--color-normal-contrast);
    font-weight: 600;
    word-break: break-word;
  }
  .tool-desc {
    margin-top: 2px;
    color: var(--color-normal-contrast-weakest);
    font-size: 11px;
    line-height: 1.3;
    word-break: break-word;
  }
  .category-row {
    border: 1px solid var(--color-normal-border);
    border-radius: 5px;
    padding: 6px 8px;
    background: rgba(0,0,0,0.10);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .category-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .category-name {
    font-weight: 600;
    word-break: break-word;
  }
  .category-count {
    color: var(--color-normal-contrast-weakest);
    font-size: 11px;
    white-space: nowrap;
  }
  .category-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .activity-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 10px;
  }
  .mini-list {
    min-height: 260px;
    max-height: 520px;
    overflow: auto;
    border: 1px solid var(--color-normal-border);
    border-radius: 5px;
    padding: 8px;
    background: rgba(0,0,0,0.12);
    color: var(--color-normal-contrast-weak);
    line-height: 1.35;
  }
  .compact-list {
    min-height: 120px;
    max-height: 190px;
  }
  .log-list {
    margin-top: 8px;
  }
  .mini-item {
    padding: 7px 8px;
    margin-bottom: 6px;
    border-radius: 4px;
    border-left: 3px solid rgba(255,255,255,0.16);
    background: rgba(255,255,255,0.035);
  }
  .mini-item:last-child {
    margin-bottom: 0;
  }
  .mini-item.success,
  .mini-item.ok {
    border-left-color: #46a869;
  }
  .mini-item.error,
  .mini-item.err {
    border-left-color: #c65c5c;
  }
  .mini-item.int,
  .mini-item.interrupted {
    border-left-color: #d89a3a;
  }
  .mini-top {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto;
    gap: 7px;
    align-items: center;
  }
  .mini-time {
    color: var(--color-normal-contrast-weakest);
    font-size: 11px;
    white-space: nowrap;
  }
  .mini-badge {
    min-width: 28px;
    box-sizing: border-box;
    border-radius: 3px;
    padding: 1px 5px;
    background: #666;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
  }
  .mini-badge.success,
  .mini-badge.ok {
    background: #46a869;
  }
  .mini-badge.error,
  .mini-badge.err {
    background: #c65c5c;
  }
  .mini-badge.int,
  .mini-badge.interrupted {
    background: #d89a3a;
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
    margin-top: 3px;
    word-break: break-word;
    white-space: pre-wrap;
  }
  details {
    display: block;
  }
  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--color-normal-contrast);
    outline: none;
    user-select: none;
  }
  pre {
    min-height: 120px;
    max-height: 260px;
    overflow: auto;
    margin: 10px 0 0 0;
    background: #111;
    color: #d7ffd7;
    padding: 10px;
    border-radius: 5px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .primary {
    border-color: #4aa3ff;
  }
  @media (max-width: 660px) {
    .summary-grid,
    .service-grid,
    .settings-grid,
    .tool-config-grid,
    .category-controls,
    .activity-grid {
      grid-template-columns: 1fr;
    }
    .category-row {
      grid-template-columns: 1fr;
    }
  }
`;

const SELECTORS = {
  statusPill: '#statusPill',
  versionText: '#versionText',
  statusText: '#statusText',
  endpointMetric: '#endpointMetric',
  projectMetric: '#projectMetric',
  toolMetric: '#toolMetric',
  updateStatus: '#updateStatus',
  enabledInput: '#enabledInput',
  portInput: '#portInput',
  profileSelect: '#profileSelect',
  sessionsInput: '#sessionsInput',
  javascriptSafetyInput: '#javascriptSafetyInput',
  restartBtn: '#restartBtn',
  copyUrlBtn: '#copyUrlBtn',
  copyHealthCurlBtn: '#copyHealthCurlBtn',
  copyToolsCurlBtn: '#copyToolsCurlBtn',
  checkUpdatesBtn: '#checkUpdatesBtn',
  openReleaseBtn: '#openReleaseBtn',
  installUpdateBtn: '#installUpdateBtn',
  openToolsBtn: '#openToolsBtn',
  openSettingsBtn: '#openSettingsBtn',
  openActivityBtn: '#openActivityBtn',
  openDashboardBtn: '#openDashboardBtn',
  refreshBtn: '#refreshBtn',
  clientTargetSelect: '#clientTargetSelect',
  configureClientBtn: '#configureClientBtn',
  clientTargetStatus: '#clientTargetStatus',
  clientConfigText: '#clientConfigText',
  toolSummary: '#toolSummary',
  useCoreBtn: '#useCoreBtn',
  useFullBtn: '#useFullBtn',
  useCustomBtn: '#useCustomBtn',
  selectAllToolsBtn: '#selectAllToolsBtn',
  clearToolsBtn: '#clearToolsBtn',
  useDefaultToolsBtn: '#useDefaultToolsBtn',
  toolProfileNameInput: '#toolProfileNameInput',
  savedToolProfileSelect: '#savedToolProfileSelect',
  saveToolProfileBtn: '#saveToolProfileBtn',
  applyToolProfileBtn: '#applyToolProfileBtn',
  deleteToolProfileBtn: '#deleteToolProfileBtn',
  exportToolProfilesBtn: '#exportToolProfilesBtn',
  importToolProfilesBtn: '#importToolProfilesBtn',
  toolProfileImportText: '#toolProfileImportText',
  categoryControls: '#categoryControls',
  toolList: '#toolList',
  enabledCategoriesInput: '#enabledCategoriesInput',
  disabledCategoriesInput: '#disabledCategoriesInput',
  enabledToolsInput: '#enabledToolsInput',
  disabledToolsInput: '#disabledToolsInput',
  recentCalls: '#recentCalls',
  recentLogs: '#recentLogs',
  clearActivityBtn: '#clearActivityBtn',
  output: '#output',
};

function createPanel(mode) {
  return Editor.Panel.define({
    template: templateForMode(mode),
    style: STYLE,
    $: SELECTORS,
    methods: createMethods(mode),
    ready() {
      this.mode = mode;
      this.state = null;
      this.bindEvents();
      this.refresh()
        .then(() => {
          if (mode === 'dashboard' || mode === 'settings') {
            return this.autoCheckUpdates();
          }
          return null;
        })
        .catch((error) => this.showOutput(`Refresh failed: ${error.message}`));
    },
    close() {},
  });
}

function createMethods(mode) {
  return {
    async refresh() {
      try {
        this.state = await request('get-panel-state');
        this.renderState();
      } catch (error) {
        this.showOutput(`Refresh failed: ${error.message}`);
        throw error;
      }
    },
    renderState() {
      const state = this.state || {};
      const status = state.status || {};
      const config = state.config || {};
      const isRunning = Boolean(status.running);

      this.setText('versionText', `Version ${status.version || 'unknown'}`);
      if (this.$.statusPill) {
        this.$.statusPill.textContent = isRunning ? 'Running' : 'Stopped';
        this.$.statusPill.classList.toggle('running', isRunning);
        this.$.statusPill.classList.toggle('stopped', !isRunning);
      }

      const portText = status.portFallbackActive
        ? ` | Port fallback: ${status.requestedPort} -> ${status.port}`
        : '';
      const attachText = status.attachedToExisting ? ' | Attached listener' : '';
      this.setText(
        'statusText',
        `${status.url || ''} | Project: ${status.projectName || ''} | Cocos ${status.cocosVersion || ''}${portText}${attachText}`
      );

      this.setText('endpointMetric', status.url || '-');
      this.setText('projectMetric', status.projectName || '-');
      const catalog = state.toolCatalog || [];
      const enabled = catalog.filter((tool) => tool.enabled);
      this.setText('toolMetric', `${enabled.length}/${catalog.length}`);

      this.setControlValue('enabledInput', Boolean(isRunning || config.autostart));
      this.setControlValue('portInput', Number(config.port || status.port || 8765));
      this.setControlValue('profileSelect', config.toolProfile || status.toolProfile || 'core');
      this.setControlValue('sessionsInput', Boolean(config.enableSessions || status.enableSessions));
      this.setControlValue('javascriptSafetyInput', config.executeJavascriptSafetyChecks !== false);
      this.setControlValue('enabledCategoriesInput', this.formatList(config.enabledToolCategories));
      this.setControlValue('disabledCategoriesInput', this.formatList(config.disabledToolCategories));
      this.setControlValue('enabledToolsInput', this.formatList(config.enabledTools));
      this.setControlValue('disabledToolsInput', this.formatList(config.disabledTools));

      this.renderUpdateStatus();
      this.renderToolSummary();
      this.renderToolProfiles();
      this.renderCategoryControls();
      this.renderToolList();
      this.renderClientTargets();
      this.renderActivity();
    },
    setText(key, value) {
      if (this.$[key]) {
        this.$[key].textContent = value;
      }
    },
    setControlValue(key, value) {
      if (this.$[key]) {
        this.$[key].value = value;
      }
    },
    formatList(value) {
      return Array.isArray(value) ? value.join('\n') : '';
    },
    parseList(value) {
      if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
      }
      return String(value || '')
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    },
    renderUpdateStatus() {
      if (!this.$.updateStatus) {
        return;
      }
      const update = this.state && this.state.updateInfo;
      const install = this.state && this.state.installInfo;
      this.$.updateStatus.classList.remove('status', 'has-update', 'error');
      this.setDisabled(this.$.openReleaseBtn, !(update && update.releaseUrl));
      this.setDisabled(
        this.$.installUpdateBtn,
        !(update && update.ok && update.updateAvailable && update.downloadAvailable)
      );

      if (install && install.installed) {
        const reload = install.reload && install.reload.scheduled
          ? `Reload scheduled in ${install.reload.delayMs}ms`
          : `Reload not scheduled: ${install.reload && install.reload.reason || 'unknown'}`;
        this.$.updateStatus.textContent =
          `Installed ${install.installedVersion}. ${reload}. Backup: ${install.backupDir}`;
        this.$.updateStatus.classList.add('status');
        return;
      }
      if (!update) {
        this.$.updateStatus.textContent = '';
        return;
      }
      if (!update.ok) {
        this.$.updateStatus.textContent = `Update check failed: ${update.error}`;
        this.$.updateStatus.classList.add('error');
        return;
      }
      const published = update.publishedAt ? `, published ${update.publishedAt.slice(0, 10)}` : '';
      this.$.updateStatus.textContent = update.updateAvailable
        ? `Update available: ${update.latestVersion}${published}. ` +
          (update.downloadAvailable ? 'Ready to install.' : 'Release assets are incomplete; install manually.')
        : '';
      if (update.updateAvailable) {
        this.$.updateStatus.classList.add('has-update');
      }
    },
    renderToolSummary() {
      if (!this.$.toolSummary) {
        return;
      }
      const catalog = (this.state && this.state.toolCatalog) || [];
      const enabled = catalog.filter((tool) => tool.enabled);
      const config = this.state && this.state.config ? this.state.config : {};
      const status = this.state && this.state.status ? this.state.status : {};
      const profile = config.toolProfile || status.toolProfile || 'core';
      const savedName = config.activeToolProfileName ? ` | Profile: ${config.activeToolProfileName}` : '';
      if (mode === 'dashboard') {
        const hint = profile === 'full'
          ? 'full exposes every registered tool.'
          : profile === 'custom'
            ? 'custom uses your include/exclude rules.'
            : 'core keeps the client tool list focused.';
        this.$.toolSummary.textContent = `Active: ${profile}${savedName} | ${enabled.length}/${catalog.length} tools. ${hint}`;
        return;
      }
      const hasOverrides = Boolean(
        (config.enabledTools && config.enabledTools.length) ||
        (config.disabledTools && config.disabledTools.length) ||
        (config.enabledToolCategories && config.enabledToolCategories.length) ||
        (config.disabledToolCategories && config.disabledToolCategories.length)
      );
      const source = hasOverrides ? 'with overrides' : 'default list';
      this.$.toolSummary.textContent = `Active: ${profile}${savedName} | ${enabled.length}/${catalog.length} tools (${source})`;
    },
    normalizeToolProfile(profile) {
      const name = String(profile && profile.name || '').trim();
      if (!name) {
        throw new Error('Profile name is required.');
      }
      const profileMode = String(profile.toolProfile || 'core').toLowerCase();
      return {
        name: name.slice(0, 80),
        toolProfile: profileMode === 'full' || profileMode === 'custom' ? profileMode : 'core',
        enabledToolCategories: this.parseList(profile.enabledToolCategories).map((item) => item.toLowerCase()),
        disabledToolCategories: this.parseList(profile.disabledToolCategories).map((item) => item.toLowerCase()),
        enabledTools: this.parseList(profile.enabledTools),
        disabledTools: this.parseList(profile.disabledTools),
        updatedAt: profile.updatedAt || new Date().toISOString(),
      };
    },
    normalizeToolProfiles(value) {
      const result = [];
      const seen = new Set();
      (Array.isArray(value) ? value : []).forEach((profile) => {
        try {
          const normalized = this.normalizeToolProfile(profile);
          const key = normalized.name.toLowerCase();
          const existing = result.findIndex((item) => item.name.toLowerCase() === key);
          if (existing >= 0) {
            result[existing] = normalized;
          } else if (!seen.has(key)) {
            seen.add(key);
            result.push(normalized);
          }
        } catch (error) {
          // Backend validation repeats this; malformed imported entries are ignored in the panel.
        }
      });
      return result.sort((left, right) => left.name.localeCompare(right.name));
    },
    getSavedToolProfiles() {
      const config = this.state && this.state.config ? this.state.config : {};
      return this.normalizeToolProfiles(config.savedToolProfiles || []);
    },
    renderToolProfiles() {
      if (!this.$.savedToolProfileSelect) {
        return;
      }
      const config = this.state && this.state.config ? this.state.config : {};
      const profiles = this.getSavedToolProfiles();
      const selected = this.$.savedToolProfileSelect.value
        || config.activeToolProfileName
        || (profiles[0] && profiles[0].name)
        || '';
      this.$.savedToolProfileSelect.innerHTML = '';
      if (profiles.length) {
        profiles.forEach((profile) => {
          const option = document.createElement('option');
          option.value = profile.name;
          option.textContent = profile.name;
          this.$.savedToolProfileSelect.appendChild(option);
        });
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No saved profiles';
        this.$.savedToolProfileSelect.appendChild(option);
      }
      this.$.savedToolProfileSelect.value = selected;
      if (this.$.toolProfileNameInput && !this.$.toolProfileNameInput.value) {
        this.$.toolProfileNameInput.value = selected || config.activeToolProfileName || '';
      }
    },
    renderCategoryControls() {
      if (!this.$.categoryControls) {
        return;
      }
      const catalog = (this.state && this.state.toolCatalog) || [];
      const groups = catalog.reduce((acc, tool) => {
        const category = tool.category || 'other';
        if (!acc[category]) {
          acc[category] = { total: 0, enabled: 0 };
        }
        acc[category].total += 1;
        if (tool.enabled) {
          acc[category].enabled += 1;
        }
        return acc;
      }, {});

      this.$.categoryControls.innerHTML = '';
      Object.keys(groups).sort().forEach((category) => {
        const row = document.createElement('div');
        row.className = 'category-row';

        const heading = document.createElement('div');
        heading.className = 'category-heading';
        const name = document.createElement('div');
        name.className = 'category-name';
        name.textContent = category;
        const count = document.createElement('div');
        count.className = 'category-count';
        count.textContent = `${groups[category].enabled}/${groups[category].total}`;
        heading.appendChild(name);
        heading.appendChild(count);

        const actions = document.createElement('div');
        actions.className = 'category-actions';
        [
          ['enable', 'Enable'],
          ['disable', 'Disable'],
          ['clear', 'Clear'],
        ].forEach(([action, label]) => {
          const button = document.createElement('ui-button');
          button.textContent = label;
          button.dataset.category = category;
          button.dataset.mode = action;
          actions.appendChild(button);
        });

        row.appendChild(heading);
        row.appendChild(actions);
        this.$.categoryControls.appendChild(row);
      });
    },
    renderToolList() {
      if (!this.$.toolList) {
        return;
      }
      const catalog = (this.state && this.state.toolCatalog) || [];
      const groups = catalog.reduce((acc, tool) => {
        const category = tool.category || 'other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(tool);
        return acc;
      }, {});

      this.$.toolList.innerHTML = '';
      Object.keys(groups).sort().forEach((category) => {
        const tools = groups[category].sort((left, right) => left.name.localeCompare(right.name));
        const enabledCount = tools.filter((tool) => tool.enabled).length;
        const details = document.createElement('details');
        details.className = 'tool-group';
        details.open = true;

        const summary = document.createElement('summary');
        summary.textContent = `${category} (${enabledCount}/${tools.length})`;
        details.appendChild(summary);

        const actions = document.createElement('div');
        actions.className = 'tool-group-actions';
        [
          ['enable', 'Select'],
          ['disable', 'Clear'],
        ].forEach(([action, label]) => {
          const button = document.createElement('ui-button');
          button.textContent = label;
          button.dataset.category = category;
          button.dataset.mode = action;
          actions.appendChild(button);
        });
        details.appendChild(actions);

        tools.forEach((tool) => {
          const row = document.createElement('div');
          row.className = 'tool-row';

          const checkbox = document.createElement('ui-checkbox');
          checkbox.value = Boolean(tool.enabled);
          checkbox.dataset.toolName = tool.name;
          row.appendChild(checkbox);

          const text = document.createElement('div');
          const name = document.createElement('div');
          name.className = 'tool-name';
          name.textContent = tool.name;
          text.appendChild(name);

          if (tool.description) {
            const description = document.createElement('div');
            description.className = 'tool-desc';
            description.textContent = tool.description;
            text.appendChild(description);
          }

          row.appendChild(text);
          details.appendChild(row);
        });

        this.$.toolList.appendChild(details);
      });
    },
    renderClientTargets() {
      if (!this.$.clientTargetSelect) {
        return;
      }
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
      if (!this.$.clientTargetStatus) {
        return;
      }
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
      if (this.$.clientConfigText) {
        this.$.clientConfigText.value = preview && preview.preview
          ? preview.preview
          : (this.state && this.state.clientConfig ? this.state.clientConfig.codex : '');
      }
    },
    renderActivity() {
      const state = this.state || {};
      this.renderMiniList(
        this.$.recentCalls,
        state.recentInteractions || [],
        (entry) => ({
          title: entry.toolName || 'tool',
          status: entry.status || 'info',
          badge: this.statusBadgeText(entry.status),
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
      if (!container) {
        return;
      }
      container.innerHTML = '';
      if (!entries.length) {
        container.textContent = emptyText;
        return;
      }
      const fragment = document.createDocumentFragment();
      entries.slice(0, 12).forEach((entry) => {
        const formatted = formatEntry(entry);
        const item = document.createElement('div');
        item.className = `mini-item ${this.statusClass(formatted.status)}`;
        if (formatted.badge) {
          const top = document.createElement('div');
          top.className = 'mini-top';
          const time = document.createElement('div');
          time.className = 'mini-time';
          time.textContent = formatted.meta || '';
          top.appendChild(time);
          const title = document.createElement('div');
          title.className = 'mini-title';
          title.textContent = formatted.title;
          top.appendChild(title);
          const badge = document.createElement('div');
          badge.className = `mini-badge ${this.statusClass(formatted.status)}`;
          badge.textContent = formatted.badge;
          top.appendChild(badge);
          item.appendChild(top);
        } else {
          const title = document.createElement('div');
          title.className = 'mini-title';
          title.textContent = formatted.title;
          item.appendChild(title);
        }
        if (formatted.meta) {
          if (!formatted.badge) {
            const meta = document.createElement('div');
            meta.className = 'mini-meta';
            meta.textContent = formatted.meta;
            item.appendChild(meta);
          }
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
    statusClass(status) {
      const normalized = String(status || '').toLowerCase();
      if (normalized === 'success' || normalized === 'ok') {
        return 'success';
      }
      if (normalized === 'interrupted' || normalized === 'interrupt' || normalized === 'int') {
        return 'int';
      }
      if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') {
        return 'error';
      }
      return normalized.replace(/[^a-z0-9_-]/g, '') || 'info';
    },
    statusBadgeText(status) {
      const normalized = this.statusClass(status);
      if (normalized === 'success') {
        return 'OK';
      }
      if (normalized === 'int') {
        return 'INT';
      }
      if (normalized === 'error') {
        return 'ERR';
      }
      return normalized.slice(0, 3).toUpperCase() || 'LOG';
    },
    getControlValue(key, fallback) {
      return this.$[key] ? this.$[key].value : fallback;
    },
    collectConfig() {
      const state = this.state || {};
      const config = state.config || {};
      const status = state.status || {};
      const port = Number(this.getControlValue('portInput', config.port || status.port || 8765));
      return {
        host: config.host || status.host || '127.0.0.1',
        port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : (config.port || 8765),
        toolProfile: this.getControlValue('profileSelect', config.toolProfile || status.toolProfile || 'core'),
        enabledToolCategories: this.$.enabledCategoriesInput
          ? this.parseList(this.$.enabledCategoriesInput.value).map((item) => item.toLowerCase())
          : (config.enabledToolCategories || []),
        disabledToolCategories: this.$.disabledCategoriesInput
          ? this.parseList(this.$.disabledCategoriesInput.value).map((item) => item.toLowerCase())
          : (config.disabledToolCategories || []),
        enabledTools: this.$.enabledToolsInput
          ? this.parseList(this.$.enabledToolsInput.value)
          : (config.enabledTools || []),
        disabledTools: this.$.disabledToolsInput
          ? this.parseList(this.$.disabledToolsInput.value)
          : (config.disabledTools || []),
        enableSessions: this.$.sessionsInput ? Boolean(this.$.sessionsInput.value) : Boolean(config.enableSessions),
        executeJavascriptSafetyChecks: this.$.javascriptSafetyInput
          ? Boolean(this.$.javascriptSafetyInput.value)
          : config.executeJavascriptSafetyChecks !== false,
        autostart: this.$.enabledInput
          ? Boolean(this.$.enabledInput.value)
          : Boolean(config.autostart),
        maxInteractionLogEntries: config.maxInteractionLogEntries || 50,
        lastClientTargetId: this.$.clientTargetSelect
          ? (this.$.clientTargetSelect.value || config.lastClientTargetId || 'claude_code')
          : (config.lastClientTargetId || 'claude_code'),
        activeToolProfileName: this.$.toolProfileNameInput
          ? (this.$.toolProfileNameInput.value || '')
          : (config.activeToolProfileName || ''),
        savedToolProfiles: this.getSavedToolProfiles(),
      };
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
    showOutput(value) {
      if (this.$.output) {
        this.$.output.textContent = stringify(value);
      }
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
    setDisabled(element, disabled) {
      if (!element) {
        return;
      }
      element.disabled = Boolean(disabled);
      if (disabled) {
        element.setAttribute('disabled', '');
      } else {
        element.removeAttribute('disabled');
      }
    },
    currentToolProfileSnapshot(name) {
      return this.normalizeToolProfile({
        name,
        toolProfile: this.$.profileSelect
          ? this.$.profileSelect.value
          : ((this.state && this.state.config && this.state.config.toolProfile) || 'core'),
        enabledToolCategories: this.$.enabledCategoriesInput
          ? this.parseList(this.$.enabledCategoriesInput.value).map((item) => item.toLowerCase())
          : [],
        disabledToolCategories: this.$.disabledCategoriesInput
          ? this.parseList(this.$.disabledCategoriesInput.value).map((item) => item.toLowerCase())
          : [],
        enabledTools: this.$.enabledToolsInput ? this.parseList(this.$.enabledToolsInput.value) : [],
        disabledTools: this.$.disabledToolsInput ? this.parseList(this.$.disabledToolsInput.value) : [],
      });
    },
    async saveCurrentToolProfile() {
      const name = this.$.toolProfileNameInput.value || this.$.savedToolProfileSelect.value;
      const snapshot = this.currentToolProfileSnapshot(name);
      const profiles = this.getSavedToolProfiles();
      const key = snapshot.name.toLowerCase();
      const existing = profiles.findIndex((profile) => profile.name.toLowerCase() === key);
      if (existing >= 0) {
        profiles[existing] = snapshot;
      } else {
        profiles.push(snapshot);
      }
      this.state.config.savedToolProfiles = this.normalizeToolProfiles(profiles);
      this.state.config.activeToolProfileName = snapshot.name;
      await this.persistConfig({ showOutput: true });
    },
    async applySavedToolProfile() {
      const name = this.$.savedToolProfileSelect.value;
      const profile = this.getSavedToolProfiles().find((item) => item.name === name);
      if (!profile) {
        this.showOutput('Select a saved profile first.');
        return;
      }
      this.setControlValue('profileSelect', profile.toolProfile);
      this.setControlValue('enabledCategoriesInput', this.formatList(profile.enabledToolCategories));
      this.setControlValue('disabledCategoriesInput', this.formatList(profile.disabledToolCategories));
      this.setControlValue('enabledToolsInput', this.formatList(profile.enabledTools));
      this.setControlValue('disabledToolsInput', this.formatList(profile.disabledTools));
      this.setControlValue('toolProfileNameInput', profile.name);
      this.state.config.activeToolProfileName = profile.name;
      await this.persistConfig({ showOutput: true });
    },
    async deleteSavedToolProfile() {
      const name = this.$.savedToolProfileSelect.value;
      if (!name) {
        this.showOutput('Select a saved profile first.');
        return;
      }
      this.state.config.savedToolProfiles = this.getSavedToolProfiles()
        .filter((profile) => profile.name !== name);
      if (this.state.config.activeToolProfileName === name) {
        this.state.config.activeToolProfileName = '';
      }
      this.setControlValue('toolProfileNameInput', '');
      await this.persistConfig({ showOutput: true });
    },
    exportSavedToolProfiles() {
      const payload = JSON.stringify({ version: 1, profiles: this.getSavedToolProfiles() }, null, 2);
      this.setControlValue('toolProfileImportText', payload);
      this.copyText(payload, 'Copied tool profiles to clipboard.');
    },
    async importSavedToolProfiles() {
      try {
        const payload = JSON.parse(this.$.toolProfileImportText.value || '{}');
        const incoming = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.profiles)
            ? payload.profiles
            : [];
        if (!incoming.length) {
          throw new Error('No profiles found.');
        }
        this.state.config.savedToolProfiles = this.normalizeToolProfiles([
          ...this.getSavedToolProfiles(),
          ...incoming,
        ]);
        await this.persistConfig({ showOutput: true });
      } catch (error) {
        this.showOutput(`Import profiles failed: ${error.message}`);
      }
    },
    async setCategoryExposure(category, action) {
      const enabled = new Set(this.parseList(this.$.enabledCategoriesInput.value).map((item) => item.toLowerCase()));
      const disabled = new Set(this.parseList(this.$.disabledCategoriesInput.value).map((item) => item.toLowerCase()));
      const key = String(category || '').toLowerCase();
      if (!key) {
        return;
      }
      enabled.delete(key);
      disabled.delete(key);
      if (action === 'enable') {
        enabled.add(key);
      } else if (action === 'disable') {
        disabled.add(key);
      }
      this.setControlValue('profileSelect', 'custom');
      this.$.enabledCategoriesInput.value = Array.from(enabled).sort().join('\n');
      this.$.disabledCategoriesInput.value = Array.from(disabled).sort().join('\n');
      await this.persistConfig({ showOutput: true });
    },
    async setToolExposure(toolName, exposed) {
      const name = String(toolName || '').trim();
      if (!name) {
        return;
      }
      const enabled = new Set(this.parseList(this.getControlValue('enabledToolsInput', '')).map(String));
      const disabled = new Set(this.parseList(this.getControlValue('disabledToolsInput', '')).map(String));
      enabled.delete(name);
      disabled.delete(name);
      if (exposed) {
        enabled.add(name);
      } else {
        disabled.add(name);
      }
      this.setControlValue('enabledToolsInput', Array.from(enabled).sort().join('\n'));
      this.setControlValue('disabledToolsInput', Array.from(disabled).sort().join('\n'));
      await this.persistConfig({ showOutput: false });
      this.showOutput(`Tool exposure saved: ${name} ${exposed ? 'enabled' : 'disabled'}.`);
    },
    async setAllToolExposure(exposed) {
      const catalog = (this.state && this.state.toolCatalog) || [];
      const names = catalog.map((tool) => tool.name).filter(Boolean).sort();
      this.setControlValue('enabledCategoriesInput', '');
      this.setControlValue('disabledCategoriesInput', '');
      this.setControlValue('enabledToolsInput', exposed ? names.join('\n') : '');
      this.setControlValue('disabledToolsInput', exposed ? '' : names.join('\n'));
      await this.persistConfig({ showOutput: true });
    },
    async useDefaultToolList() {
      this.setControlValue('enabledCategoriesInput', '');
      this.setControlValue('disabledCategoriesInput', '');
      this.setControlValue('enabledToolsInput', '');
      this.setControlValue('disabledToolsInput', '');
      await this.persistConfig({ showOutput: true });
    },
    async clearActivity() {
      await this.runAction(() => request('call-tool', 'clear_logs', { scope: 'mcp' }));
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
    async autoCheckUpdates() {
      try {
        const panelState = await request('auto-check-updates');
        this.state = panelState;
        this.renderState();
      } catch (error) {
        this.showOutput(`Automatic update check failed: ${error.message}`);
      }
    },
    async installUpdate() {
      const update = this.state && this.state.updateInfo;
      if (!(update && update.ok && update.updateAvailable && update.downloadAvailable)) {
        this.showOutput('No installable update is available.');
        return;
      }
      const message =
        `Install Funplay Cocos MCP ${update.latestVersion} now?\n\n` +
        'The updater will verify SHA256SUMS.txt, back up the current extension, replace the package files, and reload the extension when Cocos supports it.';
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) {
        return;
      }
      await this.runAction(() => request('install-update'));
    },
    bindEvents() {
      this.on(this.$.restartBtn, 'click', () => this.runAction(() => request('restart-server')));
      this.on(this.$.refreshBtn, 'click', () => this.refresh());
      this.on(this.$.copyUrlBtn, 'click', () => {
        const status = this.state && this.state.status;
        this.copyText(status && status.url ? status.url : '', 'Copied URL to clipboard.');
      });
      this.on(this.$.copyHealthCurlBtn, 'click', () => {
        this.copyText(this.getCurlCommand('health'), 'Copied health curl command.');
      });
      this.on(this.$.copyToolsCurlBtn, 'click', () => {
        this.copyText(this.getCurlCommand('tools'), 'Copied tools curl command.');
      });
      this.on(this.$.checkUpdatesBtn, 'click', () => this.runAction(() => request('check-updates')));
      this.on(this.$.openReleaseBtn, 'click', () => this.runAction(() => request('open-update-release')));
      this.on(this.$.installUpdateBtn, 'click', () => this.installUpdate());
      this.on(this.$.openToolsBtn, 'click', () => this.runAction(() => request('open-panel', 'tool-exposure')));
      this.on(this.$.openSettingsBtn, 'click', () => this.runAction(() => request('open-panel', 'settings')));
      this.on(this.$.openActivityBtn, 'click', () => this.runAction(() => request('open-panel', 'activity')));
      this.on(this.$.openDashboardBtn, 'click', () => this.runAction(() => request('open-panel', 'default')));
      this.on(this.$.enabledInput, 'change', () => this.handleEnableToggle());
      this.on(this.$.portInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.profileSelect, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.sessionsInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.javascriptSafetyInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.enabledCategoriesInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.disabledCategoriesInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.enabledToolsInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.disabledToolsInput, 'change', () => this.persistConfig({ showOutput: true }));
      this.on(this.$.clientTargetSelect, 'confirm', () => this.renderClientTargetStatus());
      this.on(this.$.clientTargetSelect, 'change', () => {
        this.renderClientTargetStatus();
        this.persistConfig();
      });
      this.on(this.$.configureClientBtn, 'click', () => {
        const targetId = this.$.clientTargetSelect.value;
        if (!targetId) {
          this.showOutput('Select a client target first.');
          return;
        }
        this.runAction(() => request('configure-client', targetId));
      });
      this.on(this.$.useCoreBtn, 'click', () => this.applyPreset('core'));
      this.on(this.$.useFullBtn, 'click', () => this.applyPreset('full'));
      this.on(this.$.useCustomBtn, 'click', () => this.applyPreset('custom'));
      this.on(this.$.selectAllToolsBtn, 'click', () => this.setAllToolExposure(true));
      this.on(this.$.clearToolsBtn, 'click', () => this.setAllToolExposure(false));
      this.on(this.$.useDefaultToolsBtn, 'click', () => this.useDefaultToolList());
      this.on(this.$.clearActivityBtn, 'click', () => this.clearActivity());
      this.on(this.$.saveToolProfileBtn, 'click', () => this.saveCurrentToolProfile());
      this.on(this.$.applyToolProfileBtn, 'click', () => this.applySavedToolProfile());
      this.on(this.$.deleteToolProfileBtn, 'click', () => this.deleteSavedToolProfile());
      this.on(this.$.exportToolProfilesBtn, 'click', () => this.exportSavedToolProfiles());
      this.on(this.$.importToolProfilesBtn, 'click', () => this.importSavedToolProfiles());
      this.on(this.$.savedToolProfileSelect, 'change', () => {
        this.setControlValue('toolProfileNameInput', this.$.savedToolProfileSelect.value || '');
      });
      this.on(this.$.categoryControls, 'click', (event) => {
        const target = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('ui-button')
          : event.target;
        if (!target || !target.dataset || !target.dataset.category) {
          return;
        }
        this.setCategoryExposure(target.dataset.category, target.dataset.mode);
      });
      this.on(this.$.toolList, 'click', (event) => {
        const target = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('ui-button')
          : event.target;
        if (!target || !target.dataset || !target.dataset.category) {
          return;
        }
        this.setCategoryExposure(target.dataset.category, target.dataset.mode);
      });
      this.on(this.$.toolList, 'change', (event) => {
        const target = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('ui-checkbox')
          : event.target;
        if (!target || !target.dataset || !target.dataset.toolName) {
          return;
        }
        const exposed = target.value === true || target.value === 'true' || target.checked === true;
        this.setToolExposure(target.dataset.toolName, exposed);
      });
    },
    on(element, event, handler) {
      if (element) {
        element.addEventListener(event, handler);
      }
    },
    applyPreset(profile) {
      this.setControlValue('profileSelect', profile);
      if (profile !== 'custom') {
        this.setControlValue('enabledCategoriesInput', '');
        this.setControlValue('disabledCategoriesInput', '');
        this.setControlValue('enabledToolsInput', '');
        this.setControlValue('disabledToolsInput', '');
      }
      this.persistConfig({ showOutput: true });
    },
  };
}

module.exports = {
  createPanel,
};
