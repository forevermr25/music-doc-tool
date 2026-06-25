/**
 * Structural Parser - Extracted from paytable/index.html for testability.
 * These are the core parsing functions used by the Paytable Doc Generator.
 */

// ============================================================
// Constants
// ============================================================

const NON_VISIBLE_KEYWORDS = ['断线重连', '概率', '权重', 'RTP', '触发概率', '美术说明', '美术描述', '动画说明'];

const FEATURE_KEYWORDS_EN = ['BASE', 'FG', 'FREE', 'RESPIN', 'WHEEL', 'PICK', 'LINK', 'JACKPOT', 'BONUS', 'SUPER', 'BUFF', 'WILD', 'SCATTER', 'MEGA'];

const CHINESE_MARKERS = ['触发条件', '玩法说明', '结束条件'];

const REWARD_KEYWORDS = ['COIN', 'GRAND', 'MAJOR', 'MINOR', 'MINI', 'FREE GAME', 'FREE SPIN', 'RESPIN', 'FEATURE', '奖金', '奖池', '倍数', '乘倍'];

// ============================================================
// Helper Functions
// ============================================================

function isNonVisibleContent(line) {
  if (!line) return false;
  var upper = line.toUpperCase();
  for (var i = 0; i < NON_VISIBLE_KEYWORDS.length; i++) {
    if (upper.indexOf(NON_VISIBLE_KEYWORDS[i].toUpperCase()) !== -1) {
      return true;
    }
  }
  return false;
}

function hasFeatureKeywordEN(line) {
  for (var i = 0; i < FEATURE_KEYWORDS_EN.length; i++) {
    var keyword = FEATURE_KEYWORDS_EN[i];
    var regex = new RegExp('\\b' + keyword + '\\b', 'i');
    if (regex.test(line)) {
      return true;
    }
  }
  return false;
}

function hasChineseMarker(line) {
  for (var i = 0; i < CHINESE_MARKERS.length; i++) {
    if (line.indexOf(CHINESE_MARKERS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function hasRewardKeyword(line) {
  if (!line) return false;
  var upper = line.toUpperCase();
  for (var i = 0; i < REWARD_KEYWORDS.length; i++) {
    if (upper.indexOf(REWARD_KEYWORDS[i].toUpperCase()) !== -1) {
      return true;
    }
  }
  return false;
}

// ============================================================
// Feature Header Detection
// ============================================================

function isFeatureHeader(line) {
  if (!line) return false;
  var trimmed = line.trim();
  if (!trimmed) return false;

  // Check standalone Chinese markers (exact match)
  for (var i = 0; i < CHINESE_MARKERS.length; i++) {
    if (trimmed === CHINESE_MARKERS[i]) return true;
  }

  // Check ≤40 chars ending with "玩法"
  if (trimmed.length <= 40 && trimmed.length >= 2 && trimmed.indexOf('玩法') === trimmed.length - 2) {
    return true;
  }

  // Check English keywords with header heuristic
  if (hasFeatureKeywordEN(trimmed)) {
    var remaining = trimmed;
    for (var k = 0; k < FEATURE_KEYWORDS_EN.length; k++) {
      var kw = FEATURE_KEYWORDS_EN[k];
      var kwRegex = new RegExp('\\b' + kw + '\\b', 'gi');
      remaining = remaining.replace(kwRegex, '');
    }
    remaining = remaining.replace(/[\s\d]/g, '');

    var chineseRemaining = remaining.replace(/[^\u4e00-\u9fff]/g, '');

    var titleSuffixes = ['功能', '系统', '模式', '说明', '奖励', '特色', '阶段', '关卡'];
    var isTitleSuffix = false;
    for (var ts = 0; ts < titleSuffixes.length; ts++) {
      if (chineseRemaining === titleSuffixes[ts]) {
        isTitleSuffix = true;
        break;
      }
    }

    if (chineseRemaining.length === 0) {
      return true;
    }
    if (isTitleSuffix && trimmed.length <= 30) {
      return true;
    }
    if (chineseRemaining.length <= 2 && trimmed.length <= 20) {
      return true;
    }
    return false;
  }

  return false;
}

function isRecognizedFeatureHeader(header) {
  if (!header) return false;
  if (hasFeatureKeywordEN(header)) return true;
  for (var i = 0; i < CHINESE_MARKERS.length; i++) {
    if (header === CHINESE_MARKERS[i]) return true;
  }
  return false;
}

// ============================================================
// Special Icon Detection
// ============================================================

function identifySpecialIcons(text) {
  if (!text || typeof text !== 'string') return [];

  var lines = text.split('\n');

  var iconNamePattern = /\b(WILD|SCATTER|BONUS|LINK)\d*\b/gi;

  var iconNamesSet = {};
  var match;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    iconNamePattern.lastIndex = 0;
    while ((match = iconNamePattern.exec(line)) !== null) {
      var name = match[0].toUpperCase();
      iconNamesSet[name] = true;
    }
  }

  var iconNames = Object.keys(iconNamesSet);
  if (iconNames.length === 0) return [];

  // Deduplication: remove generic base name when numbered variants exist
  var baseNames = ['WILD', 'SCATTER', 'BONUS', 'LINK'];
  for (var b = 0; b < baseNames.length; b++) {
    var baseName = baseNames[b];
    var hasNumbered = false;
    for (var n = 0; n < iconNames.length; n++) {
      if (iconNames[n] !== baseName && iconNames[n].indexOf(baseName) === 0) {
        var suffix = iconNames[n].substring(baseName.length);
        if (/^\d+$/.test(suffix)) {
          hasNumbered = true;
          break;
        }
      }
    }
    if (hasNumbered) {
      var idx = iconNames.indexOf(baseName);
      if (idx !== -1) {
        iconNames.splice(idx, 1);
      }
    }
  }

  // Functional keywords
  var functionalKeywords = ['触发', '替代', '出现在', '携带', '收集', '落地'];
  var designKeywords = ['动画', '颜色', '设计', '美术', '超框'];

  function hasFunctionalKeyword(line) {
    for (var k = 0; k < functionalKeywords.length; k++) {
      if (line.indexOf(functionalKeywords[k]) !== -1) return true;
    }
    return false;
  }

  function hasDesignKeyword(line) {
    for (var k = 0; k < designKeywords.length; k++) {
      if (line.indexOf(designKeywords[k]) !== -1) return true;
    }
    return false;
  }

  function isFunctionalLine(line) {
    var hasFunctional = hasFunctionalKeyword(line);
    if (hasFunctional) return true;
    return false;
  }

  var results = [];
  for (var ic = 0; ic < iconNames.length; ic++) {
    var iconName = iconNames[ic];
    var functions = [];
    var iconRegex = new RegExp('\\b' + iconName + '\\b', 'i');

    for (var li = 0; li < lines.length; li++) {
      var currentLine = lines[li].trim();
      if (!currentLine) continue;
      if (iconRegex.test(currentLine)) {
        if (isFunctionalLine(currentLine)) {
          if (functions.indexOf(currentLine) === -1) {
            functions.push(currentLine);
          }
        }
      }
    }

    results.push({
      name: iconName,
      functions: functions
    });
  }

  return results;
}

// ============================================================
// WILD Default Substitution Rule
// ============================================================

function generateWildDefault(specialIcons) {
  if (!specialIcons || !Array.isArray(specialIcons) || specialIcons.length === 0) return '';

  var wildIcon = null;
  for (var i = 0; i < specialIcons.length; i++) {
    if (specialIcons[i].name === 'WILD') {
      wildIcon = specialIcons[i];
      break;
    }
  }

  if (!wildIcon) return '';

  var hasSubstitutionRule = false;
  for (var f = 0; f < wildIcon.functions.length; f++) {
    if (wildIcon.functions[f].indexOf('替代') !== -1) {
      hasSubstitutionRule = true;
      break;
    }
  }

  if (hasSubstitutionRule) return '';

  var exclusions = [];
  for (var j = 0; j < specialIcons.length; j++) {
    var name = specialIcons[j].name;
    if (name !== 'WILD' && name.indexOf('WILD') !== 0) {
      exclusions.push(name);
    }
  }

  if (exclusions.length === 0) {
    return 'WILD替代所有图标';
  }

  return 'WILD替代除' + exclusions.join('、') + '外的所有图标';
}

// ============================================================
// Normal Icon Detection
// ============================================================

function identifyNormalIcons(text) {
  if (!text || typeof text !== 'string') return [];

  var pattern = /\b([HL]\d+)\b/g;
  var found = {};
  var match;

  while ((match = pattern.exec(text)) !== null) {
    var name = match[1].toUpperCase();
    found[name] = true;
  }

  var patternLower = /\b([hHlL]\d+)\b/g;
  while ((match = patternLower.exec(text)) !== null) {
    var nameLower = match[1].toUpperCase();
    found[nameLower] = true;
  }

  var icons = Object.keys(found);

  icons.sort(function(a, b) {
    var aType = a.charAt(0);
    var bType = b.charAt(0);
    if (aType !== bType) {
      return aType === 'H' ? -1 : 1;
    }
    var aNum = parseInt(a.substring(1), 10);
    var bNum = parseInt(b.substring(1), 10);
    return aNum - bNum;
  });

  return icons;
}

// ============================================================
// Feature Detection
// ============================================================

function detectFeatures(lines) {
  if (!lines || !Array.isArray(lines) || lines.length === 0) return [];

  var visibleLines = [];
  var inNonVisibleSection = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = (typeof line === 'string') ? line.trim() : '';

    if (isNonVisibleContent(trimmed)) {
      inNonVisibleSection = true;
      continue;
    }

    if (inNonVisibleSection && isFeatureHeader(trimmed) && !isNonVisibleContent(trimmed)) {
      inNonVisibleSection = false;
    }

    if (!inNonVisibleSection && trimmed) {
      visibleLines.push(trimmed);
    }
  }

  var features = [];
  var currentFeature = null;

  for (var j = 0; j < visibleLines.length; j++) {
    var currentLine = visibleLines[j];

    if (isFeatureHeader(currentLine)) {
      var isSubSection = false;
      if (currentFeature) {
        if (currentLine === '触发条件' || currentLine === '玩法说明' || currentLine === '结束条件') {
          isSubSection = true;
        }
        for (var cm = 0; cm < CHINESE_MARKERS.length; cm++) {
          if (currentLine === CHINESE_MARKERS[cm]) {
            isSubSection = true;
            break;
          }
        }
      }

      if (!isSubSection) {
        if (currentFeature) {
          features.push(currentFeature);
        }

        var unrecognized = !isRecognizedFeatureHeader(currentLine);

        currentFeature = {
          name: currentLine,
          trigger: '',
          rules: [],
          endCondition: '',
          wheelRewards: []
        };

        if (unrecognized) {
          currentFeature.unrecognized = true;
        }
      } else {
        currentFeature._currentSection = currentLine;
      }
    } else if (currentFeature) {
      var section = currentFeature._currentSection || '';

      if (section === '触发条件') {
        if (currentFeature.trigger) {
          currentFeature.trigger += '\n' + currentLine;
        } else {
          currentFeature.trigger = currentLine;
        }
      } else if (section === '结束条件') {
        if (currentFeature.endCondition) {
          currentFeature.endCondition += '\n' + currentLine;
        } else {
          currentFeature.endCondition = currentLine;
        }
      } else if (section === '玩法说明') {
        currentFeature.rules.push(currentLine);
      } else {
        currentFeature.rules.push(currentLine);
      }

      if (hasRewardKeyword(currentLine)) {
        currentFeature.wheelRewards.push(currentLine);
      }
    }
  }

  if (currentFeature) {
    features.push(currentFeature);
  }

  for (var f = 0; f < features.length; f++) {
    delete features[f]._currentSection;
  }

  return features;
}

// ============================================================
// Main Parse Function
// ============================================================

function parse(allLines) {
  var lines = (allLines && Array.isArray(allLines)) ? allLines : [];
  var text = lines.join('\n');

  var specialIcons = identifySpecialIcons(text);

  var wildDefault = generateWildDefault(specialIcons);
  if (wildDefault) {
    for (var w = 0; w < specialIcons.length; w++) {
      if (specialIcons[w].name === 'WILD') {
        specialIcons[w].functions.push(wildDefault);
        break;
      }
    }
  }

  var normalIcons = identifyNormalIcons(text);
  var features = detectFeatures(lines);

  var payoutPattern = /\d+[\-\u2013\u2014]\d+/;
  var hasPayoutValues = payoutPattern.test(text);

  var iconRelations = [];
  var specialIconNames = [];
  for (var si = 0; si < specialIcons.length; si++) {
    specialIconNames.push(specialIcons[si].name);
  }

  var relationSeparators = ['→', '->', '\\.\\.+', '对应', '连接', '关联'];
  var sepPatternStr = '(?:' + relationSeparators.join('|') + ')';

  for (var ri = 0; ri < lines.length; ri++) {
    var rLine = lines[ri];
    if (!rLine) continue;

    for (var sn = 0; sn < specialIconNames.length; sn++) {
      var iconName = specialIconNames[sn];
      var relRegex = new RegExp(iconName + '\\s*' + sepPatternStr + '\\s*([^\\s,，。.;；]+)', 'i');
      var relMatch = rLine.match(relRegex);
      if (relMatch && relMatch[1]) {
        var target = relMatch[1].trim();
        var isDuplicate = false;
        for (var dr = 0; dr < iconRelations.length; dr++) {
          if (iconRelations[dr].icon === iconName && iconRelations[dr].target === target) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          iconRelations.push({
            icon: iconName,
            target: target
          });
        }
      }
    }
  }

  var jackpotTiers = ['GRAND', 'MAJOR', 'MINOR', 'MINI'];
  var jackpots = [];
  var upperText = text.toUpperCase();
  for (var jt = 0; jt < jackpotTiers.length; jt++) {
    var tier = jackpotTiers[jt];
    var tierRegex = new RegExp('\\b' + tier + '\\b');
    if (tierRegex.test(upperText)) {
      jackpots.push(tier);
    }
  }

  var combo = '';
  var hasBase = false;
  var hasFG = false;
  var hasRespin = false;
  var hasLink = false;
  var featureCount = 0;

  for (var fc = 0; fc < features.length; fc++) {
    var fName = features[fc].name.toUpperCase();
    if (/\bBASE\b/.test(fName)) hasBase = true;
    if (/\bFG\b|\bFREE\b/.test(fName)) hasFG = true;
    if (/\bRESPIN\b/.test(fName)) hasRespin = true;
    if (/\bLINK\b/.test(fName)) hasLink = true;
    featureCount++;
  }

  if (hasBase && hasFG && hasLink) {
    combo = 'base+fg+link';
  } else if (hasBase && hasFG && hasRespin) {
    combo = 'base+fg+respin';
  } else if (hasBase && hasFG) {
    combo = 'base+fg';
  } else if (hasBase && hasRespin) {
    combo = 'base+respin';
  } else if (hasBase && hasLink) {
    combo = 'base+link';
  } else if (featureCount > 1) {
    combo = featureCount + '+1';
  } else if (featureCount === 1) {
    combo = 'base';
  }

  return {
    combo: combo,
    jackpots: jackpots,
    specialIcons: specialIcons,
    normalIcons: normalIcons,
    features: features,
    iconRelations: iconRelations,
    hasPayoutValues: hasPayoutValues
  };
}

// ============================================================
// Exports
// ============================================================

export {
  parse,
  identifySpecialIcons,
  identifyNormalIcons,
  detectFeatures,
  generateWildDefault,
  isFeatureHeader,
  isNonVisibleContent,
  hasFeatureKeywordEN,
  hasChineseMarker,
  hasRewardKeyword,
  isRecognizedFeatureHeader,
  FEATURE_KEYWORDS_EN,
  CHINESE_MARKERS,
  NON_VISIBLE_KEYWORDS,
  REWARD_KEYWORDS
};
