/**
 * 編集モーダル関連の型定義
 */

import type { ColumnMeta, ColumnRole } from './bom';
import type { DatasetKey } from './project';

export interface EditModalState {
  dataset: DatasetKey;
  workingRows: string[][]; // 生データの行配列
  columns: ColumnMeta[];
  headerRoles: Record<string, ColumnRole>;
}
