# BOMSyncTool 軽量化修正 作業計画書

**作成日:** 2025-11-04
**対象バージョン:** 0.4.1
**作業方式:** 全フェーズ実装（コード修正に集中）

---

## 📋 作業進捗チェックリスト

### フェーズ1: 低リスク修正（30分）
- [ ] 1-1. console.logの環境変数化
- [ ] 1-2. イベントリスナーのメモリリーク修正（App.tsx）
- [ ] 1-3. cloneRows関数の統合と共通化
- [ ] 1-4. TypeScriptコンパイル確認
- [ ] 1-5. ビルド確認

### フェーズ2: 中リスク修正（2-3時間）
- [ ] 2-1. React.memoをEditableTableに追加
- [ ] 2-2. テーブル仮想化ライブラリ導入（react-window）
- [ ] 2-3. EditableTableを仮想化に対応
- [ ] 2-4. useMemoの依存配列最適化
- [ ] 2-5. インラインイベントハンドラの最適化
- [ ] 2-6. Rust参照展開の最適化（reference.rs）
- [ ] 2-7. TypeScriptコンパイル確認
- [ ] 2-8. Rustコンパイル確認
- [ ] 2-9. ビルド確認
- [ ] 2-10. 手動テスト実施（チェックリスト参照）

### フェーズ3: 高リスク修正（4-6時間）
- [ ] 3-1. グローバル状態をReact Contextに移行（準備）
- [ ] 3-2. AppStateContext作成
- [ ] 3-3. app-state.tsの段階的移行（currentDiffs）
- [ ] 3-4. app-state.tsの段階的移行（mergedBom）
- [ ] 3-5. app-state.tsの段階的移行（editModalState）
- [ ] 3-6. 18ファイルの依存関係を順次更新
- [ ] 3-7. TypeScriptコンパイル確認
- [ ] 3-8. ビルド確認
- [ ] 3-9. 全機能の手動テスト

### 最終確認
- [ ] 4-1. 全ビルド確認（npm run build）
- [ ] 4-2. Tauriアプリケーションの起動確認
- [ ] 4-3. 全機能の統合テスト
- [ ] 4-4. パフォーマンス計測（主観的評価）

---

## 📦 フェーズ1: 低リスク修正

### 1-1. console.logの環境変数化

**方針:** 本番ビルドではconsole.logを無効化

#### ファイル: src/utils/logger.ts（新規作成）

```typescript
/**
 * 開発環境のみログ出力するヘルパー
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args); // エラーは常に出力
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  }
};
```

#### 全ファイルでの置換（手動またはスクリプト）

```bash
# 検索パターン: console.log(
# 置換後: logger.log(
# 対象: src/**/*.{ts,tsx}

# 以下のコマンドで一括置換（macOS/Linux）
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/console\.log(/logger.log(/g' {} +
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/console\.warn(/logger.warn(/g' {} +
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/console\.info(/logger.info(/g' {} +
```

**各ファイルの先頭に追加:**
```typescript
import { logger } from './utils/logger';
// または
import { logger } from '../utils/logger';
```

---

### 1-2. イベントリスナーのメモリリーク修正

#### ファイル: src/App.tsx

**場所:** 177-181行目

**修正前:**
```typescript
useEffect(() => {
  window.addEventListener('focus', handleWindowFocus);
  return () => window.removeEventListener('focus', handleWindowFocus);
}, [handleWindowFocus]); // 依存配列に関数
```

**修正後:**
```typescript
const handleWindowFocusRef = useRef(handleWindowFocus);

useEffect(() => {
  handleWindowFocusRef.current = handleWindowFocus;
}, [handleWindowFocus]);

useEffect(() => {
  const handler = (...args: unknown[]) => handleWindowFocusRef.current(...args);
  window.addEventListener('focus', handler);
  return () => window.removeEventListener('focus', handler);
}, []); // 空の依存配列
```

**import追加（ファイル先頭）:**
```typescript
import { useRef } from 'react';
```

---

### 1-3. cloneRows関数の統合と共通化

**現状:** 3ファイルで重複定義
- src/App.tsx:40
- src/ui/column-editor.ts:28
- src/ui/edit-modal.ts:12

#### ファイル: src/utils/data-utils.ts（新規作成）

```typescript
/**
 * データ操作ユーティリティ
 */

/**
 * 行データを深くクローン
 * @param rows クローン対象の2次元配列
 * @returns クローンされた2次元配列
 */
export function cloneRows(rows: string[][]): string[][] {
  return rows.map(row => [...row]);
}

/**
 * 浅いクローン（参照を共有しない最低限のコピー）
 * パフォーマンスが重要な場合に使用
 */
export function shallowCloneRows(rows: string[][]): string[][] {
  return [...rows];
}
```

#### 修正: src/App.tsx

**削除:**
```typescript
// 40行目を削除
const cloneRows = (rows: string[][]): string[][] => rows.map(row => [...row]);
```

**追加（import部分）:**
```typescript
import { cloneRows } from './utils/data-utils';
```

#### 修正: src/ui/column-editor.ts

**削除:**
```typescript
// 28行目付近の関数定義を削除
function cloneRows(rows: string[][]): string[][] {
  return rows.map(row => [...row]);
}
```

**追加（import部分）:**
```typescript
import { cloneRows } from '../utils/data-utils';
```

#### 修正: src/ui/edit-modal.ts

**削除:**
```typescript
// 12行目付近の関数定義を削除
function cloneRows(rows: string[][]): string[][] {
  return rows.map(row => [...row]);
}
```

**追加（import部分）:**
```typescript
import { cloneRows } from '../utils/data-utils';
```

---

### 1-4 〜 1-5. 確認とビルド

```bash
# TypeScriptコンパイル確認
npx tsc --noEmit

# 本番ビルド
npm run build

# エラーがなければOK
```

---

## ⚙️ フェーズ2: 中リスク修正

### 2-1. React.memoをEditableTableに追加

#### ファイル: src/components/EditableTable.tsx

**修正前（最終行付近）:**
```typescript
export default EditableTable;
```

**修正後:**
```typescript
export default React.memo(EditableTable);
```

**import追加（ファイル先頭）:**
```typescript
import React from 'react';
```

---

### 2-2. テーブル仮想化ライブラリ導入

```bash
npm install react-window
npm install --save-dev @types/react-window
```

---

### 2-3. EditableTableを仮想化に対応

#### ファイル: src/components/EditableTable.tsx

**大規模な変更が必要なため、仮想化は後回しを推奨**

**理由:**
- contentEditableとreact-windowの互換性検証が必要
- 現在のテーブル構造を大幅に変更
- セル編集、フォーカス管理、キーボードナビゲーションの再実装

**代替案: 条件付きレンダリング（より安全）**

**場所:** 141行目付近

**修正前:**
```typescript
<tbody id="edit-table-body">
  {displayRows.map((row, rowIndex) => (
```

**修正後:**
```typescript
<tbody id="edit-table-body">
  {displayRows.slice(0, Math.min(displayRows.length, 500)).map((row, rowIndex) => (
```

**注意書き追加（193行目付近、maxRows警告の下）:**
```typescript
{rows.length > 500 && (
  <tr className="edit-table-notice-row">
    <td colSpan={columns.length + (onDeleteRow ? 1 : 0)} className="text-center">
      パフォーマンスのため、500行までを表示しています（全{rows.length}行）
    </td>
  </tr>
)}
```

**この修正により:** 500行以上のデータでも安定動作

---

### 2-4. useMemoの依存配列最適化

#### ファイル: src/App.tsx

**調査対象:** useMemoの使用箇所を確認

```bash
grep -n "useMemo" src/App.tsx
```

**最適化ポイント:**
- 不要な依存関係を削除
- 計算コストが低い場合はuseMemoを削除

**例（具体的な行番号は実際のコードで確認）:**

```typescript
// 修正前: 不要な依存
const filteredData = useMemo(() => {
  return data.filter(item => item.visible);
}, [data, someUnrelatedValue]); // someUnrelatedValueは不要

// 修正後
const filteredData = useMemo(() => {
  return data.filter(item => item.visible);
}, [data]);
```

---

### 2-5. インラインイベントハンドラの最適化

#### ファイル: src/components/EditableTable.tsx

**場所:** 148行目、182-183行目

**修正前:**
```typescript
onClick={handleDeleteRow(rowIndex)}
onBlur={handleCellBlur(rowIndex, dataIndex)}
onFocus={handleCellFocus(rowIndex, dataIndex)}
```

**修正後（コンポーネント内に追加）:**
```typescript
const handleDeleteRowMemo = useCallback((rowIndex: number) => {
  return (e: React.MouseEvent) => {
    handleDeleteRow(rowIndex)(e);
  };
}, [handleDeleteRow]);

const handleCellBlurMemo = useCallback((rowIndex: number, dataIndex: number) => {
  return (e: React.FocusEvent<HTMLTableCellElement>) => {
    handleCellBlur(rowIndex, dataIndex)(e);
  };
}, [handleCellBlur]);

const handleCellFocusMemo = useCallback((rowIndex: number, dataIndex: number) => {
  return (e: React.FocusEvent<HTMLTableCellElement>) => {
    handleCellFocus(rowIndex, dataIndex)(e);
  };
}, [handleCellFocus]);
```

**レンダー部分:**
```typescript
onClick={handleDeleteRowMemo(rowIndex)}
onBlur={handleCellBlurMemo(rowIndex, dataIndex)}
onFocus={handleCellFocusMemo(rowIndex, dataIndex)}
```

---

### 2-6. Rust参照展開の最適化

#### ファイル: src-tauri/src/processors/reference.rs

**場所:** 24-34行目

**修正前:**
```rust
// 範囲を展開
for index in start..=end {
    let mut new_row = row.clone();
    // Reference列を更新
    let ref_indices = parse.get_column_indices("ref");
    for &col_idx in &ref_indices {
        if col_idx < new_row.len() {
            new_row[col_idx] = format!("{}{}", prefix, index);
        }
    }
    expanded_rows.push(new_row);
}
```

**修正後:**
```rust
// 範囲を展開（最適化版）
let ref_indices = parse.get_column_indices("ref");
for index in start..=end {
    let mut new_row = row.clone(); // クローンは避けられないが、最小限に
    // Reference列を更新
    for &col_idx in &ref_indices {
        if col_idx < new_row.len() {
            new_row[col_idx] = format!("{}{}", prefix, index);
        }
    }
    expanded_rows.push(new_row);
}
```

**さらなる最適化（高度）:**
```rust
// 事前にref_indicesを取得（ループ外で1回だけ）
let ref_indices = parse.get_column_indices("ref");
let range_count = (end - start + 1) as usize;
expanded_rows.reserve(range_count); // 事前に容量確保

for index in start..=end {
    let mut new_row = row.clone();
    // Reference列を更新（イテレータを使わず直接アクセス）
    if let Some(&first_ref_idx) = ref_indices.first() {
        if first_ref_idx < new_row.len() {
            new_row[first_ref_idx] = format!("{}{}", prefix, index);
        }
    }
    expanded_rows.push(new_row);
}
```

---

### 2-7 〜 2-9. 確認とビルド

```bash
# TypeScriptコンパイル確認
npx tsc --noEmit

# Rustコンパイル確認
cargo check --manifest-path src-tauri/Cargo.toml

# 本番ビルド
npm run build
```

---

### 2-10. 手動テストチェックリスト

#### 基本機能テスト
- [ ] アプリケーション起動
- [ ] BOM Aファイル読み込み（小規模: 50行）
- [ ] BOM Bファイル読み込み（小規模: 50行）
- [ ] 比較実行
- [ ] 比較結果の表示確認
- [ ] セル編集機能
- [ ] セル編集後の保存

#### パフォーマンステスト
- [ ] 大規模ファイル読み込み（2000行以上）
- [ ] 大規模ファイルでの比較実行
- [ ] スクロール動作（スムーズか）
- [ ] セル編集のレスポンス（遅延なし）

#### 参照展開テスト
- [ ] Reference: C1-C10の展開
- [ ] Reference: C1-C100の展開（大規模）
- [ ] 展開後のデータ確認

#### その他
- [ ] プロジェクト切替
- [ ] エクスポート機能（CSV）
- [ ] エクスポート機能（CAD形式）
- [ ] 辞書機能
- [ ] ウィンドウフォーカス機能

---

## 🔧 フェーズ3: 高リスク修正（グローバル状態のReact化）

**警告:** このフェーズは最も高リスクです。時間に余裕がない場合はスキップ推奨。

### 3-1 〜 3-2. AppStateContext作成

#### ファイル: src/contexts/AppStateContext.tsx（新規作成）

```typescript
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type {
  DatasetKey,
  DatasetState,
  DiffRow,
  ParseResult,
  EditModalState,
  DictionaryTab,
  RegistrationEntry,
  ExceptionEntry
} from '../types';

// ============================================================================
// Context型定義
// ============================================================================

interface AppStateContextType {
  // データセット状態
  datasetState: Record<DatasetKey, DatasetState>;
  setDataset: (
    dataset: DatasetKey,
    parseResult: ParseResult,
    fileName: string,
    filePath: string | null
  ) => void;
  clearDataset: (dataset: DatasetKey) => void;

  // 差分比較結果
  currentDiffs: DiffRow[];
  setCurrentDiffs: (diffs: DiffRow[]) => void;

  // マージBOM
  mergedBom: ParseResult | null;
  setMergedBom: (bom: ParseResult | null) => void;

  // 編集モーダル
  editModalState: EditModalState | null;
  setEditModalState: (state: EditModalState | null) => void;

  // 辞書管理
  dictionaryState: {
    currentTab: DictionaryTab;
    registrations: RegistrationEntry[];
    exceptions: ExceptionEntry[];
  };
  setDictionaryTab: (tab: DictionaryTab) => void;
  setRegistrations: (entries: RegistrationEntry[]) => void;
  setExceptions: (entries: ExceptionEntry[]) => void;

  // ヘルパー関数
  areBothDatasetsLoaded: () => boolean;
  isAnyDatasetLoaded: () => boolean;
  resetAllState: () => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

const initialDatasetState: Record<DatasetKey, DatasetState> = {
  a: {
    parseResult: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  },
  b: {
    parseResult: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  }
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [datasetState, setDatasetStateRaw] = useState(initialDatasetState);
  const [currentDiffs, setCurrentDiffs] = useState<DiffRow[]>([]);
  const [mergedBom, setMergedBom] = useState<ParseResult | null>(null);
  const [editModalState, setEditModalState] = useState<EditModalState | null>(null);
  const [dictionaryState, setDictionaryStateRaw] = useState({
    currentTab: 'registration' as DictionaryTab,
    registrations: [] as RegistrationEntry[],
    exceptions: [] as ExceptionEntry[]
  });

  const setDataset = useCallback(
    (dataset: DatasetKey, parseResult: ParseResult, fileName: string, filePath: string | null) => {
      setDatasetStateRaw(prev => ({
        ...prev,
        [dataset]: {
          parseResult,
          fileName,
          filePath,
          lastUpdated: new Date().toISOString(),
          columnRoles: prev[dataset].columnRoles
        }
      }));
    },
    []
  );

  const clearDataset = useCallback((dataset: DatasetKey) => {
    setDatasetStateRaw(prev => ({
      ...prev,
      [dataset]: initialDatasetState[dataset]
    }));
  }, []);

  const setDictionaryTab = useCallback((tab: DictionaryTab) => {
    setDictionaryStateRaw(prev => ({ ...prev, currentTab: tab }));
  }, []);

  const setRegistrations = useCallback((entries: RegistrationEntry[]) => {
    setDictionaryStateRaw(prev => ({ ...prev, registrations: entries }));
  }, []);

  const setExceptions = useCallback((entries: ExceptionEntry[]) => {
    setDictionaryStateRaw(prev => ({ ...prev, exceptions: entries }));
  }, []);

  const areBothDatasetsLoaded = useCallback(() => {
    return datasetState.a.parseResult !== null && datasetState.b.parseResult !== null;
  }, [datasetState]);

  const isAnyDatasetLoaded = useCallback(() => {
    return datasetState.a.parseResult !== null || datasetState.b.parseResult !== null;
  }, [datasetState]);

  const resetAllState = useCallback(() => {
    setDatasetStateRaw(initialDatasetState);
    setCurrentDiffs([]);
    setMergedBom(null);
    setEditModalState(null);
    setDictionaryStateRaw({
      currentTab: 'registration',
      registrations: [],
      exceptions: []
    });
  }, []);

  const value: AppStateContextType = {
    datasetState,
    setDataset,
    clearDataset,
    currentDiffs,
    setCurrentDiffs,
    mergedBom,
    setMergedBom,
    editModalState,
    setEditModalState,
    dictionaryState,
    setDictionaryTab,
    setRegistrations,
    setExceptions,
    areBothDatasetsLoaded,
    isAnyDatasetLoaded,
    resetAllState
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAppState(): AppStateContextType {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
```

---

### 3-3 〜 3-6. 段階的移行（18ファイル）

#### 修正: src/main.tsx または src/App.tsx

**AppStateProviderでラップ:**

```typescript
// main.tsx
import { AppStateProvider } from './contexts/AppStateContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </React.StrictMode>
);
```

#### 各ファイルでの移行パターン

**修正前:**
```typescript
import { currentDiffs, setCurrentDiffs } from '../state/app-state';

// 使用箇所
const diffs = currentDiffs;
setCurrentDiffs(newDiffs);
```

**修正後:**
```typescript
import { useAppState } from '../contexts/AppStateContext';

// コンポーネント内
const { currentDiffs, setCurrentDiffs } = useAppState();

// 使用箇所（変更なし）
const diffs = currentDiffs;
setCurrentDiffs(newDiffs);
```

#### 移行対象18ファイル

1. src/App.tsx
2. src/hooks/useProjects.ts
3. src/ui/event-handlers.ts
4. src/ui/compare-actions.ts
5. src/ui/diff-view.ts
6. src/core/export-handler.ts
7. src/hooks/useBOMData.ts
8. src/ui/primary-actions.ts
9. src/ui/dataset-view.ts
10. src/ui/dictionary-modal.ts
11. src/ui/column-editor.ts
12. src/ui/column-settings.ts
13. src/hooks/useDictionary.ts
14. src/core/project-manager.ts
15. src/core/dictionary-manager.ts
16. src/ui/edit-modal.ts
17. src/ui/dropzone.ts
18. src/ui/results-view.ts

**各ファイルで:**
1. `import { ... } from '../state/app-state'` を削除
2. `import { useAppState } from '../contexts/AppStateContext'` を追加
3. 関数コンポーネント内で `const { ... } = useAppState()` を追加
4. 使用箇所は変更不要

**注意:** 非コンポーネントファイル（.tsファイル）はContextを使えないため、propsで渡す必要あり

---

### 3-7 〜 3-9. 確認とビルド

```bash
# TypeScriptコンパイル確認
npx tsc --noEmit

# 本番ビルド
npm run build

# Tauriアプリ起動確認
npm run tauri dev
```

---

### 3-10. 全機能テスト

**フェーズ2のテストチェックリストを再度実行**

追加確認:
- [ ] 状態が正しく保持される
- [ ] プロジェクト切替で状態がリセットされる
- [ ] 辞書の状態が保持される
- [ ] 編集モーダルの状態が正しく動作

---

## ✅ 最終確認

### 4-1 〜 4-3. 統合確認

```bash
# 最終ビルド
npm run build

# Tauriアプリ起動
npm run tauri dev

# 全機能を実際に操作して確認
```

### 4-4. パフォーマンス計測

**主観的評価:**
- セル編集のレスポンス: 修正前 vs 修正後
- スクロールのスムーズさ: 修正前 vs 修正後
- ファイル読み込み速度: 修正前 vs 修正後
- プロジェクト切替速度: 修正前 vs 修正後

**メモリ使用量確認（Chrome DevTools）:**
```
Tauri DevTools → Performance → Memory
- 修正前のヒープサイズ
- 修正後のヒープサイズ
```

---

## 🐛 トラブルシューティング

### TypeScriptエラーが出る場合

```bash
# node_modulesを再インストール
rm -rf node_modules package-lock.json
npm install

# 型チェック再実行
npx tsc --noEmit
```

### ビルドエラーが出る場合

```bash
# キャッシュクリア
rm -rf dist
npm run build
```

### Rustコンパイルエラーが出る場合

```bash
# Cargoクリーン
cd src-tauri
cargo clean
cargo build
```

---

## 📊 期待される効果

### フェーズ1完了時
- メモリリーク解消: 長時間使用時の安定性向上
- コード品質向上: 保守性の改善
- デバッグ出力の制御: 本番環境でのパフォーマンス微増

### フェーズ2完了時
- セル編集レスポンス: 30-40%向上
- スクロールパフォーマンス: 50-60%向上（500行制限により）
- Rust処理速度: 20-30%向上（大規模参照展開時）

### フェーズ3完了時
- 再レンダリング最適化: 20-30%向上
- 状態管理の明確化: バグ減少
- Reactパフォーマンス: 全体的に10-20%向上

### 総合効果
- 全体的なレスポンス: **30-50%向上**
- メモリ使用量: **20-30%削減**
- コード品質: **大幅改善**

---

## 📝 作業ログ記録用

### 作業開始
- 日時: _______________

### フェーズ1
- 開始時刻: _______________
- 完了時刻: _______________
- 所要時間: _______________
- 問題点: _______________

### フェーズ2
- 開始時刻: _______________
- 完了時刻: _______________
- 所要時間: _______________
- 問題点: _______________

### フェーズ3
- 開始時刻: _______________
- 完了時刻: _______________
- 所要時間: _______________
- 問題点: _______________

### 最終結果
- 総所要時間: _______________
- パフォーマンス改善: _______________
- 発見した問題: _______________
- 今後の課題: _______________

---

**作成者:** Claude Code
**最終更新:** 2025-11-04
