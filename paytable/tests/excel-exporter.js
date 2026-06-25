/**
 * Excel Exporter - Testable pure functions extracted for unit testing.
 * These mirror the functions in index.html's Excel Exporter module.
 */

/**
 * generateExportFilename(brand, gameName)
 * Returns the formatted export filename.
 *
 * @param {string} brand - Brand identifier (CTS, JFS, JMS)
 * @param {string} gameName - Game name string
 * @returns {string} Formatted filename
 */
export function generateExportFilename(brand, gameName) {
  return brand + gameName + '：paytable需求文档.xlsx';
}

/**
 * Determines page type from title strings.
 * Returns { isPays, isFeature }
 */
export function detectPageType(title, titleEn) {
  var titleUpper = ((title || '') + ' ' + (titleEn || '')).toUpperCase();
  var isPays = /^PAYS\b/.test(titleUpper) ||
    /^赔付/.test(title || '') ||
    /^符号/.test(title || '');
  var isFeature = /^FEATURE\b/.test(titleUpper) ||
    /^特殊图标/.test(title || '');
  return { isPays: isPays, isFeature: isFeature };
}

/**
 * Extracts icon name from bracket notation at start of a content line (PAYS page pattern).
 * Returns the icon name or null.
 */
export function extractPayIconName(text) {
  var match = text.match(/^\*?\s*\[([A-Za-z0-9_]+)\]/);
  return match ? match[1] : null;
}

/**
 * Finds all icon bracket references in a text string.
 * Returns array of icon names found.
 */
export function findIconReferences(text) {
  var refs = text.match(/\[([A-Za-z0-9_]+)\]/g);
  if (!refs) return [];
  return refs.map(function(r) { return r.replace(/[\[\]]/g, ''); });
}
