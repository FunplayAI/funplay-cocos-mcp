'use strict';

const path = require('path');
const { getProjectIdentity } = require('./config');

const CONTEXT_META_KEY = 'io.funplay.cocos/context';

function projectEndpoint(projectIdentity) {
  return projectIdentity ? `/mcp/project/${encodeURIComponent(projectIdentity)}/` : '/';
}

function serverUrl(config, port = config.port, identity) {
  const host = String(config.host || '127.0.0.1');
  const authority = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const project = identity === undefined ? (config.projectPath ? getProjectIdentity(config.projectPath) : '') : identity;
  return `http://${authority}:${port}${projectEndpoint(project)}`;
}

function projectContext({ projectIdentity, projectPath, instanceId }) {
  return {
    project_id: projectIdentity || '',
    project_path: projectPath ? path.resolve(projectPath) : '',
    instance_id: instanceId,
    expected_context: `${projectIdentity || ''}:${instanceId}`,
  };
}

function requestRoute(pathname, identity) {
  const legacy = { '/': 'rpc', '/mcp': 'rpc', '/mcp/': 'rpc', '/health': 'health', '/tools': 'tools' };
  if (Object.prototype.hasOwnProperty.call(legacy, pathname)) return { kind: legacy[pathname], scoped: false };
  const match = /^\/mcp\/project\/([^/]+)(?:\/(health|tools))?\/?$/.exec(pathname);
  if (!match) return { error: 'ENDPOINT_NOT_FOUND', status: 404 };
  let project;
  try { project = decodeURIComponent(match[1]); } catch (error) { return { error: 'ENDPOINT_NOT_FOUND', status: 404 }; }
  if (!identity || project !== identity) return { error: 'PROJECT_CONTEXT_MISMATCH', status: 409 };
  return { kind: match[2] || 'rpc', scoped: true, project };
}

function expectedContext(params = {}) {
  const fromMeta = params._meta && params._meta.expected_context;
  const fromArgs = params.arguments && params.arguments.expected_context;
  if (fromMeta !== undefined && fromArgs !== undefined && fromMeta !== fromArgs) {
    return { error: 'PROJECT_CONTEXT_MISMATCH' };
  }
  const token = fromMeta === undefined ? fromArgs : fromMeta;
  if (token !== undefined && (typeof token !== 'string' || !token)) return { error: 'PROJECT_CONTEXT_MISMATCH' };
  return { token };
}

function contextError(context, params, { scoped = false, readOnly = false } = {}) {
  const expected = expectedContext(params);
  if (expected.error) return expected.error;
  if (expected.token !== undefined && expected.token !== context.expected_context) {
    return expected.token.split(':')[0] === context.project_id ? 'EDITOR_INSTANCE_CHANGED' : 'PROJECT_CONTEXT_MISMATCH';
  }
  return !scoped && !readOnly && !expected.token ? 'PROJECT_CONTEXT_REQUIRED' : null;
}

function withContextSchema(tool) {
  return { ...tool, inputSchema: { ...tool.inputSchema, properties: {
    ...tool.inputSchema && tool.inputSchema.properties,
    expected_context: { type: 'string', description: 'Optional Editor-session pin from initialize.funplay.context after independently verifying the intended project. Required for mutating calls through legacy unscoped URLs.' },
  } } };
}

module.exports = { CONTEXT_META_KEY, projectEndpoint, serverUrl, projectContext, requestRoute, contextError, withContextSchema };
