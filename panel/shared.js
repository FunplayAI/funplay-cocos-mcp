'use strict';

const EN = require('../i18n/en');
const ZH = require('../i18n/zh');
const { detectEditorLanguage, resolveLanguage, translate } = require('../lib/i18n');
const { localizeToolDescription } = require('./tool-description-i18n');

const PKG = 'funplay-cocos-mcp';
const DICTIONARIES = { en: EN, zh: ZH };

function request(message, ...args) {
  return Editor.Message.request(PKG, message, ...args);
}

function statusMarkup() {
  return `
    <header class="titlebar">
      <h1 data-i18n="panel_server">MCP Server</h1>
      <div class="header-actions">
        <span id="versionText" class="subtle">Version</span>
        <ui-button id="openSettingsBtn" data-i18n="dashboard.settings">Settings</ui-button>
      </div>
    </header>
    <div class="connection-line" aria-live="polite">
      <span id="statusPill" class="status-pill" data-i18n="common.unknown">Unknown</span>
      <span id="statusText" class="status-line"></span>
      <ui-button id="copyUrlBtn" data-i18n="common.copy_url">Copy URL</ui-button>
    </div>
    <div id="projectContext" class="hint-line project-context"></div>
  `;
}

function noticeMarkup() {
  return `
    <div id="panelNotice" class="panel-notice" role="status" aria-live="polite" hidden>
      <span id="panelNoticeText"></span>
      <ui-button id="dismissNoticeBtn" data-i18n="common.dismiss">Dismiss</ui-button>
    </div>
  `;
}

function pageHeader(titleKey, title, hintKey, hint) {
  return `
    <header class="plain-header">
      <div class="titlebar">
        <h1 data-i18n="${titleKey}">${title}</h1>
        <ui-button id="openDashboardBtn" data-i18n="panel_server">MCP Server</ui-button>
      </div>
      <div class="hint-line" data-i18n="${hintKey}">${hint}</div>
    </header>
  `;
}

function dashboardTemplate() {
  return `
    <div class="mcp-root dashboard">
      ${statusMarkup()}
      <div id="updateStatus" class="update-strip"></div>

      <section class="section service-section">
        <div class="service-heading">
          <label class="checkbox-inline">
            <ui-checkbox id="enabledInput"></ui-checkbox>
            <span data-i18n="dashboard.enable_server">Enable MCP Server</span>
          </label>
          <ui-button id="restartBtn" data-i18n="dashboard.restart">Restart</ui-button>
        </div>
        <div class="service-form">
          <label class="form-row"><span data-i18n="dashboard.server_port">Server Port</span>
            <ui-num-input id="portInput"></ui-num-input>
          </label>
          <div class="port-caption">
            <div id="portHint" class="hint-line"></div>
            <ui-button id="useProjectPortBtn" data-i18n="dashboard.use_project_port">Use Per-Project Port</ui-button>
            <ui-button id="pinCurrentPortBtn" data-i18n="dashboard.pin_current_port">Pin Current Port</ui-button>
          </div>
          <div class="form-row"><span data-i18n="dashboard.tool_exposure">Tool Exposure</span>
            <div class="field-actions">
              <ui-select id="profileSelect">
                <option value="core">core</option>
                <option value="full">full</option>
                <option value="custom">custom</option>
              </ui-select>
              <ui-button id="openToolsBtn" data-i18n="dashboard.edit_tools">Edit Tools</ui-button>
            </div>
          </div>
        </div>
        <div id="toolSummary" class="hint-line"></div>
        <div id="installationNotice" class="compact-warning" hidden></div>
      </section>

      <section class="section client-section">
        <div class="section-heading">
          <div class="section-title" data-i18n="dashboard.client_setup">One-Click MCP Configuration</div>
          <ui-button id="openProjectSkillsBtn" data-i18n="dashboard.project_skills">Project Skills</ui-button>
        </div>
        <div class="client-actions">
          <ui-select id="clientTargetSelect"></ui-select>
          <ui-button id="configureClientBtn" class="configure-action" data-i18n="dashboard.configure_short">Configure</ui-button>
          <ui-button id="configureWithSkillsBtn" class="configure-skills-action" data-i18n="dashboard.configure_skills">Configure + Skills</ui-button>
        </div>
        <div id="configureSkillsHint" class="hint-line setup-hint"></div>
        <div id="clientActionStatus" class="action-status" aria-live="polite" hidden></div>
        <div id="clientTargetStatus" class="connection-status" aria-live="polite"></div>
        <div id="clientTargetDetails" class="hint-line config-location"></div>
        <div id="projectSkillsNotice" class="skills-notice">
          <div id="projectSkillsNoticeText" class="skills-notice-text"></div>
          <ui-button id="openProjectSkillsNoticeBtn" data-i18n="skills_manager.manage">Manage Skills</ui-button>
        </div>
        <details class="preview-details">
          <summary data-i18n="dashboard.preview_config">Preview selected config</summary>
          <ui-textarea id="clientConfigText" class="client-preview"></ui-textarea>
        </details>
      </section>

      <section class="section recent-section">
        <div class="section-heading">
          <div class="section-title" data-i18n="dashboard.recent_activity">Recent Activity</div>
          <div class="header-actions">
            <ui-button id="clearActivityBtn" data-i18n="common.clear">Clear</ui-button>
            <ui-button id="refreshBtn" data-i18n="common.refresh">Refresh</ui-button>
          </div>
        </div>
        <div id="recentCalls" class="mini-list compact-list"></div>
      </section>

    </div>
  `;
}

function toolExposureTemplate() {
  return `
    <div class="mcp-root tool-exposure">
      ${pageHeader('tools.title', 'Tool Exposure', 'tools.hint', 'Choose the tools MCP clients can use. Changes are applied automatically.')}
      <section class="section">
        <label class="form-row"><span data-i18n="dashboard.tool_exposure">Tool Exposure</span>
          <ui-select id="profileSelect">
            <option value="core">core</option>
            <option value="full">full</option>
            <option value="custom">custom</option>
          </ui-select>
        </label>
        <div id="toolSummary" class="hint-line profile-summary"></div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div class="section-title" data-i18n="tools.tools">Tools</div>
          <div class="toolbar compact">
            <ui-button id="selectAllToolsBtn" data-i18n="tools.select_all">Select All</ui-button>
            <ui-button id="clearToolsBtn" data-i18n="common.clear">Clear</ui-button>
            <ui-button id="useDefaultToolsBtn" data-i18n="tools.use_default">Use Default</ui-button>
          </div>
        </div>
        <div id="toolList" class="tool-list"></div>
      </section>

      <section class="section">
        <details>
          <summary data-i18n="tools.named_profiles">Named Profiles</summary>
          <div class="toolbar profile-row">
            <ui-input id="toolProfileNameInput" placeholder="Profile name" data-i18n-placeholder="tools.profile_name"></ui-input>
            <ui-select id="savedToolProfileSelect"></ui-select>
            <ui-button id="saveToolProfileBtn" data-i18n="common.save">Save</ui-button>
            <ui-button id="applyToolProfileBtn" data-i18n="common.apply">Apply</ui-button>
            <ui-button id="deleteToolProfileBtn" data-i18n="common.delete">Delete</ui-button>
            <ui-button id="exportToolProfilesBtn" data-i18n="common.export">Export</ui-button>
            <ui-button id="importToolProfilesBtn" data-i18n="common.import">Import</ui-button>
          </div>
          <ui-textarea id="toolProfileImportText" class="short-textarea"></ui-textarea>
        </details>
      </section>

      <section class="section">
        <details>
          <summary data-i18n="tools.raw_lists">Raw Include / Exclude Lists</summary>
          <div class="tool-config-grid">
            <label><span data-i18n="tools.enabled_categories">Enabled Categories</span> <ui-textarea id="enabledCategoriesInput"></ui-textarea></label>
            <label><span data-i18n="tools.disabled_categories">Disabled Categories</span> <ui-textarea id="disabledCategoriesInput"></ui-textarea></label>
            <label><span data-i18n="tools.enabled_tools">Enabled Tools</span> <ui-textarea id="enabledToolsInput"></ui-textarea></label>
            <label><span data-i18n="tools.disabled_tools">Disabled Tools</span> <ui-textarea id="disabledToolsInput"></ui-textarea></label>
          </div>
        </details>
      </section>

    </div>
  `;
}

function settingsTemplate() {
  return `
    <div class="mcp-root settings">
      ${pageHeader('settings.title', 'MCP Settings', 'settings.hint', 'Interface, connections, safety, and extension management for this project.')}
      <section class="section">
        <div class="section-title" data-i18n="settings.interface">Interface</div>
        <div class="settings-grid">
          <label class="form-row"><span data-i18n="settings.language">Language</span>
            <ui-select id="languageSelect">
              <option value="auto">Auto / 跟随 Cocos Creator</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </ui-select>
          </label>
        </div>
        <div id="languageHint" class="hint-line"></div>
      </section>

      <section class="section">
        <div class="section-title" data-i18n="settings.safety">Safety</div>
        <div class="settings-grid">
          <label class="checkbox-line">
            <ui-checkbox id="javascriptSafetyInput"></ui-checkbox>
            <span data-i18n="settings.javascript_safety">Default JavaScript safety checks</span>
          </label>
        </div>
        <div class="hint-line" data-i18n="settings.javascript_safety_hint">Default for execute_javascript calls when safety_checks is omitted. Explicit safety_checks=false can still bypass this for trusted local calls.</div>
      </section>

      <section class="section">
        <div class="section-title" data-i18n="settings.transport">Transport</div>
        <div class="settings-grid">
          <label class="checkbox-line">
            <ui-checkbox id="sessionsInput"></ui-checkbox>
            <span data-i18n="settings.sessions">MCP Sessions</span>
          </label>
        </div>
        <div class="hint-line" data-i18n="settings.sessions_hint">Direct HTTP is the default. Sessions add MCP-Session-Id handling for clients that require session-aware Streamable HTTP.</div>
      </section>

      <section class="section">
        <div class="section-title" data-i18n="settings.console_logs">Console Logs</div>
        <div class="settings-grid">
          <label class="checkbox-line">
            <ui-checkbox id="consoleLoggingInput"></ui-checkbox>
            <span data-i18n="settings.print_mcp_logs">Print MCP logs</span>
          </label>
        </div>
        <div class="hint-line" data-i18n="settings.print_mcp_logs_hint">Immediately controls MCP messages, warnings, and errors printed to the Cocos console. Recent Activity, internal diagnostics, and project-script logs are unaffected.</div>
      </section>

      <section class="section">
        <div class="section-title" data-i18n="settings.updates">Extension Updates</div>
        <div id="updateStatus" class="update-strip"></div>
        <div class="toolbar">
          <ui-button id="checkUpdatesBtn" data-i18n="dashboard.check_updates">Check Updates</ui-button>
          <ui-button id="openReleaseBtn" data-i18n="dashboard.open_release">Open Release</ui-button>
          <ui-button id="installUpdateBtn" data-i18n="dashboard.install_update">Install Update</ui-button>
        </div>
      </section>

      <section class="section">
        <details>
          <summary data-i18n="installation.title">All Projects</summary>
          <div id="globalInstallStatus" class="inline-status installation-status"></div>
          <div id="globalInstallPath" class="hint-line path-line"></div>
          <div class="toolbar">
            <ui-button id="installGlobalBtn" class="primary" data-i18n="installation.install_all">Install for All Projects</ui-button>
            <ui-button id="copyGlobalPathBtn" data-i18n="installation.copy_path">Copy Global Path</ui-button>
          </div>
          <div class="hint-line" data-i18n="installation.hint">Install one verified copy for this Cocos Creator version so projects opened with it can load the extension automatically.</div>
        </details>
      </section>

      <section class="section">
        <details>
          <summary data-i18n="settings.diagnostics">Diagnostics</summary>
          <div class="toolbar">
            <ui-button id="copyUrlBtn" data-i18n="common.copy_url">Copy URL</ui-button>
            <ui-button id="copyHealthCurlBtn" data-i18n="common.copy_health_curl">Copy Health Curl</ui-button>
            <ui-button id="copyToolsCurlBtn" data-i18n="common.copy_tools_curl">Copy Tools Curl</ui-button>
          </div>
        </details>
      </section>
    </div>
  `;
}

function projectSkillsTemplate() {
  return `
    <div class="mcp-root project-skills">
      ${pageHeader('skills_manager.title', 'Project Skills', 'skills_manager.hint', 'Manage skills for the selected client while preserving local changes.')}
      <section class="section">
        <label class="form-row"><span data-i18n="dashboard.mcp_client">MCP Client</span>
          <ui-select id="skillClientSelect"></ui-select>
        </label>
        <div id="skillClientStatus" class="hint-line path-line"></div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div class="section-title" data-i18n="skills_manager.recommended">Built-in Funplay Skills</div>
          <ui-button id="refreshBtn" data-i18n="common.refresh">Refresh</ui-button>
        </div>
        <div id="builtInSkillList" class="built-in-skill-list"></div>
      </section>

      <section class="section">
        <details class="installed-skills">
          <summary data-i18n="skills_manager.installed">Installed Project Skills</summary>
          <div id="projectSkillList" class="skill-list"></div>
        </details>
      </section>

      <section class="section">
        <details>
          <summary data-i18n="skills_manager.create_custom">Create Custom Skill</summary>
          <div class="create-skill-grid">
            <label><span data-i18n="skills_manager.skill_name">Skill name</span>
              <ui-input id="newSkillNameInput" placeholder="scene-qa" data-i18n-placeholder="skills_manager.skill_name_placeholder"></ui-input>
            </label>
            <label><span data-i18n="skills_manager.skill_title">Title</span>
              <ui-input id="newSkillTitleInput" placeholder="Scene QA" data-i18n-placeholder="skills_manager.skill_title_placeholder"></ui-input>
            </label>
          </div>
          <label class="stacked-field"><span data-i18n="skills_manager.skill_description">Trigger description</span>
            <ui-textarea id="newSkillDescriptionInput" class="short-textarea"></ui-textarea>
          </label>
          <label class="stacked-field"><span data-i18n="skills_manager.skill_instructions">Instructions</span>
            <ui-textarea id="newSkillInstructionsInput" class="skill-instructions"></ui-textarea>
          </label>
          <div class="toolbar">
            <ui-button id="createProjectSkillBtn" class="primary" data-i18n="skills_manager.create">Create Skill</ui-button>
          </div>
        </details>
      </section>

    </div>
  `;
}

function templateForMode(mode) {
  if (mode === 'tool-exposure') return toolExposureTemplate();
  if (mode === 'settings') return settingsTemplate();
  if (mode === 'project-skills') return projectSkillsTemplate();
  return dashboardTemplate();
}

const STYLE = `
  :host {
    position: relative;
    color: var(--color-normal-contrast);
    background: var(--color-normal-fill);
    font-size: 13px;
  }
  .mcp-root {
    height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 18px 20px 24px;
    line-height: 1.5;
    container-type: inline-size;
    container-name: mcp-panel;
  }
  [hidden] { display: none !important; }
  .panel-notice {
    position: absolute;
    z-index: 20;
    left: 16px;
    right: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--color-normal-border);
    border-left: 3px solid #65cd89;
    border-radius: 6px;
    background: var(--color-normal-fill-emphasis, #303030);
    box-shadow: 0 4px 18px rgba(0,0,0,0.25);
  }
  #panelNoticeText { flex: 1; min-width: 0; max-height: 120px; overflow: auto; overflow-wrap: anywhere; }
  .panel-notice.error { border-left-color: #ed9191; }
  .panel-notice ui-button { flex-shrink: 0; }
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }
  h1 {
    margin: 0;
    font-size: 21px;
    letter-spacing: -0.3px;
    line-height: 1.25;
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
  .plain-header { margin-bottom: 18px; }
  .plain-header .titlebar { margin-bottom: 8px; }
  .plain-header h1 { font-size: 21px; }
  .hint-line { font-size: 12px; line-height: 1.5; }
  .plain-header .hint-line { max-width: 65ch; }
  .mcp-root ui-button { min-height: 28px; padding: 0 10px; flex-shrink: 0; }
  .mcp-root ui-button[disabled] { opacity: 0.45; }
  .mcp-root ui-select, .mcp-root ui-input, .mcp-root ui-num-input { min-width: 0; width: 100%; }
  .mcp-root ui-button.primary { background: #376f9e; border-color: #4c85b5; color: #fff; }
  .mcp-root ui-button.primary:hover { background: #417eae; }
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
    border: 0;
    border-top: 1px solid var(--color-normal-border);
    border-radius: 0;
    background: transparent;
    padding: 18px 0 0;
    margin: 18px 0 0;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .section-title {
    font-size: 14px;
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .settings-grid { grid-template-columns: 1fr; margin: 8px 0; }
  .profile-summary { margin-top: 9px; }
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
    border: 0;
    border-radius: 0;
    padding: 0 4px 0 0;
    background: transparent;
  }
  .tool-group {
    margin-bottom: 12px;
    padding: 10px 12px;
    background: rgba(0,0,0,0.10);
    border-radius: 6px;
  }
  .tool-group:last-child {
    margin-bottom: 0;
  }
  .tool-group summary {
    min-height: 24px;
    font-size: 13px;
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
    padding: 8px 4px 8px 15px;
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
    font-size: 12px;
    line-height: 1.5;
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
    grid-template-columns: max-content minmax(0, 1fr) auto;
    column-gap: 9px;
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
    min-width: 0;
    color: var(--color-normal-contrast);
    font-weight: 600;
    overflow-wrap: anywhere;
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
    padding: 3px 0;
    cursor: pointer;
    font-weight: 700;
    color: var(--color-normal-contrast);
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
  .installation-status.warning {
    color: #d99b2b;
  }
  .installation-status.error {
    color: #e86f6f;
  }
  .skills-notice {
    display: none;
    align-items: flex-start;
    gap: 10px;
    margin-top: 8px;
    border-left: 3px solid #d28a2d;
    border-radius: 5px;
    padding: 7px 8px;
    background: rgba(210,138,45,0.12);
    color: var(--color-normal-contrast);
  }
  .skills-notice.visible {
    display: flex;
  }
  .skills-notice.modified {
    border-left-color: #4a91cf;
    background: rgba(74,145,207,0.12);
  }
  .skills-notice-text {
    flex: 1;
    min-width: 0;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .skill-status-pill {
    border-radius: 4px;
    padding: 3px 8px;
    background: #666;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .skill-status-pill.current {
    background: rgba(65,150,95,0.18);
    color: #78d197;
  }
  .skill-status-pill.update-available {
    background: #b67623;
  }
  .skill-status-pill.modified {
    background: #397aa9;
  }
  .skill-status-pill.missing {
    background: #777;
  }
  .built-in-skill-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .built-in-skill-card {
    border: 0;
    border-radius: 6px;
    padding: 15px;
    background: rgba(0,0,0,0.12);
  }
  .built-in-skill-card .inline-status { margin-top: 10px; font-size: 12px; }
  .built-in-skill-card .toolbar { margin-top: 12px; }
  .skill-file-details { margin-top: 12px; font-size: 12px; }
  .skill-file-details summary { font-weight: 400; color: var(--color-normal-contrast-weakest); }
  .installed-skills .skill-list { margin-top: 12px; }
  .built-in-skill-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .built-in-skill-title {
    font-size: 14px;
    color: var(--color-normal-contrast);
    font-weight: 700;
    word-break: break-word;
  }
  .built-in-skill-description {
    margin-top: 4px;
    color: var(--color-normal-contrast-weak);
    font-size: 12px;
    line-height: 1.5;
    word-break: break-word;
  }
  .skill-backup-line {
    margin-top: 7px;
  }
  .skill-diff-details {
    margin-top: 9px;
  }
  pre.skill-diff {
    min-height: 160px;
    max-height: 420px;
    color: #d9e7ff;
  }
  .skill-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .skill-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--color-normal-border);
    border-radius: 5px;
    padding: 8px;
    background: rgba(0,0,0,0.10);
  }
  .skill-card-title {
    color: var(--color-normal-contrast);
    font-weight: 700;
    word-break: break-word;
  }
  .skill-card-description,
  .skill-card-meta {
    margin-top: 3px;
    color: var(--color-normal-contrast-weakest);
    font-size: 11px;
    word-break: break-word;
  }
  .skill-format-warning {
    color: #d99b2b;
  }
  .create-skill-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .stacked-field {
    margin-top: 8px;
  }
  .skill-instructions {
    min-height: 130px;
  }
  .path-line {
    margin: 5px 0 8px 0;
    word-break: break-all;
  }
  /* The dashboard is a compact editor tool, with one visual level per task. */
  .dashboard {
    padding: 16px;
    line-height: 1.45;
    container-type: inline-size;
    container-name: mcp-dashboard;
  }
  .dashboard [hidden] { display: none !important; }
  .dashboard h1 { font-size: 21px; letter-spacing: -0.3px; }
  .header-actions, .service-heading, .field-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-actions { flex-shrink: 0; }
  .dashboard .titlebar { margin-bottom: 12px; }
  .dashboard ui-button { min-height: 26px; padding: 0 9px; flex-shrink: 0; }
  .dashboard ui-select, .dashboard ui-num-input { min-width: 0; width: 100%; }
  .connection-line { display: flex; align-items: center; gap: 8px; }
  .dashboard .status-pill {
    min-width: 0;
    padding: 0;
    border-radius: 0;
    background: transparent;
    white-space: nowrap;
    font-size: 13px;
  }
  .dashboard .status-pill::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    margin-right: 6px;
    vertical-align: 1px;
  }
  .dashboard .status-pill.running { color: #65cd89; }
  .dashboard .status-pill.stopped { color: #ed9191; }
  .dashboard .status-line {
    flex: 1;
    min-width: 0;
    margin: 0;
    min-height: 0;
    font-size: 12px;
    overflow-wrap: anywhere;
    color: var(--color-normal-contrast);
  }
  .project-context { margin-top: 5px; overflow-wrap: anywhere; }
  .dashboard .hint-line { font-size: 12px; line-height: 1.5; }
  .dashboard .section {
    background: transparent;
    border: 0;
    border-top: 1px solid var(--color-normal-border);
    border-radius: 0;
    padding: 15px 0 0;
    margin: 15px 0 0;
  }
  .dashboard .section-title { font-size: 14px; }
  .dashboard .section-heading { margin-bottom: 10px; }
  .service-heading { justify-content: space-between; margin-bottom: 10px; }
  .service-heading .checkbox-inline { gap: 7px; }
  .service-form { display: grid; gap: 8px; }
  .form-row {
    display: grid;
    grid-template-columns: 102px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    color: var(--color-normal-contrast-weak);
  }
  .field-actions { min-width: 0; }
  .field-actions ui-select { flex: 1; }
  .port-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 4px; }
  .port-caption .hint-line { flex: 1; min-width: 160px; }
  .dashboard #toolSummary { margin-top: 7px; }
  .client-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .client-actions ui-select { grid-column: 1 / -1; }
  .client-actions ui-button { min-height: 32px; font-size: 13px; text-align: center; }
  .dashboard ui-button.configure-action { background: #307d4d; border-color: #418c5e; color: #fff; }
  .dashboard ui-button.configure-skills-action { background: #376f9e; border-color: #4c85b5; color: #fff; }
  .dashboard ui-button.configure-action:hover { background: #388858; }
  .dashboard ui-button.configure-skills-action:hover { background: #417eae; }
  .dashboard ui-button[disabled] { opacity: 0.45; }
  .setup-hint { margin: 7px 0 10px; }
  .connection-status { color: var(--color-normal-contrast-weak); font-weight: 600; }
  .connection-status.configured, .action-status.success { color: #65cd89; }
  .connection-status.blocked, .action-status.warning { color: #e1af61; }
  .action-status.error { color: #ed9191; }
  .action-status { margin: 8px 0; font-size: 12px; overflow-wrap: anywhere; }
  .config-location { margin-top: 3px; white-space: pre-line; overflow-wrap: anywhere; }
  .dashboard .preview-details { margin-top: 10px; font-size: 12px; }
  .compact-warning { color: #e1af61; font-size: 12px; margin-top: 8px; }
  .dashboard .skills-notice { margin-top: 10px; padding: 9px 10px; font-size: 12px; }
  .dashboard .compact-list { min-height: 170px; max-height: 400px; padding: 8px; }
  .dashboard .mini-item { padding: 10px; margin-bottom: 8px; }
  .dashboard .mini-title { font-size: 13px; }
  .dashboard .mini-body { margin-top: 8px; font-size: 12px; }
  .activity-result {
    padding: 10px 12px;
    margin-top: 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.22);
    font-size: 12px;
  }
  .dashboard .activity-result .mini-body { margin: 0 0 8px; font-weight: 600; }
  .activity-result .result-error { color: #ed9191; }
  .execution-meta { color: var(--color-normal-contrast-weakest); font-size: 11px; margin-bottom: 8px; }
  .result-section-title { color: var(--color-normal-contrast); font-weight: 600; margin: 10px 0 5px; }
  .result-fields { display: grid; gap: 4px; min-width: 0; }
  .result-row { display: grid; grid-template-columns: minmax(75px, 32%) minmax(0, 1fr); gap: 10px; }
  .result-key, .result-branch > summary, .result-array li::marker, .execution-logs li::marker { color: #80b6dd; }
  .result-key, .result-value, .result-branch > summary { overflow-wrap: anywhere; }
  .result-value { white-space: pre-wrap; min-width: 0; }
  .result-value.boolean-true { color: #75cd93; }
  .result-value.boolean-false { color: #e39b9b; }
  .result-empty, .result-omitted { color: var(--color-normal-contrast-weakest); }
  .result-branch { min-width: 0; }
  .result-branch > summary { font-weight: 500; }
  .result-branch > .result-fields, .result-branch > .result-array { margin-left: 10px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.12); }
  .result-branch > .result-array { padding-left: 24px; }
  .result-array, .execution-logs { margin: 4px 0; padding-left: 24px; }
  .result-array > li, .execution-logs > li { list-style: decimal outside; padding-left: 2px; margin: 5px 0; }
  .execution-log { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 8px; }
  .execution-level { color: #80b6dd; font-size: 10px; padding-top: 2px; }
  .execution-level.warn { color: #e1af61; }
  .execution-level.error { color: #ed9191; }
  .execution-message { white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
  .result-details { margin-top: 8px; font-size: 11px; }
  .result-details summary { font-weight: 400; color: var(--color-normal-contrast-weakest); }
  .result-details pre { min-height: 0; max-height: 240px; font-size: 11px; color: var(--color-normal-contrast); }
  @container mcp-dashboard (min-width: 520px) {
    .dashboard .client-actions { grid-template-columns: minmax(120px, 1fr) auto auto; }
    .dashboard .client-actions ui-select { grid-column: auto; }
  }
  @container mcp-dashboard (max-width: 340px) {
    .dashboard .titlebar { gap: 8px; }
    .dashboard h1 { font-size: 19px; }
    .dashboard .header-actions { gap: 5px; }
    .form-row { grid-template-columns: 85px minmax(0, 1fr); gap: 8px; }
    .dashboard .skills-notice { flex-wrap: wrap; }
    .dashboard .skills-notice-text { flex-basis: 100%; }
  }
  @container mcp-panel (max-width: 500px) {
    .summary-grid,
    .service-grid,
    .settings-grid,
    .tool-config-grid,
    .category-controls,
    .create-skill-grid {
      grid-template-columns: 1fr;
    }
    .category-row { grid-template-columns: 1fr; }
    .built-in-skill-heading { flex-wrap: wrap; }
    .profile-row ui-input, .profile-row ui-select { flex: 1 1 100%; }
    .plain-header .titlebar { gap: 10px; }
    .plain-header h1 { font-size: 19px; }
  }
`;

const SELECTORS = {
  recentCalls: '#recentCalls',
  clearActivityBtn: '#clearActivityBtn',
  panelNotice: '#panelNotice',
  panelNoticeText: '#panelNoticeText',
  dismissNoticeBtn: '#dismissNoticeBtn',
  statusPill: '#statusPill',
  versionText: '#versionText',
  statusText: '#statusText',
  projectContext: '#projectContext',
  portHint: '#portHint',
  installationNotice: '#installationNotice',
  endpointMetric: '#endpointMetric',
  projectMetric: '#projectMetric',
  toolMetric: '#toolMetric',
  updateStatus: '#updateStatus',
  enabledInput: '#enabledInput',
  portInput: '#portInput',
  profileSelect: '#profileSelect',
  sessionsInput: '#sessionsInput',
  consoleLoggingInput: '#consoleLoggingInput',
  javascriptSafetyInput: '#javascriptSafetyInput',
  languageSelect: '#languageSelect',
  languageHint: '#languageHint',
  restartBtn: '#restartBtn',
  copyUrlBtn: '#copyUrlBtn',
  copyHealthCurlBtn: '#copyHealthCurlBtn',
  copyToolsCurlBtn: '#copyToolsCurlBtn',
  checkUpdatesBtn: '#checkUpdatesBtn',
  openReleaseBtn: '#openReleaseBtn',
  installUpdateBtn: '#installUpdateBtn',
  installGlobalBtn: '#installGlobalBtn',
  copyGlobalPathBtn: '#copyGlobalPathBtn',
  globalInstallStatus: '#globalInstallStatus',
  globalInstallPath: '#globalInstallPath',
  projectSkillsNotice: '#projectSkillsNotice',
  skillClientSelect: '#skillClientSelect',
  skillClientStatus: '#skillClientStatus',
  useProjectPortBtn: '#useProjectPortBtn',
  pinCurrentPortBtn: '#pinCurrentPortBtn',
  projectSkillsNoticeText: '#projectSkillsNoticeText',
  openToolsBtn: '#openToolsBtn',
  openSettingsBtn: '#openSettingsBtn',
  openProjectSkillsBtn: '#openProjectSkillsBtn',
  openProjectSkillsNoticeBtn: '#openProjectSkillsNoticeBtn',
  openDashboardBtn: '#openDashboardBtn',
  refreshBtn: '#refreshBtn',
  clientTargetSelect: '#clientTargetSelect',
  configureClientBtn: '#configureClientBtn',
  configureWithSkillsBtn: '#configureWithSkillsBtn',
  configureSkillsHint: '#configureSkillsHint',
  clientActionStatus: '#clientActionStatus',
  clientTargetStatus: '#clientTargetStatus',
  clientTargetDetails: '#clientTargetDetails',
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
  builtInSkillList: '#builtInSkillList',
  projectSkillList: '#projectSkillList',
  newSkillNameInput: '#newSkillNameInput',
  newSkillTitleInput: '#newSkillTitleInput',
  newSkillDescriptionInput: '#newSkillDescriptionInput',
  newSkillInstructionsInput: '#newSkillInstructionsInput',
  createProjectSkillBtn: '#createProjectSkillBtn',
};

function createPanel(mode) {
  return Editor.Panel.define({
    template: templateForMode(mode) + noticeMarkup(),
    style: STYLE,
    $: SELECTORS,
    methods: createMethods(mode),
    ready() {
      this.mode = mode;
      this.state = null;
      this.skillDiffs = {};
      this.detectedLanguage = detectEditorLanguage(global.Editor);
      this.language = resolveLanguage('auto', this.detectedLanguage);
      this.applyStaticTranslations();
      this.bindEvents();
      this.refresh()
        .then(() => {
          if (mode === 'dashboard' || mode === 'settings') {
            return this.autoCheckUpdates();
          }
          return null;
        })
        .catch((error) => this.showNotice(this.t('errors.refresh_failed', { error: error.message }), 'error'));
    },
    close() { this.dismissNotice(); },
  });
}

function createMethods(mode) {
  return {
    async refresh() {
      try {
        this.state = await request('get-panel-state');
        this.renderState();
      } catch (error) {
        this.showNotice(this.t('errors.refresh_failed', { error: error.message }), 'error');
        throw error;
      }
    },
    t(key, replacements) {
      return translate(DICTIONARIES, this.language || 'en', key, replacements);
    },
    getPanelRoot() {
      const anchor = Object.values(this.$ || {}).find((element) => (
        element && typeof element.getRootNode === 'function'
      ));
      if (anchor) {
        return anchor.getRootNode();
      }
      if (this.shadowRoot) {
        return this.shadowRoot;
      }
      return typeof document !== 'undefined' ? document : null;
    },
    applyStaticTranslations() {
      const root = this.getPanelRoot();
      if (!root || typeof root.querySelectorAll !== 'function') {
        return;
      }
      root.querySelectorAll('[data-i18n]').forEach((element) => {
        element.textContent = this.t(element.dataset.i18n);
      });
      root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        element.setAttribute('placeholder', this.t(element.dataset.i18nPlaceholder));
      });
      const panelRoot = root.querySelector('.mcp-root');
      if (panelRoot) {
        panelRoot.setAttribute('lang', this.language || 'en');
      }
    },
    syncLanguage() {
      const state = this.state || {};
      const config = state.config || {};
      const localization = state.localization || {};
      this.detectedLanguage = localization.detectedLanguage || detectEditorLanguage(global.Editor);
      this.language = resolveLanguage(config.language, this.detectedLanguage);
      this.applyStaticTranslations();
      this.setControlValue('languageSelect', config.language || 'auto');
      if (this.$.languageHint) {
        const languageName = this.t(`settings.language_name_${this.language}`);
        const key = (config.language || 'auto') === 'auto'
          ? 'settings.language_auto_hint'
          : 'settings.language_override_hint';
        this.$.languageHint.textContent = this.t(key, { language: languageName });
      }
    },
    renderState() {
      const state = this.state || {};
      const status = state.status || {};
      const config = state.config || {};
      const isRunning = Boolean(status.running);

      this.syncLanguage();
      this.setText('versionText', `v${status.version || 'unknown'}`);
      if (this.$.statusPill) {
        this.$.statusPill.textContent = isRunning ? this.t('dashboard.running') : this.t('dashboard.stopped');
        this.$.statusPill.classList.toggle('running', isRunning);
        this.$.statusPill.classList.toggle('stopped', !isRunning);
      }

      const portText = status.portFallbackActive
        ? ` | ${this.t('dashboard.port_fallback', { requested: status.requestedPort, actual: status.port })}`
        : '';
      const attachText = status.attachedToExisting ? ` | ${this.t('dashboard.attached_listener')}` : '';
      this.setText('statusText', status.url || '—');
      this.setText('projectContext', `${status.projectName || ''} · Cocos ${status.cocosVersion || ''}${attachText}`);
      this.setText('portHint', status.portFallbackActive ? portText.replace(/^ \| /, '')
        : this.t(config.portMode === 'project' ? 'dashboard.derived_port_hint' : 'dashboard.fixed_port_hint', { port: status.derivedPort || config.port }));
      this.setHidden(this.$.useProjectPortBtn, config.portMode === 'project' && !status.portFallbackActive);
      this.setHidden(this.$.pinCurrentPortBtn, config.portMode !== 'project' && !status.portFallbackActive);

      this.setText('endpointMetric', status.url || '-');
      this.setText('projectMetric', status.projectName || '-');
      const catalog = state.toolCatalog || [];
      const enabled = catalog.filter((tool) => tool.enabled);
      this.setText('toolMetric', `${enabled.length}/${catalog.length}`);

      this.setControlValue('enabledInput', Boolean(isRunning || config.autostart));
      this.setControlValue('portInput', Number(config.port || status.port || 8765));
      this.setControlValue('profileSelect', config.toolProfile || status.toolProfile || 'core');
      this.setControlValue('sessionsInput', Boolean(config.enableSessions || status.enableSessions));
      this.setControlValue('consoleLoggingInput', config.enableConsoleLogging !== false);
      this.setControlValue('javascriptSafetyInput', config.executeJavascriptSafetyChecks !== false);
      this.setControlValue('enabledCategoriesInput', this.formatList(config.enabledToolCategories));
      this.setControlValue('disabledCategoriesInput', this.formatList(config.disabledToolCategories));
      this.setControlValue('enabledToolsInput', this.formatList(config.enabledTools));
      this.setControlValue('disabledToolsInput', this.formatList(config.disabledTools));

      this.renderUpdateStatus();
      this.renderInstallationStatus();
      this.renderProjectSkillsNotice();
      this.renderProjectSkills();
      this.renderToolSummary();
      this.renderActivity();
      this.renderToolProfiles();
      this.renderCategoryControls();
      this.renderToolList();
      this.renderClientTargets();
    },
    setText(key, value) {
      if (this.$[key]) {
        this.$[key].textContent = value;
      }
    },
    setHidden(element, hidden) {
      if (element) element.hidden = Boolean(hidden);
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
          ? this.t('updates.reload_scheduled', { delay: install.reload.delayMs })
          : this.t('updates.reload_not_scheduled', {
            reason: install.reload && install.reload.reason || this.t('common.unknown'),
          });
        this.$.updateStatus.textContent = this.t('updates.installed', {
          version: install.installedVersion,
          reload,
          backup: install.backupDir,
        });
        this.$.updateStatus.classList.add('status');
        return;
      }
      if (!update) {
        this.$.updateStatus.textContent = '';
        return;
      }
      if (!update.ok) {
        this.$.updateStatus.textContent = this.t('updates.check_failed', { error: update.error });
        this.$.updateStatus.classList.add('error');
        return;
      }
      const published = update.publishedAt
        ? this.t('updates.published', { date: update.publishedAt.slice(0, 10) })
        : '';
      this.$.updateStatus.textContent = update.updateAvailable
        ? this.t('updates.available', {
          version: update.latestVersion,
          published,
          status: update.downloadAvailable ? this.t('updates.ready') : this.t('updates.incomplete'),
        })
        : '';
      if (update.updateAvailable) {
        this.$.updateStatus.classList.add('has-update');
      }
    },
    renderInstallationStatus() {
      const installation = this.state && this.state.installation;
      if (this.$.installationNotice) {
        const problem = installation && (installation.globalInstallError || installation.duplicateInstall);
        this.setHidden(this.$.installationNotice, !problem);
        this.$.installationNotice.textContent = problem
          ? this.t(installation.globalInstallError ? 'installation.short_error' : 'installation.short_duplicate') : '';
      }
      if (!installation) {
        this.setDisabled(this.$.installGlobalBtn, true);
        return;
      }

      const actionKey = installation.action === 'update'
        ? 'installation.update_global'
        : installation.globalInstalled
          ? 'installation.installed_all'
          : 'installation.install_all';
      if (this.$.installGlobalBtn) {
        this.$.installGlobalBtn.textContent = this.t(actionKey);
      }
      this.setDisabled(this.$.installGlobalBtn, !installation.canInstallGlobally);

      if (this.$.globalInstallPath) {
        this.$.globalInstallPath.textContent = this.t('installation.path', {
          path: installation.globalPackagePath || '',
        });
      }

      if (!this.$.globalInstallStatus) {
        return;
      }
      this.$.globalInstallStatus.classList.remove('warning', 'error');
      const scope = this.t(`installation.scope_${installation.scope || 'external'}`);
      let status = this.t('installation.current_scope', { scope });
      if (installation.globalInstallError) {
        status += ` ${this.t('installation.global_invalid', {
          error: installation.globalInstallError,
        })}`;
        this.$.globalInstallStatus.classList.add('error');
      } else if (installation.globalInstalled) {
        status += ` ${this.t('installation.global_ready', {
          version: installation.globalVersion || this.t('common.unknown'),
          editorVersion: installation.editorVersion || this.t('common.unknown'),
        })}`;
      } else {
        status += ` ${this.t('installation.global_missing')}`;
      }
      if (installation.duplicateInstall) {
        status += ` ${this.t('installation.duplicate', {
          path: installation.projectPackagePath || '',
        })}`;
        this.$.globalInstallStatus.classList.add('warning');
      }

      const installInfo = this.state && this.state.globalInstallInfo;
      if (installInfo && installInfo.installed && installInfo.restartRequired) {
        status += ` ${this.t('installation.restart_required')}`;
      }
      this.$.globalInstallStatus.textContent = status;
    },
    selectedSkillClientId() {
      return this.$.skillClientSelect && this.$.skillClientSelect.value
        || this.$.clientTargetSelect && this.$.clientTargetSelect.value
        || this.state && this.state.config && this.state.config.lastClientTargetId || 'codex';
    },
    selectedProjectSkills() {
      const id = this.selectedSkillClientId();
      const state = this.state || {};
      return state.projectSkillsByClient && state.projectSkillsByClient[id]
        || (state.projectSkills && state.projectSkills.clientId === id ? state.projectSkills : { clientId: id, supported: false, builtIns: [], skills: [], platforms: state.projectSkills && state.projectSkills.platforms || [] });
    },
    renderProjectSkillsNotice() {
      if (!this.$.projectSkillsNotice || !this.$.projectSkillsNoticeText) {
        return;
      }
      const projectSkills = this.selectedProjectSkills();
      const builtIns = projectSkills && Array.isArray(projectSkills.builtIns)
        ? projectSkills.builtIns
        : projectSkills && projectSkills.official
          ? [projectSkills.official]
          : [];
      const attention = builtIns.filter((skill) => skill.status !== 'current');
      this.$.projectSkillsNotice.classList.remove('visible', 'missing', 'update', 'modified');
      if (projectSkills.error) {
        this.$.projectSkillsNoticeText.textContent = `${projectSkills.clientName || projectSkills.clientId}\n${this.t('skills_manager.read_error', { error: projectSkills.error })}`;
        this.$.projectSkillsNotice.classList.add('visible', 'modified');
        return;
      }
      if (!attention.length) {
        this.$.projectSkillsNoticeText.textContent = '';
        return;
      }

      const notices = [
        ['missing', 'skills_manager.notice_missing_list'],
        ['update-available', 'skills_manager.notice_update_list'],
        ['modified', 'skills_manager.notice_modified_list'],
      ].map(([status, key]) => {
        const skills = attention.filter((skill) => skill.status === status);
        if (!skills.length) {
          return '';
        }
        return this.t(key, {
          count: skills.length,
          names: skills.map((skill) => skill.title || skill.skillName).join(', '),
        });
      }).filter(Boolean);

      this.$.projectSkillsNoticeText.textContent = `${projectSkills.clientName || projectSkills.clientId}\n${notices.join('\n')}`;
      this.$.projectSkillsNotice.classList.add('visible');
      if (attention.some((skill) => skill.status === 'modified')) {
        this.$.projectSkillsNotice.classList.add('modified');
      } else if (attention.some((skill) => skill.status === 'update-available')) {
        this.$.projectSkillsNotice.classList.add('update');
      } else {
        this.$.projectSkillsNotice.classList.add('missing');
      }
    },
    renderProjectSkills() {
      if (!this.$.builtInSkillList && !this.$.projectSkillList) {
        return;
      }
      if (this.$.skillClientSelect) {
        const selected = this.selectedSkillClientId();
        const targets = this.state && this.state.clientTargets || [];
        this.$.skillClientSelect.innerHTML = targets.map((target) => `<option value="${target.id}">${target.name}</option>`).join('');
        this.$.skillClientSelect.value = selected;
      }
      const projectSkills = this.selectedProjectSkills();
      if (this.$.skillClientStatus) this.$.skillClientStatus.textContent = projectSkills.error
        ? this.t('skills_manager.read_error', { error: projectSkills.error })
        : projectSkills.supported
          ? `${projectSkills.clientName}: ${projectSkills.skillRoot}` : this.t('skills_manager.unsupported');
      this.setDisabled(this.$.createProjectSkillBtn, !projectSkills.supported || Boolean(projectSkills.error));
      const builtIns = projectSkills && Array.isArray(projectSkills.builtIns)
        ? projectSkills.builtIns
        : projectSkills && projectSkills.official
          ? [projectSkills.official]
          : [];

      if (this.$.builtInSkillList) {
        this.$.builtInSkillList.innerHTML = '';
        if (!builtIns.length) {
          this.$.builtInSkillList.textContent = this.t('skills_manager.no_built_in_skills');
        } else {
          const builtInFragment = document.createDocumentFragment();
          builtIns.forEach((skill) => {
            const card = document.createElement('article');
            card.className = 'built-in-skill-card';
            card.dataset.skillName = skill.skillName;

            const heading = document.createElement('div');
            heading.className = 'built-in-skill-heading';
            const headingMain = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'built-in-skill-title';
            title.textContent = skill.title || skill.skillName;
            headingMain.appendChild(title);
            const description = document.createElement('div');
            description.className = 'built-in-skill-description';
            description.textContent = skill.description || '';
            headingMain.appendChild(description);
            heading.appendChild(headingMain);

            const normalizedStatus = String(skill.status || 'missing').replace(/-/g, '_');
            const status = document.createElement('div');
            status.className = `skill-status-pill ${skill.status || 'missing'}`;
            status.textContent = this.t(`skills_manager.status_${normalizedStatus}`);
            heading.appendChild(status);
            card.appendChild(heading);

            const detail = document.createElement('div');
            detail.className = 'inline-status';
            detail.textContent = this.t(`skills_manager.detail_${normalizedStatus}`, {
              installed: skill.installedTemplateVersion || this.t('common.unknown'),
              latest: skill.templateVersion || this.t('common.unknown'),
            });
            card.appendChild(detail);

            const pathLine = document.createElement('div');
            pathLine.className = 'hint-line path-line';
            pathLine.textContent = this.t('skills_manager.path', { path: skill.path || '' })
              + (skill.legacyPath ? `\n${this.t('skills_manager.legacy_path', { path: skill.legacyPath })}` : '');
            const fileDetails = document.createElement('details');
            fileDetails.className = 'skill-file-details';
            const fileSummary = document.createElement('summary');
            fileSummary.textContent = this.t('skills_manager.file_details');
            fileDetails.appendChild(fileSummary);
            fileDetails.appendChild(pathLine);

            const toolbar = document.createElement('div');
            toolbar.className = 'toolbar';
            const actionKey = skill.status === 'missing'
              ? 'skills_manager.install'
              : skill.status === 'current'
                ? 'skills_manager.current_action'
                : 'skills_manager.update';
            const actions = [
              { action: 'install', label: actionKey, disabled: skill.status === 'current', primary: true },
              { action: 'preview', label: 'skills_manager.view_changes', disabled: skill.status === 'current' },
              { action: 'restore', label: 'skills_manager.restore_backup', disabled: skill.backupCount < 1 },
              { action: 'reveal', label: 'skills_manager.reveal', disabled: !skill.installed || Boolean(skill.legacyPath) },
            ];
            actions.filter((item) => !item.disabled).forEach((item) => {
              const button = document.createElement('ui-button');
              button.textContent = this.t(item.label);
              button.dataset.skillAction = item.action;
              button.dataset.skillName = skill.skillName;
              if (item.primary) {
                button.classList.add('primary');
              }
              this.setDisabled(button, item.disabled);
              toolbar.appendChild(button);
            });
            card.appendChild(toolbar);

            const backup = document.createElement('div');
            backup.className = 'hint-line skill-backup-line';
            backup.textContent = skill.latestBackup
              ? this.t('skills_manager.latest_backup', {
                count: skill.backupCount,
                path: skill.latestBackup.path,
              })
              : this.t('skills_manager.no_backup');
            fileDetails.appendChild(backup);
            card.appendChild(fileDetails);

            const details = document.createElement('details');
            details.className = 'skill-diff-details';
            const summary = document.createElement('summary');
            summary.textContent = this.t('skills_manager.diff_preview');
            details.appendChild(summary);
            const diff = document.createElement('pre');
            diff.className = 'skill-diff';
            diff.textContent = this.skillDiffs && this.skillDiffs[`${this.selectedSkillClientId()}:${skill.skillName}`] || '';
            details.appendChild(diff);
            details.open = Boolean(diff.textContent);
            if (diff.textContent) card.appendChild(details);

            builtInFragment.appendChild(card);
          });
          this.$.builtInSkillList.appendChild(builtInFragment);
        }
      }

      if (!this.$.projectSkillList) {
        return;
      }
      const skills = projectSkills.skills || [];
      this.$.projectSkillList.innerHTML = '';
      if (!skills.length) {
        this.$.projectSkillList.textContent = this.t('skills_manager.no_skills');
        return;
      }
      const fragment = document.createDocumentFragment();
      skills.forEach((skill) => {
        const card = document.createElement('div');
        card.className = 'skill-card';

        const main = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'skill-card-title';
        title.textContent = `${skill.title || skill.name || this.t('common.unknown')}` +
          (skill.builtIn || skill.official ? ` · ${this.t('skills_manager.official_badge')}` : '');
        main.appendChild(title);

        if (skill.description) {
          const description = document.createElement('div');
          description.className = 'skill-card-description';
          description.textContent = skill.description;
          main.appendChild(description);
        }
        const meta = document.createElement('div');
        meta.className = `skill-card-meta${skill.valid ? '' : ' skill-format-warning'}`;
        meta.textContent = skill.valid
          ? skill.path
          : `${skill.path} · ${this.t('skills_manager.invalid_format')}`;
        main.appendChild(meta);
        card.appendChild(main);

        const revealButton = document.createElement('ui-button');
        revealButton.textContent = this.t('skills_manager.reveal');
        revealButton.dataset.skillPath = skill.path;
        card.appendChild(revealButton);
        fragment.appendChild(card);
      });
      this.$.projectSkillList.appendChild(fragment);
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
      const profileLabel = this.t(`tools.profile_${profile}`);
      const savedName = config.activeToolProfileName
        ? ` | ${this.t('tools.saved_profile', { name: config.activeToolProfileName })}`
        : '';
      if (mode === 'dashboard') {
        const hint = profile === 'full'
          ? this.t('tools.full_hint')
          : profile === 'custom'
            ? this.t('tools.custom_hint')
            : this.t('tools.core_hint');
        this.$.toolSummary.textContent = this.t('tools.dashboard_summary', {
          profile: profileLabel,
          saved: savedName,
          enabled: enabled.length,
          total: catalog.length,
          hint,
        });
        return;
      }
      const hasOverrides = Boolean(
        (config.enabledTools && config.enabledTools.length) ||
        (config.disabledTools && config.disabledTools.length) ||
        (config.enabledToolCategories && config.enabledToolCategories.length) ||
        (config.disabledToolCategories && config.disabledToolCategories.length)
      );
      const source = hasOverrides ? this.t('tools.with_overrides') : this.t('tools.default_list');
      this.$.toolSummary.textContent = this.t('tools.exposure_summary', {
        profile: profileLabel,
        saved: savedName,
        enabled: enabled.length,
        total: catalog.length,
        source,
      });
    },
    normalizeToolProfile(profile) {
      const name = String(profile && profile.name || '').trim();
      if (!name) {
        throw new Error(this.t('tools.profile_name_required'));
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
        option.textContent = this.t('tools.no_saved_profiles');
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
          ['enable', this.t('common.enable')],
          ['disable', this.t('common.disable')],
          ['clear', this.t('common.clear')],
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
          ['enable', this.t('common.select')],
          ['disable', this.t('common.clear')],
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
            description.textContent = localizeToolDescription(tool, this.language);
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
        this.$.clientTargetStatus.textContent = this.t('client.no_targets');
        return;
      }
      const configured = target.configured ? this.t('client.configured') : this.t('client.not_configured');
      const blocked = this.state && this.state.clientConfig && this.state.clientConfig.configurationBlocked;
      const skills = this.selectedProjectSkills();
      const busy = Boolean(this.configuringClient);
      this.setDisabled(this.$.clientTargetSelect, busy);
      this.setDisabled(this.$.configureClientBtn, blocked || busy);
      this.setDisabled(this.$.configureWithSkillsBtn, blocked || busy || !skills.supported || Boolean(skills.error));
      this.setText('configureSkillsHint', skills.error ? this.t('skills_manager.read_error', { error: skills.error })
        : this.t(skills.supported ? 'client.skills_setup_hint' : 'skills_manager.unsupported'));
      this.$.clientTargetStatus.classList.remove('configured', 'blocked', 'unconfigured');
      this.$.clientTargetStatus.classList.add(blocked ? 'blocked' : target.configured ? 'configured' : 'unconfigured');
      this.$.clientTargetStatus.textContent = blocked ? this.t('client.fallback_blocked') : `${this.t('client.status')}: ${configured}`;
      this.setText('clientTargetDetails', `${target.configPath}\n${target.serverName || ''} → ${this.state && this.state.clientConfig && this.state.clientConfig.url || ''}`);
      this.renderProjectSkillsNotice();
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
          id: `${entry.timestamp}:${entry.toolName}`,
          title: entry.toolName || this.t('activity.tool_fallback'),
          status: entry.status || 'info',
          badge: this.statusBadgeText(entry.status),
          meta: this.formatTimestamp(entry.timestamp),
          body: this.activitySummary(entry),
          preview: entry.preview,
          execution: entry.execution,
        }),
        this.t('activity.no_calls')
      );
    },
    activityReturnValue(entry) {
      return entry.execution && entry.execution.context === 'scene' && entry.preview
        ? entry.preview.result : entry.preview;
    },
    activitySummary(entry) {
      if (entry.status === 'error') return entry.summary || this.t('activity.execution_failed');
      const value = this.activityReturnValue(entry);
      if (value && typeof value === 'object') {
        for (const key of ['summary', 'message']) {
          if (typeof value[key] === 'string' && value[key]) return value[key];
        }
      }
      if (entry.execution) return this.t('activity.execution_completed');
      return entry.summary && entry.summary !== 'Structured result returned.'
        ? entry.summary : this.t('activity.call_completed');
    },
    activityDisclosure(key, label, defaultOpen = false) {
      const details = document.createElement('details');
      details.dataset.activityKey = key;
      details.open = this.activityDisclosureState && this.activityDisclosureState.has(key)
        ? this.activityDisclosureState.get(key) : defaultOpen;
      const summary = document.createElement('summary');
      summary.textContent = label;
      details.appendChild(summary);
      return details;
    },
    renderActivityValue(value, key, depth = 0) {
      if (value === null || typeof value !== 'object') {
        const text = document.createElement('span');
        text.className = 'result-value';
        text.textContent = value === undefined ? '—' : value === null ? 'null' : value === '' ? '""'
          : typeof value === 'boolean' ? this.t(value ? 'common.yes' : 'common.no') : String(value);
        if (typeof value === 'boolean') text.className += ` boolean-${value}`;
        return text;
      }
      const array = Array.isArray(value);
      const entries = Object.entries(value);
      if (!entries.length) {
        const empty = document.createElement('span');
        empty.className = 'result-value result-empty';
        empty.textContent = array ? '[]' : '{}';
        return empty;
      }
      const tree = document.createElement(array ? 'ol' : 'div');
      tree.className = array ? 'result-array' : 'result-fields';
      entries.forEach(([field, child]) => {
        const childKey = `${key}/${JSON.stringify(field)}`;
        const remainder = field === '$remaining' ? child
          : array && child && typeof child === 'object' && Object.keys(child).length === 1 ? child.$remaining : undefined;
        if (Number.isInteger(remainder)) {
          const notice = document.createElement(array ? 'li' : 'div');
          notice.className = 'result-omitted';
          notice.textContent = this.t('activity.items_omitted', { count: remainder });
          tree.appendChild(notice);
        } else if (array) {
          const item = document.createElement('li');
          item.appendChild(this.renderActivityValue(child, childKey, depth + 1));
          tree.appendChild(item);
        } else {
          const labelKey = `activity.field_${field}`;
          const label = EN[labelKey] ? this.t(labelKey) : field;
          if (child && typeof child === 'object' && Object.keys(child).length) {
            const branch = this.activityDisclosure(childKey, label, depth < 2);
            branch.className = 'result-branch';
            branch.appendChild(this.renderActivityValue(child, childKey, depth + 1));
            tree.appendChild(branch);
          } else {
            const row = document.createElement('div');
            row.className = 'result-row';
            const term = document.createElement('span');
            term.className = 'result-key';
            term.textContent = label;
            row.appendChild(term);
            row.appendChild(this.renderActivityValue(child, childKey, depth + 1));
            tree.appendChild(row);
          }
        }
      });
      return tree;
    },
    renderExecutionLogs(execution, parent) {
      const heading = document.createElement('div');
      heading.className = 'result-section-title';
      heading.textContent = this.t('activity.execution_logs');
      parent.appendChild(heading);
      const logs = document.createElement('ol');
      logs.className = 'execution-logs';
      (execution.logs || []).forEach((entry) => {
        const item = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'execution-log';
        const level = document.createElement('span');
        const name = ['info', 'warn', 'error', 'debug'].includes(entry.level) ? entry.level : 'info';
        level.className = `execution-level ${name}`;
        level.textContent = name.toUpperCase();
        const message = document.createElement('span');
        message.className = 'execution-message';
        message.textContent = entry.message;
        row.appendChild(level);
        row.appendChild(message);
        item.appendChild(row);
        logs.appendChild(item);
      });
      if (!(execution.logs || []).length) {
        logs.className += ' result-empty';
        logs.textContent = this.t('activity.no_execution_logs');
      }
      parent.appendChild(logs);
      if (execution.logsOmitted) {
        const notice = document.createElement('div');
        notice.className = 'result-omitted';
        notice.textContent = this.t('activity.logs_omitted', { count: execution.logsOmitted });
        parent.appendChild(notice);
      }
    },
    renderMiniList(container, entries, formatEntry, emptyText) {
      if (!container) {
        return;
      }
      const scrollTop = container.scrollTop;
      this.activityDisclosureState = new Map(Array.from(container.querySelectorAll
        ? container.querySelectorAll('details[data-activity-key]') : [], (element) => [element.dataset.activityKey, element.open]));
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
        const result = document.createElement('div');
        result.className = 'activity-result';
        if (formatted.body) {
          const body = document.createElement('div');
          body.className = `mini-body${formatted.status === 'error' ? ' result-error' : ''}`;
          body.textContent = formatted.body;
          result.appendChild(body);
        }
        if (formatted.execution) {
          const meta = document.createElement('div');
          meta.className = 'execution-meta';
          meta.textContent = `${this.t(`activity.context_${formatted.execution.context}`)} · ${formatted.execution.durationMs} ms`;
          result.appendChild(meta);
          this.renderExecutionLogs(formatted.execution, result);
        }
        if (formatted.preview !== undefined || formatted.execution && formatted.status !== 'error') {
          const heading = document.createElement('div');
          heading.className = 'result-section-title';
          heading.textContent = this.t(formatted.execution ? 'activity.return_value' : 'activity.result');
          result.appendChild(heading);
          result.appendChild(this.renderActivityValue(this.activityReturnValue(formatted), `${formatted.id}/data`));
        }
        item.appendChild(result);
        if (formatted.preview !== undefined || formatted.execution) {
          const details = this.activityDisclosure(`${formatted.id}/json`, this.t('activity.result_preview'));
          details.className = 'result-details';
          const json = document.createElement('pre');
          json.textContent = JSON.stringify(formatted.execution
            ? { data: formatted.preview, execution: formatted.execution } : formatted.preview, null, 2);
          details.appendChild(json);
          item.appendChild(details);
        }
        fragment.appendChild(item);
      });
      container.appendChild(fragment);
      if (Number.isFinite(scrollTop)) container.scrollTop = scrollTop;
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
      return normalized.slice(0, 3).toUpperCase() || this.t('activity.log_badge');
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
        enableConsoleLogging: this.$.consoleLoggingInput
          ? Boolean(this.$.consoleLoggingInput.value)
          : config.enableConsoleLogging !== false,
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
        language: this.getControlValue('languageSelect', config.language || 'auto'),
      };
    },
    async persistConfig(options = {}) {
      const { showNotice = false } = options;
      try {
        const panelState = await request('save-config', this.collectConfig());
        this.state = panelState;
        this.renderState();
        if (showNotice) {
          this.showNotice(this.t('common.configuration_saved'));
        }
        return panelState;
      } catch (error) {
        this.showNotice(this.t('common.save_failed', { error: error.message }), 'error');
        throw error;
      }
    },
    async runAction(action, options = {}) {
      try {
        const result = await action();
        if (result && (result.ok === false || result.success === false)) {
          throw new Error(result.message || result.error && result.error.message || this.t('common.action_failed'));
        }
        await this.refresh();
        if (options.notify !== false) this.showNotice(this.t('common.action_completed'));
        return result;
      } catch (error) {
        this.showNotice(this.t('common.error', { error: error.message }), 'error');
      }
    },
    dismissNotice() {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
      if (this.$.panelNotice) this.$.panelNotice.hidden = true;
    },
    showNotice(value, status = 'success') {
      if (!this.$.panelNotice || !this.$.panelNoticeText) return;
      this.dismissNotice();
      // Only a short action acknowledgement belongs here, never a raw result dump.
      this.$.panelNoticeText.textContent = typeof value === 'string' ? value : this.t('common.action_completed');
      this.$.panelNotice.className = `panel-notice ${status}`;
      this.$.panelNotice.setAttribute('role', status === 'error' ? 'alert' : 'status');
      this.$.panelNotice.setAttribute('aria-live', status === 'error' ? 'assertive' : 'polite');
      this.$.panelNotice.hidden = false;
      if (status === 'success') {
        this.noticeTimer = setTimeout(() => this.dismissNotice(), 4500);
      }
    },
    copyText(text, successMessage) {
      if (!text) {
        this.showNotice(this.t('common.nothing_to_copy'));
        return;
      }
      navigator.clipboard.writeText(text)
        .then(() => this.showNotice(successMessage))
        .catch(() => this.showNotice(this.t('common.copy_failed'), 'error'));
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
      await this.persistConfig({ showNotice: true });
    },
    async applySavedToolProfile() {
      const name = this.$.savedToolProfileSelect.value;
      const profile = this.getSavedToolProfiles().find((item) => item.name === name);
      if (!profile) {
        this.showNotice(this.t('tools.no_profile_selected'), 'error');
        return;
      }
      this.setControlValue('profileSelect', profile.toolProfile);
      this.setControlValue('enabledCategoriesInput', this.formatList(profile.enabledToolCategories));
      this.setControlValue('disabledCategoriesInput', this.formatList(profile.disabledToolCategories));
      this.setControlValue('enabledToolsInput', this.formatList(profile.enabledTools));
      this.setControlValue('disabledToolsInput', this.formatList(profile.disabledTools));
      this.setControlValue('toolProfileNameInput', profile.name);
      this.state.config.activeToolProfileName = profile.name;
      await this.persistConfig({ showNotice: true });
    },
    async deleteSavedToolProfile() {
      const name = this.$.savedToolProfileSelect.value;
      if (!name) {
        this.showNotice(this.t('tools.no_profile_selected'), 'error');
        return;
      }
      this.state.config.savedToolProfiles = this.getSavedToolProfiles()
        .filter((profile) => profile.name !== name);
      if (this.state.config.activeToolProfileName === name) {
        this.state.config.activeToolProfileName = '';
      }
      this.setControlValue('toolProfileNameInput', '');
      await this.persistConfig({ showNotice: true });
    },
    exportSavedToolProfiles() {
      const payload = JSON.stringify({ version: 1, profiles: this.getSavedToolProfiles() }, null, 2);
      this.setControlValue('toolProfileImportText', payload);
      this.copyText(payload, this.t('tools.profiles_copied'));
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
          throw new Error(this.t('tools.no_profiles_found'));
        }
        this.state.config.savedToolProfiles = this.normalizeToolProfiles([
          ...this.getSavedToolProfiles(),
          ...incoming,
        ]);
        await this.persistConfig({ showNotice: true });
      } catch (error) {
        this.showNotice(this.t('tools.import_failed', { error: error.message }), 'error');
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
      await this.persistConfig({ showNotice: true });
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
      await this.persistConfig({ showNotice: false });
      this.showNotice(this.t('tools.exposure_saved', {
        name,
        state: exposed ? this.t('tools.enabled') : this.t('tools.disabled'),
      }));
    },
    async setAllToolExposure(exposed) {
      const catalog = (this.state && this.state.toolCatalog) || [];
      const names = catalog.map((tool) => tool.name).filter(Boolean).sort();
      this.setControlValue('enabledCategoriesInput', '');
      this.setControlValue('disabledCategoriesInput', '');
      this.setControlValue('enabledToolsInput', exposed ? names.join('\n') : '');
      this.setControlValue('disabledToolsInput', exposed ? '' : names.join('\n'));
      await this.persistConfig({ showNotice: true });
    },
    async useDefaultToolList() {
      this.setControlValue('enabledCategoriesInput', '');
      this.setControlValue('disabledCategoriesInput', '');
      this.setControlValue('enabledToolsInput', '');
      this.setControlValue('disabledToolsInput', '');
      await this.persistConfig({ showNotice: true });
    },
    async clearActivity() {
      await this.runAction(() => request('clear-recent-activity'));
    },
    showClientAction(message, status = 'info') {
      const element = this.$.clientActionStatus;
      if (!element) return;
      element.textContent = message;
      element.className = `action-status ${status}`;
      element.hidden = !message;
    },
    async configureClientSetup(includeSkills = false) {
      if (this.configuringClient) return;
      const targetId = this.$.clientTargetSelect && this.$.clientTargetSelect.value;
      if (!targetId) {
        this.showClientAction(this.t('client.select_first'), 'error');
        return;
      }
      if (this.state && this.state.clientConfig && this.state.clientConfig.configurationBlocked) {
        this.showClientAction(this.t('client.fallback_blocked'), 'warning');
        return;
      }
      this.configuringClient = true;
      this.renderClientTargetStatus();
      this.showClientAction(this.t('client.configuring'));
      let configured = false;
      try {
        // Refresh this client's state before any write. Configuring a connection
        // must not replace existing Skills, even if they changed during setup.
        const skills = includeSkills ? await request('get-project-skills-state', { clientId: targetId }) : null;
        if (includeSkills && (!skills || !skills.supported || skills.error || !Array.isArray(skills.builtIns))) {
          throw new Error(skills && skills.error || this.t('skills_manager.unsupported'));
        }
        await request('configure-client', targetId);
        configured = true;
        const installed = [];
        const preserved = [];
        for (const skill of skills && skills.builtIns || []) {
          if (skill.status !== 'missing') {
            if (skill.status !== 'current') preserved.push(skill.skillName);
            continue;
          }
          const outcome = await request('install-or-update-project-skill', { skillName: skill.skillName, clientId: targetId, onlyIfMissing: true });
          if (outcome.installed) installed.push(skill.skillName);
          else if (!outcome.alreadyCurrent) preserved.push(skill.skillName);
        }
        this.showClientAction(this.t(preserved.length ? 'client.setup_review' : includeSkills ? 'client.setup_complete' : 'client.configure_complete', {
          count: installed.length,
        }), preserved.length ? 'warning' : 'success');
      } catch (error) {
        const message = this.t(configured ? 'client.setup_partial' : 'client.configure_failed', { error: error.message });
        this.showClientAction(message, 'error');
      } finally {
        this.configuringClient = false;
        try { await this.refresh(); } catch (error) { /* refresh already reports the error */ }
        this.renderClientTargetStatus();
      }
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
        this.showNotice(this.t('updates.auto_check_failed', { error: error.message }), 'error');
      }
    },
    async installUpdate() {
      const update = this.state && this.state.updateInfo;
      if (!(update && update.ok && update.updateAvailable && update.downloadAvailable)) {
        this.showNotice(this.t('updates.none_installable'));
        return;
      }
      const message =
        `${this.t('updates.confirm_title', { version: update.latestVersion })}\n\n` +
        this.t('updates.confirm_body');
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) {
        return;
      }
      await this.runAction(() => request('install-update'));
    },
    async installGlobally() {
      const installation = this.state && this.state.installation;
      if (!(installation && installation.canInstallGlobally)) {
        this.showNotice(this.t('installation.already_available'));
        return;
      }
      const message =
        `${this.t('installation.confirm_title')}\n\n` +
        this.t('installation.confirm_body', {
          path: installation.globalPackagePath || '',
        });
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) {
        return;
      }
      await this.runAction(() => request('install-globally'));
    },
    getBuiltInProjectSkill(skillName) {
      const projectSkills = this.selectedProjectSkills();
      const builtIns = projectSkills && Array.isArray(projectSkills.builtIns)
        ? projectSkills.builtIns
        : projectSkills && projectSkills.official
          ? [projectSkills.official]
          : [];
      return builtIns.find((skill) => skill.skillName === skillName) || null;
    },
    async previewProjectSkill(skillName) {
      try {
        const clientId = this.selectedSkillClientId();
        const result = await request('preview-project-skill-update', { skillName, clientId });
        this.skillDiffs = this.skillDiffs || {};
        this.skillDiffs[`${clientId}:${skillName}`] = result.diff || '';
        this.renderProjectSkills();
        this.showNotice(this.t('skills_manager.diff_summary', {
          added: result.addedLines || 0,
          removed: result.removedLines || 0,
        }));
      } catch (error) {
        this.showNotice(this.t('common.error', { error: error.message }), 'error');
      }
    },
    async installProjectSkill(skillName) {
      const skill = this.getBuiltInProjectSkill(skillName);
      if (!skill || skill.status === 'current') {
        this.showNotice(this.t('skills_manager.already_current'));
        return;
      }

      let allowModified = false;
      if (skill.status !== 'missing') {
        const titleKey = skill.modified
          ? 'skills_manager.confirm_modified_title'
          : 'skills_manager.confirm_update_title';
        const bodyKey = skill.modified
          ? 'skills_manager.confirm_modified_body'
          : 'skills_manager.confirm_update_body';
        const message = `${this.t(titleKey)}\n\n${this.t(bodyKey, {
          path: skill.path || '',
        })}`;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) {
          return;
        }
        allowModified = skill.modified;
      }
      await this.runAction(() => request('install-or-update-project-skill', {
        skillName,
        clientId: this.selectedSkillClientId(),
        allowModified,
      }));
    },
    async restoreProjectSkill(skillName) {
      const skill = this.getBuiltInProjectSkill(skillName);
      if (!(skill && skill.latestBackup)) {
        this.showNotice(this.t('skills_manager.no_backup'));
        return;
      }
      const message = `${this.t('skills_manager.confirm_restore_title')}\n\n${this.t(
        'skills_manager.confirm_restore_body',
        { path: skill.latestBackup.path }
      )}`;
      if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(message)) {
        return;
      }
      await this.runAction(() => request('restore-project-skill-backup', {
        skillName,
        clientId: this.selectedSkillClientId(),
        backupPath: skill.latestBackup.path,
      }));
    },
    async createProjectSkillFromForm() {
      const skillName = String(this.getControlValue('newSkillNameInput', '') || '').trim();
      if (!skillName) {
        this.showNotice(this.t('skills_manager.skill_name_required'), 'error');
        return;
      }
      try {
        const result = await request('create-project-skill', {
          skillName,
          clientId: this.selectedSkillClientId(),
          title: String(this.getControlValue('newSkillTitleInput', '') || '').trim(),
          description: String(this.getControlValue('newSkillDescriptionInput', '') || '').trim(),
          instructions: String(this.getControlValue('newSkillInstructionsInput', '') || '').trim(),
        });
        this.setControlValue('newSkillNameInput', '');
        this.setControlValue('newSkillTitleInput', '');
        this.setControlValue('newSkillDescriptionInput', '');
        this.setControlValue('newSkillInstructionsInput', '');
        this.showNotice(result);
        await this.refresh();
      } catch (error) {
        this.showNotice(this.t('common.error', { error: error.message }), 'error');
      }
    },
    async revealProjectSkill(skillPath) {
      const target = String(skillPath || '').trim();
      if (!target) {
        return;
      }
      await this.runAction(() => request('reveal-project-skill', { path: target, clientId: this.selectedSkillClientId() }));
    },
    bindEvents() {
      this.on(this.$.clearActivityBtn, 'click', () => this.clearActivity());
      this.on(this.$.dismissNoticeBtn, 'click', () => this.dismissNotice());
      this.on(this.$.restartBtn, 'click', () => this.runAction(() => request('restart-server')));
      this.on(this.$.useProjectPortBtn, 'click', () => this.runAction(() => request('save-config', { portMode: 'project' })));
      this.on(this.$.pinCurrentPortBtn, 'click', () => this.runAction(() => request('save-config', { portMode: 'fixed', port: this.state.status.port })));
      this.on(this.$.skillClientSelect, 'change', () => {
        this.skillDiffs = {};
        this.renderProjectSkills();
        this.runAction(() => request('save-config', { lastClientTargetId: this.selectedSkillClientId() }));
      });
      this.on(this.$.refreshBtn, 'click', () => this.refresh());
      this.on(this.$.copyUrlBtn, 'click', () => {
        const status = this.state && this.state.status;
        this.copyText(status && status.url ? status.url : '', this.t('client.url_copied'));
      });
      this.on(this.$.copyHealthCurlBtn, 'click', () => {
        this.copyText(this.getCurlCommand('health'), this.t('client.health_copied'));
      });
      this.on(this.$.copyToolsCurlBtn, 'click', () => {
        this.copyText(this.getCurlCommand('tools'), this.t('client.tools_copied'));
      });
      this.on(this.$.checkUpdatesBtn, 'click', () => this.runAction(() => request('check-updates')));
      this.on(this.$.openReleaseBtn, 'click', () => this.runAction(() => request('open-update-release')));
      this.on(this.$.installUpdateBtn, 'click', () => this.installUpdate());
      this.on(this.$.installGlobalBtn, 'click', () => this.installGlobally());
      this.on(this.$.copyGlobalPathBtn, 'click', () => {
        const installation = this.state && this.state.installation;
        this.copyText(
          installation && installation.globalPackagePath ? installation.globalPackagePath : '',
          this.t('installation.path_copied')
        );
      });
      this.on(this.$.openToolsBtn, 'click', () => this.runAction(() => request('open-panel', 'tool-exposure'), { notify: false }));
      this.on(this.$.openSettingsBtn, 'click', () => this.runAction(() => request('open-panel', 'settings'), { notify: false }));
      this.on(this.$.openProjectSkillsBtn, 'click', () => this.runAction(() => request('open-panel', 'project-skills'), { notify: false }));
      this.on(this.$.openProjectSkillsNoticeBtn, 'click', () => this.runAction(() => request('open-panel', 'project-skills'), { notify: false }));
      this.on(this.$.openDashboardBtn, 'click', () => this.runAction(() => request('open-panel', 'default'), { notify: false }));
      this.on(this.$.enabledInput, 'change', () => this.handleEnableToggle());
      this.on(this.$.portInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.profileSelect, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.sessionsInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.consoleLoggingInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.javascriptSafetyInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.languageSelect, 'change', () => this.handleLanguageChange());
      this.on(this.$.enabledCategoriesInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.disabledCategoriesInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.enabledToolsInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.disabledToolsInput, 'change', () => this.persistConfig({ showNotice: true }));
      this.on(this.$.clientTargetSelect, 'confirm', () => this.renderClientTargetStatus());
      this.on(this.$.clientTargetSelect, 'change', () => {
        this.showClientAction('');
        this.renderClientTargetStatus();
        this.persistConfig();
      });
      this.on(this.$.configureClientBtn, 'click', () => this.configureClientSetup(false));
      this.on(this.$.configureWithSkillsBtn, 'click', () => this.configureClientSetup(true));
      this.on(this.$.useCoreBtn, 'click', () => this.applyPreset('core'));
      this.on(this.$.useFullBtn, 'click', () => this.applyPreset('full'));
      this.on(this.$.useCustomBtn, 'click', () => this.applyPreset('custom'));
      this.on(this.$.selectAllToolsBtn, 'click', () => this.setAllToolExposure(true));
      this.on(this.$.clearToolsBtn, 'click', () => this.setAllToolExposure(false));
      this.on(this.$.useDefaultToolsBtn, 'click', () => this.useDefaultToolList());
      this.on(this.$.saveToolProfileBtn, 'click', () => this.saveCurrentToolProfile());
      this.on(this.$.applyToolProfileBtn, 'click', () => this.applySavedToolProfile());
      this.on(this.$.deleteToolProfileBtn, 'click', () => this.deleteSavedToolProfile());
      this.on(this.$.exportToolProfilesBtn, 'click', () => this.exportSavedToolProfiles());
      this.on(this.$.importToolProfilesBtn, 'click', () => this.importSavedToolProfiles());
      this.on(this.$.builtInSkillList, 'click', (event) => {
        const target = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('ui-button')
          : event.target;
        const action = target && target.dataset && target.dataset.skillAction;
        const skillName = target && target.dataset && target.dataset.skillName;
        if (!action || !skillName) {
          return;
        }
        if (action === 'install') {
          this.installProjectSkill(skillName);
        } else if (action === 'preview') {
          this.previewProjectSkill(skillName);
        } else if (action === 'restore') {
          this.restoreProjectSkill(skillName);
        } else if (action === 'reveal') {
          const skill = this.getBuiltInProjectSkill(skillName);
          this.revealProjectSkill(skill && skill.path);
        }
      });
      this.on(this.$.createProjectSkillBtn, 'click', () => this.createProjectSkillFromForm());
      this.on(this.$.projectSkillList, 'click', (event) => {
        const target = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('ui-button')
          : event.target;
        if (!target || !target.dataset || !target.dataset.skillPath) {
          return;
        }
        this.revealProjectSkill(target.dataset.skillPath);
      });
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
      if (typeof window !== 'undefined') {
        this.on(window, 'focus', () => this.refresh().catch(() => {}));
      }
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
      this.persistConfig({ showNotice: true });
    },
    async handleLanguageChange() {
      if (!this.state) {
        return;
      }
      this.state.config.language = this.getControlValue('languageSelect', 'auto');
      this.syncLanguage();
      this.renderState();
      await this.persistConfig({ showNotice: true });
    },
  };
}

module.exports = {
  createPanel,
};
