/**
 * プロジェクト管理関連の型定義
 */

import type { ParseResult, ColumnRole } from './bom';

export type DatasetKey = 'a' | 'b';

/**
 * データセットの状態
 *
 * 重要な変更点：
 * - normalizedBomフィールドを削除
 * - データはparseResultのrowsから直接取得
 */
export interface DatasetState {
  parseResult: ParseResult | null;
  fileName: string | null;
  filePath: string | null;
  lastUpdated: string | null;
  columnRoles: Record<string, ColumnRole>;
}

/**
 * プロジェクト保存用ペイロード
 *
 * 重要な変更点：
 * - normalizedBomA/normalizedBomBフィールドを削除
 * - ParseResultに全データが含まれているため不要
 */
export interface ProjectPayload {
  version: number;
  savedAt: string;
  bomA: ParseResult | null;
  bomB: ParseResult | null;
  columnRolesA?: Record<string, ColumnRole>;
  columnRolesB?: Record<string, ColumnRole>;
}

export interface ProjectRecord {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  data: ProjectPayload;
}

export interface ProjectSettings {
  autoIntervalMinutes: number;
  autoMaxEntries: number;
  maxEditRows?: number;
  defaultPreprocess?: {
    expandReference: boolean;
    splitReferenceRows: boolean;
    fillBlankCells: boolean;
    cleanseTextData: boolean;
    applyFormatRules: boolean;
  };
}
