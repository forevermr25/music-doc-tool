const path = require('path');
const fs = require('fs');
const ExcelJS = require('d:\\工作\\game\\配音生成\\node_modules\\exceljs');

const SOURCE_DIR = 'd:\\工作\\game\\玩法文档';
const OUTPUT_FILE = 'd:\\工作\\game\\music-doc-tool\\data\\feature_names.json';

// Patterns for identifying gameplay section headers
const FEATURE_KEYWORDS = [
  'FREE GAMES', 'RESPIN', 'WHEEL', 'PICK', 'LINK', 'JACKPOT', 
  'BONUS', 'SUPER', 'BUFF', 'BASE', 'SCATTER', 'WILD',
  'COLLECT', 'TRIGGER', 'EXPAND', 'STACK', 'CASCADE', 'HOLD',
  'SPIN', 'MULTIPLIER', 'PROGRESSIVE'
];

function isFeatureHeader(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 50) return false;
  
  // Match lines ending with 玩法 or 玩法： or 玩法:
  if (/玩法[：:]?\s*$/.test(trimmed)) return true;
  
  // Match "玩法组合" line
  if (trimmed.includes('玩法组合')) return true;
  
  // Match lines containing 触发条件
  if (trimmed.includes('触发条件')) return true;
  
  // Match English feature keywords (case insensitive)
  const upper = trimmed.toUpperCase();
  for (const kw of FEATURE_KEYWORDS) {
    if (upper.includes(kw)) {
      // Make sure it looks like a header, not a long description
      if (trimmed.length < 50) return true;
    }
  }
  
  // Match patterns like "XXX玩法" anywhere in text
  if (/[\w\u4e00-\u9fff]+玩法/.test(trimmed) && trimmed.length < 50) return true;
  
  return false;
}

function extractFeatureName(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  
  // Remove trailing colons and whitespace
  return trimmed.replace(/[：:]\s*$/, '').trim();
}

function isComboLine(text) {
  if (!text || typeof text !== 'string') return false;
  return text.trim().includes('玩法组合');
}

function getComboValue(row, cellIndex, worksheet) {
  // The combo value might be in the same cell after "玩法组合", or in the next cell
  const text = row.getCell(cellIndex).text || '';
  const match = text.match(/玩法组合[：:]\s*(.+)/);
  if (match) return match[1].trim();
  
  // Check next cells in the row
  for (let i = cellIndex + 1; i <= row.cellCount; i++) {
    const val = row.getCell(i).text;
    if (val && val.trim().length > 0) return val.trim();
  }
  return null;
}

async function processFile(filePath) {
  const fileName = path.basename(filePath);
  const features = new Set();
  let combo = null;
  
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    workbook.eachSheet((worksheet) => {
      worksheet.eachRow((row) => {
        row.eachCell((cell, colNumber) => {
          let cellText = '';
          if (cell.value) {
            if (typeof cell.value === 'string') {
              cellText = cell.value;
            } else if (cell.value.richText) {
              cellText = cell.value.richText.map(r => r.text || '').join('');
            } else if (typeof cell.value === 'object' && cell.value.text) {
              cellText = cell.value.text;
            } else {
              cellText = String(cell.value);
            }
          }
          
          if (!cellText || cellText.trim().length === 0) return;
          
          // Check for combo line
          if (isComboLine(cellText)) {
            const comboMatch = cellText.match(/玩法组合[：:]\s*(.+)/);
            if (comboMatch) {
              combo = comboMatch[1].trim();
            } else {
              // Look in next cells
              for (let i = colNumber + 1; i <= row.cellCount; i++) {
                const nextCell = row.getCell(i);
                let nextText = '';
                if (nextCell.value) {
                  if (typeof nextCell.value === 'string') {
                    nextText = nextCell.value;
                  } else if (nextCell.value.richText) {
                    nextText = nextCell.value.richText.map(r => r.text || '').join('');
                  } else if (typeof nextCell.value === 'object' && nextCell.value.text) {
                    nextText = nextCell.value.text;
                  } else {
                    nextText = String(nextCell.value);
                  }
                }
                if (nextText && nextText.trim().length > 0 && !nextText.includes('玩法组合')) {
                  combo = nextText.trim();
                  break;
                }
              }
            }
          }
          
          // Check for feature headers
          if (isFeatureHeader(cellText)) {
            const name = extractFeatureName(cellText);
            if (name && !name.includes('触发条件') && name !== '玩法组合') {
              // Clean up - remove "玩法组合" prefix if present
              features.add(name);
            }
            // If it contains 触发条件, try to extract what feature it belongs to
            if (cellText.includes('触发条件')) {
              const triggerMatch = cellText.match(/(.+?)触发条件/);
              if (triggerMatch && triggerMatch[1].trim().length > 0) {
                features.add(triggerMatch[1].trim());
              }
            }
          }
        });
      });
    });
  } catch (err) {
    console.error(`Error reading ${fileName}: ${err.message}`);
  }
  
  return {
    name: fileName,
    features: Array.from(features).sort(),
    combo: combo
  };
}

async function main() {
  console.log('Scanning directory:', SOURCE_DIR);
  
  // Get all xlsx files (skip temp files starting with ~$)
  const files = fs.readdirSync(SOURCE_DIR)
    .filter(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'));
  
  console.log(`Found ${files.length} Excel files\n`);
  
  const documents = [];
  const allFeatures = new Set();
  const allCombos = new Set();
  
  for (const file of files) {
    const filePath = path.join(SOURCE_DIR, file);
    console.log(`Processing: ${file}`);
    
    // Skip .xls files (exceljs doesn't support old format)
    if (file.endsWith('.xls') && !file.endsWith('.xlsx')) {
      console.log(`  Skipping (old .xls format not supported by exceljs)`);
      documents.push({ name: file, features: [], combo: null });
      continue;
    }
    
    const result = await processFile(filePath);
    documents.push(result);
    
    result.features.forEach(f => allFeatures.add(f));
    if (result.combo) {
      allCombos.add(result.combo);
    }
    
    if (result.features.length > 0) {
      console.log(`  Features: ${result.features.join(', ')}`);
    }
    if (result.combo) {
      console.log(`  Combo: ${result.combo}`);
    }
  }
  
  const output = {
    featureNames: Array.from(allFeatures).sort(),
    combos: Array.from(allCombos).sort(),
    documents: documents
  };
  
  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log('\n========== SUMMARY ==========');
  console.log(`Total documents processed: ${documents.length}`);
  console.log(`Total unique features found: ${output.featureNames.length}`);
  console.log(`Total unique combos found: ${output.combos.length}`);
  console.log('\nAll unique feature names:');
  output.featureNames.forEach(f => console.log(`  - ${f}`));
  console.log('\nAll combos:');
  output.combos.forEach(c => console.log(`  - ${c}`));
  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
