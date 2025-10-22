# アーキテクチャドキュメント

BOMSyncToolの設計思想、アーキテクチャ、主要コンポーネントについて説明します。

## 📐 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                     フロントエンド                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  UI Layer   │  │  State Mgmt │  │   Storage   │   │
│  │ (HTML/CSS)  │←→│(TypeScript) │←→│(localStorage)│   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│         ↓                ↓                              │
│    ┌────────────────────────────────┐                  │
│    │      Tauri IPC Bridge          │                  │
│    └────────────────────────────────┘                  │
└───────────────────┬─────────────────────────────────────┘
                    │ IPC (JSON-RPC)
┌───────────────────┴─────────────────────────────────────┐
│                    バックエンド (Rust)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │  Parsers   │  │ Processors │  │ Exporters  │       │
│  │  (入力)     │→ │ (処理)      │→ │  (出力)     │       │
│  └────────────┘  └────────────┘  └────────────┘       │
│         ↓                ↓                ↓              │
│    ┌─────────────────────────────────────┐             │
│    │          Models (共通データ構造)      │             │
│    └─────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

## 🏗️ レイヤー構成

### フロントエンド（TypeScript）

#### 1. UI Layer（プレゼンテーション層）
**責務**: ユーザーインターフェースの表示と基本的なイベント処理

**主要コンポーネント:**
- `index.html`: DOM構造の定義
- `src/styles.css`: スタイルシート
- イベントハンドラー登録関数群

**ファイル:**
- `index.html` (718行)
- `src/styles.css` (1,710行)

#### 2. Application Layer（アプリケーション層）
**責務**: ビジネスロジック、状態管理、Tauri IPC呼び出し

**主要機能モジュール:**

**a. データ管理**
- `datasetState`: BOM A/Bの状態管理
- `currentDiffs`: 差分結果の保持
- `mergedBom`: マージ結果の保持
- `editModalState`: 編集モーダルの状態

**b. プロジェクト管理**
- `activeProjectId`: 現在のプロジェクトID
- `getStoredProjects()`: プロジェクト一覧取得
- `saveStoredProjects()`: プロジェクト保存
- `renderProjectTabs()`: タブUI描画

**c. 辞書管理**
- `dictionaryState`: 登録名リスト・特定部品の状態
- `renderRegistrationTable()`: 登録名テーブル描画
- `applyRegistrationToBOM()`: BOMへの適用

**d. 前処理パイプライン**
- `preprocessBlocks`: ブロックの配列
- `renderPreprocessPipeline()`: パイプラインUI描画
- `applyPreprocessPipeline()`: パイプライン実行

**ファイル:**
- `src/main.ts` (3,543行) - **要モジュール分割**

#### 3. Storage Layer（永続化層）
**責務**: データの永続化

**使用技術:**
- `localStorage`: ブラウザローカルストレージ
  - プロジェクトデータ
  - 辞書データ
  - 前処理ブロック設定
  - お気に入り情報

### バックエンド（Rust）

#### 1. API Layer（IPC エンドポイント）
**責務**: フロントエンドからのリクエスト受付

**主要コマンド:**
- `parse_bom_file`: BOMファイル解析
- `compare_boms`: BOM比較
- `merge_boms`: BOMマージ
- `expand_reference`: Reference展開
- `split_reference_rows`: Reference分割
- `fill_blank_cells`: 空欄補完
- `cleanse_text_data`: テキストクリーニング
- `save_session_to_file`: ファイル保存
- `load_session_from_file`: ファイル読み込み

**ファイル:**
- `src-tauri/src/lib.rs`

#### 2. Parser Layer（解析層）
**責務**: 各種フォーマットのBOMファイルを解析し、共通データ構造に変換

**パーサー:**
- **CSV Parser** (`parsers/csv.rs`):
  - カンマ区切りファイルの解析
  - ヘッダー自動検出
- **Excel Parser** (`parsers/excel.rs`):
  - .xlsx ファイルの解析
  - calamine crateを使用
- **CAD Parser** (`parsers/cad.rs`):
  - PADS-ECO形式（`*PADS-ECO*` `*PART*`セクション）
  - MSF SHAPE形式（`$MSF { SHAPE { ... } }`）
  - CCF DEFINITION形式（`$CCF { DEFINITION { ... } }`）
  - 逆構造（Part_No → Refs[]）のパース

**ファイル:**
- `src-tauri/src/parsers/mod.rs`
- `src-tauri/src/parsers/csv.rs`
- `src-tauri/src/parsers/excel.rs`
- `src-tauri/src/parsers/cad.rs`
- `src-tauri/src/parsers/builder.rs`

#### 3. Processor Layer（処理層）
**責務**: BOMデータの変換・クレンジング・検証

**プロセッサー:**
- **Reference Processor** (`processors/reference.rs`):
  - Reference展開: `C1,C2,C3` → 3行に分割
  - Reference分割: 1行複数Ref → 複数行
- **Cleaner** (`processors/cleaner.rs`):
  - テキストクリーニング
  - 不要な空白削除
  - 特殊文字の正規化
- **Formatter** (`processors/formatter.rs`):
  - 書式の統一
  - データ整形
- **Validator** (`processors/validator.rs`):
  - データ検証
  - エラー検出

**ファイル:**
- `src-tauri/src/processors/mod.rs`
- `src-tauri/src/processors/reference.rs`
- `src-tauri/src/processors/cleaner.rs`
- `src-tauri/src/processors/formatter.rs`
- `src-tauri/src/processors/validator.rs`

#### 4. Diff Layer（差分比較層）
**責務**: 2つのBOMの差分を検出し、マージ

**コンポーネント:**
- **Comparator** (`diff/compare.rs`):
  - Ref ベースでの行マッチング
  - 差分の分類（追加/削除/変更/一致）
- **Merger** (`diff/merge.rs`):
  - マージ戦略の実装
  - 優先順位に基づく統合

**ファイル:**
- `src-tauri/src/diff/mod.rs`
- `src-tauri/src/diff/compare.rs`
- `src-tauri/src/diff/merge.rs`

#### 5. Exporter Layer（出力層）
**責務**: 共通データ構造を各種フォーマットに変換して出力

**エクスポーター:**
- **CSV Exporter** (`exporters/csv.rs`):
  - CSV形式での出力
- **CAD Exporter** (`exporters/cad.rs`):
  - PADS-ECO形式（`*PART*`セクション）
  - CCF DEFINITION形式（`DEFINITION { ... }`）
  - MSF SHAPE形式（`SHAPE { ... }`）
  - 逆構造（Ref[] → Part_No）の生成

**ファイル:**
- `src-tauri/src/exporters/mod.rs`
- `src-tauri/src/exporters/csv.rs`
- `src-tauri/src/exporters/cad.rs`

#### 6. Utils Layer（ユーティリティ層）
**責務**: 共通処理・ヘルパー関数

**ユーティリティ:**
- **Header Detector** (`utils/header.rs`):
  - 列名の自動検出
  - 3段階マッチング（完全一致→部分一致→日本語）
  - Ref, Part_No, Value, Comment, Manufacturerの検出
- **Text Utils** (`utils/text.rs`):
  - テキスト正規化
  - 文字列処理

**ファイル:**
- `src-tauri/src/utils/mod.rs`
- `src-tauri/src/utils/header.rs`
- `src-tauri/src/utils/text.rs`

#### 7. Model Layer（データモデル層）
**責務**: 共通データ構造の定義

**主要モデル:**
```rust
pub struct BomRow {
    pub ref_: String,           // 部品番号
    pub part_no: String,        // 部品型番
    pub value: String,          // 値
    pub comment: String,        // コメント
    pub attributes: HashMap<String, String>, // その他の属性
}

pub struct ParseResult {
    pub bom_data: Vec<BomRow>,              // BOMデータ
    pub guessed_columns: Option<HashMap<String, usize>>, // 列マッピング
    pub errors: Vec<String>,                // エラーリスト
    pub headers: Option<Vec<String>>,       // ヘッダー
    pub row_numbers: Option<Vec<usize>>,    // 行番号
    pub structured_errors: Option<Vec<ParseError>>, // 構造化エラー
}

pub struct DiffRow {
    pub status: String,         // "added" | "removed" | "modified" | "unchanged"
    pub a: Option<BomRow>,      // BOM Aの行
    pub b: Option<BomRow>,      // BOM Bの行
}
```

**ファイル:**
- `src-tauri/src/models.rs`

## 🔄 データフロー

### 1. BOMファイル読み込みフロー

```
User Action (ファイル選択/D&D)
    ↓
onDropzoneFileSelected() [TypeScript]
    ↓
loadBomFile() [TypeScript]
    ↓
invoke('parse_bom_file', { path }) [Tauri IPC]
    ↓
parse_bom_file() [Rust]
    ↓
┌─ Format Detection (拡張子判定)
│
├─ CSV → CsvParser::parse()
├─ XLSX → ExcelParser::parse()
└─ CAD → CadParser::parse()
        ↓
    ParseResult { bom_data, headers, errors, ... }
        ↓
    [Tauri IPC Response]
        ↓
datasetState.parseResult = result [TypeScript]
    ↓
updatePreviewCard() / renderPreviewTable()
    ↓
UI更新
```

### 2. BOM比較フロー

```
User Action (「比較を実行」クリック)
    ↓
runCompare() [TypeScript]
    ↓
invoke('compare_boms', { bomA, bomB, ... }) [Tauri IPC]
    ↓
compare_boms() [Rust]
    ↓
Comparator::compare(bomA, bomB)
    ↓
┌─ Ref ベースでマッチング
├─ 差分の分類（added/removed/modified/unchanged）
└─ DiffRow の配列を生成
        ↓
    Vec<DiffRow>
        ↓
    [Tauri IPC Response]
        ↓
currentDiffs = diffs [TypeScript]
    ↓
renderDiffTable() / updateResultsSummary()
    ↓
UI更新（色分け表示）
```

### 3. 前処理パイプライン実行フロー

```
User Action (「前処理を適用」クリック)
    ↓
applyPreprocessPipeline() [TypeScript]
    ↓
for each enabled block:
    ↓
    invoke(block.type, { rows/bom }) [Tauri IPC]
    ↓
    ┌─ expand_reference → expand_reference()
    ├─ split_reference_rows → split_reference_rows()
    ├─ fill_blank_cells → fill_blank_cells()
    ├─ cleanse_text_data → cleanse_text_data()
    └─ apply_format_rules → apply_format_rules()
            ↓
        Processor処理
            ↓
        Vec<BomRow> (処理後)
            ↓
    rows = 処理結果
    ↓
editModalState.workingRows = rows
    ↓
renderEditTable()
    ↓
UI更新
```

### 4. CADネットリスト出力フロー

```
User Action (「ECO/CCF/MSF出力」クリック)
    ↓
exportToECO/CCF/MSF() [TypeScript]
    ↓
groupByPartNo(bomData) → Map<PartNo, Refs[]>
    ↓
formatToECO/CCF/MSF(grouped)
    ↓
invoke('save_session_to_file', { path, content })
    ↓
save_session_to_file() [Rust]
    ↓
fs::write(path, content)
    ↓
ファイル保存完了
```

## 🔑 主要な設計決定

### 1. なぜVanilla TypeScript？
- **理由**: シンプルさと学習コストの低さ
- **トレードオフ**: 大規模化すると保守性が低下（現在の課題）
- **今後の方針**: モジュール分割で緩和

### 2. なぜRust？
- **理由**:
  - Tauriがサポート
  - 高速なファイル処理
  - 型安全性
  - メモリ安全性
- **利点**: パフォーマンス、クロスプラットフォーム対応

### 3. なぜlocalStorage？
- **理由**:
  - シンプルな実装
  - サーバー不要
  - クライアントサイドで完結
- **制約**:
  - データサイズ制限（通常5MB）
  - プロジェクトを多く保存すると容量不足の可能性

### 4. IPC通信の設計
- **同期 vs 非同期**: 全て非同期（`invoke`）
- **データ形式**: JSON
- **エラーハンドリング**: Result型をJSONに変換して返却

## 📊 パフォーマンス考慮事項

### ボトルネック

1. **大規模BOMの解析** (10,000行以上):
   - ファイルI/O
   - メモリ消費
   - 差分計算の複雑度: O(n²)

2. **UI描画**:
   - 大量のDOM操作
   - テーブルレンダリング

### 最適化戦略

- **Rust側**:
  - イテレータの活用
  - 不要なクローンの削減
  - 並列処理の検討（rayon）
- **TypeScript側**:
  - 仮想スクロールの検討
  - DOM操作の最小化
  - デバウンス/スロットルの適用

## 🚧 技術的負債

### 現在の問題点

1. **モノリシックな main.ts** (3,543行)
   - 機能が全て1ファイルに集約
   - 保守性・可読性が低い

2. **テストの欠如**
   - 単体テストなし
   - リファクタリングが危険

3. **型定義の散在**
   - 再利用困難
   - 一貫性の欠如

4. **ドキュメントコメント不足**
   - JSDoc/rustdocが少ない

### 改善計画

1. **main.tsのモジュール分割** (優先度: 高)
2. **テストの追加** (優先度: 高)
3. **型定義の分離** (優先度: 中)
4. **コメントの追加** (優先度: 中)

## 📚 参考資料

- [Tauri Documentation](https://tauri.app/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
