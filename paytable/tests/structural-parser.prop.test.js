/**
 * Property-Based Tests for Structural Parser
 * Framework: Vitest + fast-check
 * Minimum iterations: 100
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parse,
  identifySpecialIcons,
  detectFeatures,
  generateWildDefault,
  isFeatureHeader,
  FEATURE_KEYWORDS_EN,
  CHINESE_MARKERS,
} from './structural-parser.js';

// ============================================================
// Custom Arbitraries
// ============================================================

/** Arbitrary for special icon base names */
const specialIconBaseArb = fc.constantFrom('WILD', 'SCATTER', 'BONUS', 'LINK');

/** Arbitrary for special icon names with optional numeric suffix */
const specialIconNameArb = fc.oneof(
  specialIconBaseArb,
  fc.tuple(specialIconBaseArb, fc.integer({ min: 1, max: 9 })).map(([base, n]) => `${base}${n}`)
);

/** Arbitrary for case variations of a special icon name */
const specialIconWithCasingArb = specialIconNameArb.chain((name) =>
  fc.constantFrom(
    name.toUpperCase(),
    name.toLowerCase(),
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  )
);

/** Arbitrary for functional keywords */
const functionalKeywordArb = fc.constantFrom('触发', '替代', '出现在', '携带', '收集', '落地');

/** Arbitrary for design-only keywords */
const designKeywordArb = fc.constantFrom('动画', '颜色', '设计', '美术', '超框');

/** Arbitrary for text lines (non-empty, printable) */
const textLineArb = fc.string({ minLength: 0, maxLength: 80 }).map((s) => s.replace(/\n/g, ' '));

/** Arbitrary for arrays of text lines */
const textLinesArb = fc.array(textLineArb, { minLength: 0, maxLength: 30 });

/** Arbitrary for English feature keywords */
const featureKeywordArb = fc.constantFrom(...FEATURE_KEYWORDS_EN);

// ============================================================
// Property 2: Structural parser always produces complete output shape
// ============================================================

describe('Property 2: Structural parser always produces complete output shape', () => {
  /**
   * Validates: Requirements 1.3
   * For any array of text lines (including empty arrays), the Structural Parser
   * SHALL produce an output object containing a `specialIcons` array, a `normalIcons`
   * array, and a `features` array, each of which may be empty but must always be present.
   */
  it('parse() always returns object with specialIcons, normalIcons, and features arrays', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 100 }), { minLength: 0, maxLength: 50 }),
        (lines) => {
          const result = parse(lines);

          // Must be an object
          expect(result).toBeDefined();
          expect(typeof result).toBe('object');

          // Must have specialIcons array
          expect(result).toHaveProperty('specialIcons');
          expect(Array.isArray(result.specialIcons)).toBe(true);

          // Must have normalIcons array
          expect(result).toHaveProperty('normalIcons');
          expect(Array.isArray(result.normalIcons)).toBe(true);

          // Must have features array
          expect(result).toHaveProperty('features');
          expect(Array.isArray(result.features)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('parse() returns complete shape for empty input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom([], null, undefined),
        (input) => {
          const result = parse(input);
          expect(result).toHaveProperty('specialIcons');
          expect(result).toHaveProperty('normalIcons');
          expect(result).toHaveProperty('features');
          expect(Array.isArray(result.specialIcons)).toBe(true);
          expect(Array.isArray(result.normalIcons)).toBe(true);
          expect(Array.isArray(result.features)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 3: Special icon detection with numbered variant deduplication
// ============================================================

describe('Property 3: Special icon detection with numbered variant deduplication', () => {
  /**
   * Validates: Requirements 3.1, 3.2
   * For any document text containing WILD, SCATTER, BONUS, or LINK keywords
   * (in any casing variation, with optional numeric suffixes), the Structural Parser
   * SHALL detect all unique special icon names AND remove the generic base name
   * when numbered variants exist.
   */
  it('detects special icons regardless of casing', () => {
    fc.assert(
      fc.property(
        specialIconWithCasingArb,
        fc.string({ minLength: 0, maxLength: 20 }),
        (iconName, context) => {
          const text = `${context} ${iconName} ${context}`;
          const result = identifySpecialIcons(text);

          // Should detect the icon (normalized to uppercase)
          const detectedNames = result.map((r) => r.name);
          expect(detectedNames).toContain(iconName.toUpperCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('removes generic base name when numbered variants exist', () => {
    fc.assert(
      fc.property(
        specialIconBaseArb,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }).filter((n2) => true),
        (baseName, num1, num2) => {
          // Ensure two different numbered variants
          const n2 = num1 === num2 ? num2 + 1 : num2;
          const text = `${baseName} appears\n${baseName}${num1} triggers\n${baseName}${n2} collects`;
          const result = identifySpecialIcons(text);
          const detectedNames = result.map((r) => r.name);

          // Numbered variants should be present
          expect(detectedNames).toContain(`${baseName}${num1}`);
          expect(detectedNames).toContain(`${baseName}${n2}`);

          // Generic base name should be removed (deduplication)
          expect(detectedNames).not.toContain(baseName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('keeps base name when no numbered variants exist', () => {
    fc.assert(
      fc.property(specialIconBaseArb, (baseName) => {
        const text = `The ${baseName} icon appears on reel 3`;
        const result = identifySpecialIcons(text);
        const detectedNames = result.map((r) => r.name);

        // Base name should be present when no numbered variants
        expect(detectedNames).toContain(baseName);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 4: Functional vs design description filtering
// ============================================================

describe('Property 4: Functional vs design description filtering', () => {
  /**
   * Validates: Requirements 3.6, 3.7
   * For any line of document text associated with a special icon, the Structural Parser
   * SHALL include it in the icon's functional descriptions only if it contains at least
   * one functional keyword and SHALL exclude it if it contains only design keywords
   * without any functional keywords.
   */
  it('includes lines with functional keywords in icon descriptions', () => {
    fc.assert(
      fc.property(
        specialIconBaseArb,
        functionalKeywordArb,
        fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/\n/g, '')),
        (iconName, keyword, filler) => {
          const line = `${iconName}${filler}${keyword}${filler}`;
          const text = line;
          const result = identifySpecialIcons(text);

          // Find the icon
          const icon = result.find((r) => r.name === iconName);
          if (icon) {
            // The line should be included in functions
            expect(icon.functions.length).toBeGreaterThan(0);
            // At least one function should contain the keyword
            const hasKeyword = icon.functions.some((f) => f.indexOf(keyword) !== -1);
            expect(hasKeyword).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('excludes lines with only design keywords (no functional keywords)', () => {
    fc.assert(
      fc.property(
        specialIconBaseArb,
        designKeywordArb,
        (iconName, designKw) => {
          // Create a line with ONLY design keyword, no functional keywords
          const line = `${iconName}的${designKw}效果很好`;
          const text = line;
          const result = identifySpecialIcons(text);

          // Find the icon
          const icon = result.find((r) => r.name === iconName);
          if (icon) {
            // The line should NOT be in functions (it has no functional keyword)
            const hasLine = icon.functions.some((f) => f.indexOf(designKw) !== -1);
            expect(hasLine).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('includes lines that have both functional and design keywords', () => {
    fc.assert(
      fc.property(
        specialIconBaseArb,
        functionalKeywordArb,
        designKeywordArb,
        (iconName, funcKw, designKw) => {
          // Line has both functional and design keywords - should be included
          const line = `${iconName}${funcKw}时有${designKw}表现`;
          const text = line;
          const result = identifySpecialIcons(text);

          const icon = result.find((r) => r.name === iconName);
          if (icon) {
            // Should be included because it has a functional keyword
            const hasFunc = icon.functions.some((f) => f.indexOf(funcKw) !== -1);
            expect(hasFunc).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 5: Feature boundary detection via header patterns
// ============================================================

describe('Property 5: Feature boundary detection via header patterns', () => {
  /**
   * Validates: Requirements 3.4, 3.5
   * For any document text containing lines matching known feature header patterns,
   * the Structural Parser SHALL detect each as a feature boundary.
   */
  it('detects English keyword headers as feature boundaries', () => {
    fc.assert(
      fc.property(featureKeywordArb, (keyword) => {
        // Pure English keyword line - should be a feature header
        expect(isFeatureHeader(keyword)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('detects Chinese markers as feature boundaries', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CHINESE_MARKERS), (marker) => {
        expect(isFeatureHeader(marker)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('detects lines ≤40 chars ending with "玩法" as feature boundaries', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 36 }).map((s) => s.replace(/\n/g, '').replace(/玩法/g, '')),
        (prefix) => {
          // Ensure total length ≤40 including "玩法" (2 chars)
          const trimmedPrefix = prefix.substring(0, 38);
          const line = trimmedPrefix + '玩法';
          if (line.length <= 40 && line.trim().length >= 2) {
            expect(isFeatureHeader(line)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects feature boundaries via detectFeatures with header lines', () => {
    fc.assert(
      fc.property(
        fc.array(featureKeywordArb, { minLength: 1, maxLength: 5 }),
        (keywords) => {
          // Each keyword on its own line should create a feature boundary
          const lines = [];
          for (const kw of keywords) {
            lines.push(kw);
            lines.push('some content line below');
          }
          const features = detectFeatures(lines);

          // Should detect at least one feature for each unique keyword
          expect(features.length).toBeGreaterThan(0);
          // Feature count should not exceed input keyword count
          expect(features.length).toBeLessThanOrEqual(keywords.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// Property 6: WILD default substitution rule generation
// ============================================================

describe('Property 6: WILD default substitution rule generation', () => {
  /**
   * Validates: Requirements 3.6, 3.7
   * For any set of special icons where WILD exists but has no explicit substitution
   * rule in its functional descriptions, the Structural Parser SHALL generate a default
   * substitution rule that lists all non-WILD special icons as exclusions.
   */
  it('generates default rule when WILD has no substitution rule', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('SCATTER'),
            fc.constant('BONUS'),
            fc.constant('LINK'),
            fc.constant('BONUS1'),
            fc.constant('BONUS2'),
            fc.constant('SCATTER1'),
            fc.constant('LINK1')
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (otherIcons) => {
          // Unique set of other icons
          const uniqueOthers = [...new Set(otherIcons)];
          const specialIcons = [
            { name: 'WILD', functions: [] }, // No substitution rule
            ...uniqueOthers.map((name) => ({ name, functions: [] })),
          ];

          const result = generateWildDefault(specialIcons);

          // Should generate a default rule
          expect(result).not.toBe('');
          expect(result.indexOf('WILD替代')).toBe(0);

          // All non-WILD icons should be listed as exclusions
          for (const iconName of uniqueOthers) {
            expect(result).toContain(iconName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does NOT generate default rule when WILD already has substitution rule', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('SCATTER', 'BONUS', 'LINK'), { minLength: 0, maxLength: 3 }),
        (otherIcons) => {
          const specialIcons = [
            { name: 'WILD', functions: ['WILD替代除SCATTER外的所有图标'] }, // Has 替代 rule
            ...otherIcons.map((name) => ({ name, functions: [] })),
          ];

          const result = generateWildDefault(specialIcons);

          // Should NOT generate a default rule
          expect(result).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty string when no WILD icon exists', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('SCATTER', 'BONUS', 'LINK'), { minLength: 1, maxLength: 4 }),
        (icons) => {
          const specialIcons = icons.map((name) => ({ name, functions: [] }));

          const result = generateWildDefault(specialIcons);
          expect(result).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generates "WILD替代所有图标" when WILD is the only icon', () => {
    const specialIcons = [{ name: 'WILD', functions: [] }];
    const result = generateWildDefault(specialIcons);
    expect(result).toBe('WILD替代所有图标');
  });
});

// ============================================================
// Property 17: Payout value detection
// ============================================================

describe('Property 17: Payout value detection', () => {
  /**
   * Validates: Requirements 2.6, 3.9
   * For any document text, the `hasPayoutValues` flag SHALL be `true` if and only if
   * the text contains at least one numeric payout pattern matching digit-dash-digit
   * sequences (e.g., "5-250", "3-20") associated with symbol references.
   */
  it('sets hasPayoutValues=true when digit-dash-digit pattern exists', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 999 }),
        fc.string({ minLength: 0, maxLength: 30 }).map((s) => s.replace(/\n/g, '')),
        (count, value, context) => {
          const line = `${context} H1 ${count}-${value} ${context}`;
          const result = parse([line]);
          expect(result.hasPayoutValues).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sets hasPayoutValues=false when no digit-dash-digit pattern exists', () => {
    fc.assert(
      fc.property(
        // Generate strings that don't contain digit-dash-digit patterns
        fc.string({ minLength: 0, maxLength: 50 }).filter((s) => {
          return !/\d+[\-\u2013\u2014]\d+/.test(s);
        }),
        (text) => {
          const result = parse([text]);
          expect(result.hasPayoutValues).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects en-dash and em-dash payout patterns', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 999 }),
        fc.constantFrom('-', '\u2013', '\u2014'), // hyphen, en-dash, em-dash
        (count, value, dash) => {
          const line = `H1 ${count}${dash}${value}`;
          const result = parse([line]);
          expect(result.hasPayoutValues).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
