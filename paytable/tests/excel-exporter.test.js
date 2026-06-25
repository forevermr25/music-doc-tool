import { describe, it, expect } from 'vitest';
import {
  generateExportFilename,
  detectPageType,
  extractPayIconName,
  findIconReferences
} from './excel-exporter.js';

describe('Excel Exporter - generateExportFilename', () => {
  it('should generate correct filename for CTS brand', () => {
    var result = generateExportFilename('CTS', '圣诞工厂');
    expect(result).toBe('CTS圣诞工厂：paytable需求文档.xlsx');
  });

  it('should generate correct filename for JFS brand', () => {
    var result = generateExportFilename('JFS', '写实维京');
    expect(result).toBe('JFS写实维京：paytable需求文档.xlsx');
  });

  it('should generate correct filename for JMS brand', () => {
    var result = generateExportFilename('JMS', 'TestGame');
    expect(result).toBe('JMSTestGame：paytable需求文档.xlsx');
  });

  it('should handle empty game name', () => {
    var result = generateExportFilename('CTS', '');
    expect(result).toBe('CTS：paytable需求文档.xlsx');
  });
});

describe('Excel Exporter - detectPageType', () => {
  it('should detect PAYS page from English title', () => {
    var result = detectPageType('赔付表', 'PAYS');
    expect(result.isPays).toBe(true);
    expect(result.isFeature).toBe(false);
  });

  it('should detect PAYS page from Chinese title starting with 赔付', () => {
    var result = detectPageType('赔付', '');
    expect(result.isPays).toBe(true);
  });

  it('should detect PAYS page from Chinese title starting with 符号', () => {
    var result = detectPageType('符号赔付', '');
    expect(result.isPays).toBe(true);
  });

  it('should detect FEATURE page from English title', () => {
    var result = detectPageType('特殊图标', 'FEATURE');
    expect(result.isFeature).toBe(true);
    expect(result.isPays).toBe(false);
  });

  it('should detect FEATURE page from Chinese title starting with 特殊图标', () => {
    var result = detectPageType('特殊图标介绍', '');
    expect(result.isFeature).toBe(true);
  });

  it('should not detect regular feature detail pages as FEATURE', () => {
    var result = detectPageType('免费游戏', 'FREE SPINS');
    expect(result.isFeature).toBe(false);
    expect(result.isPays).toBe(false);
  });
});

describe('Excel Exporter - extractPayIconName', () => {
  it('should extract icon name from payout line with bullet', () => {
    var result = extractPayIconName('* [WILD] 5-250 / 4-50 / 3-10');
    expect(result).toBe('WILD');
  });

  it('should extract icon name without bullet', () => {
    var result = extractPayIconName('[H1] 5-100 / 4-20');
    expect(result).toBe('H1');
  });

  it('should return null for lines without bracket notation', () => {
    var result = extractPayIconName('* Regular content line');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    var result = extractPayIconName('');
    expect(result).toBeNull();
  });
});

describe('Excel Exporter - findIconReferences', () => {
  it('should find all icon references in text', () => {
    var result = findIconReferences('* [WILD] substitutes for all except [SCATTER]');
    expect(result).toEqual(['WILD', 'SCATTER']);
  });

  it('should return empty array for text without references', () => {
    var result = findIconReferences('Regular text without icons');
    expect(result).toEqual([]);
  });

  it('should handle multiple references of same icon', () => {
    var result = findIconReferences('[BONUS] triggers [BONUS] feature');
    expect(result).toEqual(['BONUS', 'BONUS']);
  });

  it('should handle numbered icon variants', () => {
    var result = findIconReferences('[BONUS1] and [BONUS2] collect into areas');
    expect(result).toEqual(['BONUS1', 'BONUS2']);
  });
});
