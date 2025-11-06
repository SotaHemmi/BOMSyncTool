/**
 * ベンチマーク用の大量データ生成スクリプト
 *
 * 使い方:
 *   node scripts/generate-benchmark-data.js
 *
 * 生成されるファイル（BOMSyncToolDev/tests/benchmark-data 配下）:
 *   - bom-100.csv (100行)
 *   - bom-1000.csv (1,000行)
 *   - bom-10000.csv (10,000行)
 *   - dictionary-registrations.csv / dictionary-exceptions.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 出力ディレクトリ
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'tests', 'benchmark-data');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * BOMデータを生成
 */
function generateBOM(rowCount, filename) {
  const headers = ['ref', 'part_no', 'qty', 'description', 'manufacturer', 'datasheet'];
  const rows = [headers.join(',')];

  const manufacturers = ['TI', 'Analog Devices', 'NXP', 'ST', 'Microchip', 'Infineon', 'Renesas'];
  const prefixes = ['R', 'C', 'L', 'U', 'D', 'Q', 'J', 'SW'];
  const descriptions = [
    'Resistor SMD',
    'Capacitor Ceramic',
    'Capacitor Electrolytic',
    'IC Voltage Regulator',
    'IC Operational Amplifier',
    'Diode Schottky',
    'Transistor NPN',
    'Connector Header',
  ];

  for (let i = 1; i <= rowCount; i++) {
    const prefix = prefixes[i % prefixes.length];
    const ref = `${prefix}${i}`;
    const partNo = `PN${(i % 500) + 1000}`;
    const qty = Math.floor(Math.random() * 100) + 1;
    const description = descriptions[i % descriptions.length];
    const manufacturer = manufacturers[i % manufacturers.length];
    const datasheet = `https://example.com/datasheet/${partNo}.pdf`;

    rows.push([
      ref,
      partNo,
      qty,
      `"${description}"`,
      `"${manufacturer}"`,
      datasheet,
    ].join(','));
  }

  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, rows.join('\n'), 'utf8');
  console.log(`✓ Generated: ${filepath} (${rowCount} rows)`);
}

/**
 * 辞書データを生成
 */
function generateDictionary() {
  // 通常の登録（part_no ベース）
  const registrations = [
    'part_no,registration_name',
  ];

  for (let i = 1000; i <= 1500; i++) {
    const partNo = `PN${i}`;
    const registrationName = `登録名_${i}`;
    registrations.push(`${partNo},${registrationName}`);
  }

  const registrationsPath = path.join(OUTPUT_DIR, 'dictionary-registrations.csv');
  fs.writeFileSync(registrationsPath, registrations.join('\n'), 'utf8');
  console.log(`✓ Generated: ${registrationsPath} (${registrations.length - 1} registrations)`);

  // 例外（ref + part_no ベース）
  const exceptions = [
    'ref,part_no,registration_name',
  ];

  for (let i = 1; i <= 50; i++) {
    const prefix = ['R', 'C', 'L', 'U'][i % 4];
    const ref = `${prefix}${i}`;
    const partNo = `PN${1000 + (i % 100)}`;
    const registrationName = `例外登録名_${i}`;
    exceptions.push(`${ref},${partNo},${registrationName}`);
  }

  const exceptionsPath = path.join(OUTPUT_DIR, 'dictionary-exceptions.csv');
  fs.writeFileSync(exceptionsPath, exceptions.join('\n'), 'utf8');
  console.log(`✓ Generated: ${exceptionsPath} (${exceptions.length - 1} exceptions)`);
}

/**
 * README.md を生成
 */
function generateReadme() {
  const readme = `# ベンチマークデータ

このディレクトリには、BOMSyncToolのパフォーマンステスト用のサンプルデータが含まれています。

## ファイル一覧

### BOMファイル

- **bom-100.csv**: 100行のBOMデータ（小規模テスト用）
- **bom-1000.csv**: 1,000行のBOMデータ（中規模テスト用）
- **bom-10000.csv**: 10,000行のBOMデータ（大規模テスト用）

### 辞書ファイル

- **dictionary-registrations.csv**: 通常の登録データ（500件）
- **dictionary-exceptions.csv**: 例外登録データ（50件）

## データ形式

### BOMファイル形式

\`\`\`csv
ref,part_no,qty,description,manufacturer,datasheet
R1,PN1000,10,"Resistor SMD","TI",https://example.com/datasheet/PN1000.pdf
C2,PN1001,5,"Capacitor Ceramic","Analog Devices",https://example.com/datasheet/PN1001.pdf
...
\`\`\`

### 辞書ファイル形式

**dictionary-registrations.csv**:
\`\`\`csv
part_no,registration_name
PN1000,登録名_1000
PN1001,登録名_1001
...
\`\`\`

**dictionary-exceptions.csv**:
\`\`\`csv
ref,part_no,registration_name
R1,PN1000,例外登録名_1
C2,PN1001,例外登録名_2
...
\`\`\`

## 再生成方法

データを再生成する場合は、以下のコマンドを実行してください：

\`\`\`bash
node scripts/generate-benchmark-data.js
\`\`\`

## 使用方法

### パフォーマンステスト

1. BOMSyncToolを起動
2. ベンチマークデータを読み込み
3. Chrome DevTools の Performance タブで処理時間を測定
4. React DevTools の Profiler で再レンダリング回数を確認

### ベンチマーク例

\`\`\`bash
# Before版で測定
git checkout main
npm run tauri dev
# → bom-10000.csv を読み込み
# → dictionary-registrations.csv を読み込み
# → 辞書を適用
# → Console に表示された処理時間を記録

# After版で測定
git checkout phase2-perf
npm run tauri dev
# → 同じ操作を実施
# → 処理時間を比較
\`\`\`

---

**生成日**: ${new Date().toISOString().split('T')[0]}
**スクリプト**: scripts/generate-benchmark-data.js
`;

  const readmePath = path.join(OUTPUT_DIR, 'README.md');
  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log(`✓ Generated: ${readmePath}`);
}

/**
 * メイン処理
 */
function main() {
  console.log('Generating benchmark data...\n');

  // BOMデータ生成
  generateBOM(100, 'bom-100.csv');
  generateBOM(1000, 'bom-1000.csv');
  generateBOM(10000, 'bom-10000.csv');

  // 辞書データ生成
  generateDictionary();

  // README生成
  generateReadme();

  console.log('\n✓ All benchmark data generated successfully!');
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

// 実行
main();
