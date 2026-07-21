'use strict';

const DEFAULT_LANGUAGE = 'en';
const LANGUAGE_PREFERENCES = new Set(['auto', 'en', 'zh']);
const TRANSLATION_KEY = 'funplay-cocos-mcp.language_code';

function normalizeLanguagePreference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return LANGUAGE_PREFERENCES.has(normalized) ? normalized : 'auto';
}

function normalizeLocale(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh' : DEFAULT_LANGUAGE;
}

function detectEditorLanguage(editor = global.Editor) {
  if (editor && editor.I18n && typeof editor.I18n.t === 'function') {
    try {
      const translated = String(editor.I18n.t(TRANSLATION_KEY) || '').trim().toLowerCase();
      if (translated === 'en' || translated === 'zh') {
        return translated;
      }
    } catch (error) {
      // Fall back to exposed locale properties and the host locale.
    }
  }

  const candidates = [
    editor && editor.I18n && editor.I18n.locale,
    editor && editor.I18n && editor.I18n.language,
    editor && editor.App && editor.App.language,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
  ];
  const explicit = candidates.find((value) => typeof value === 'string' && value.trim());
  if (explicit) {
    return normalizeLocale(explicit);
  }

  try {
    return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch (error) {
    return DEFAULT_LANGUAGE;
  }
}

function resolveLanguage(preference, detectedLanguage) {
  const normalized = normalizeLanguagePreference(preference);
  return normalized === 'auto' ? normalizeLocale(detectedLanguage) : normalized;
}

function translate(dictionaries, language, key, replacements = {}) {
  const dictionary = dictionaries[normalizeLocale(language)] || dictionaries[DEFAULT_LANGUAGE] || {};
  const fallback = dictionaries[DEFAULT_LANGUAGE] || {};
  const template = dictionary[key] !== undefined ? dictionary[key] : fallback[key];
  const text = template === undefined ? key : String(template);
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    replacements[name] === undefined ? match : String(replacements[name])
  ));
}

module.exports = {
  DEFAULT_LANGUAGE,
  detectEditorLanguage,
  normalizeLanguagePreference,
  normalizeLocale,
  resolveLanguage,
  translate,
};
