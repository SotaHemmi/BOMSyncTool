/**
 * アプリケーション状態管理
 *
 * グローバル状態を一元管理し、状態更新関数を提供
 */

import type {
  DatasetKey,
  DatasetState,
  ParseResult,
  DictionaryTab,
  RegistrationEntry,
  ExceptionEntry
} from '../types';

// ============================================================================
// 状態定義
// ============================================================================

/**
 * データセット状態（BOM A / BOM B）
 */
export const datasetState: Record<DatasetKey, DatasetState> = {
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

/**
 * 辞書管理状態（IPC登録名 / 例外マスタ）
 */
export const dictionaryState: {
  currentTab: DictionaryTab;
  registrations: RegistrationEntry[];
  exceptions: ExceptionEntry[];
} = {
  currentTab: 'registration',
  registrations: [],
  exceptions: []
};

/**
 * ネイティブドロップ状態（ドラッグ&ドロップ）
 */
export const nativeDropState: {
  dataset: DatasetKey | null;
  paths: string[];
} = {
  dataset: null,
  paths: []
};

// ============================================================================
// 状態更新関数
// ============================================================================

/**
 * データセットをクリア
 */
export function clearDataset(dataset: DatasetKey): void {
  datasetState[dataset] = {
    parseResult: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  };
}

/**
 * データセットを設定
 */
export function setDataset(
  dataset: DatasetKey,
  parseResult: ParseResult,
  fileName: string,
  filePath: string | null
): void {
  datasetState[dataset].parseResult = parseResult;
  datasetState[dataset].fileName = fileName;
  datasetState[dataset].filePath = filePath;
  datasetState[dataset].lastUpdated = new Date().toISOString();
}

/**
 * 両方のデータセットがロードされているか確認
 */
export function areBothDatasetsLoaded(): boolean {
  return datasetState.a.parseResult !== null && datasetState.b.parseResult !== null;
}

/**
 * いずれかのデータセットがロードされているか確認
 */
export function isAnyDatasetLoaded(): boolean {
  return datasetState.a.parseResult !== null || datasetState.b.parseResult !== null;
}

/**
 * 全状態をリセット
 */
export function resetAllState(): void {
  clearDataset('a');
  clearDataset('b');
  dictionaryState.registrations = [];
  dictionaryState.exceptions = [];
}
