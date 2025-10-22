/**
 * 編集モーダル関連の型定義
 */

import type { BomRow, ColumnMeta, ColumnRole } from './bom';
import type { DatasetKey } from './project';

export interface EditModalState {
  dataset: DatasetKey;
  workingRows: BomRow[];
  columns: ColumnMeta[];
  headerRoles: Record<string, ColumnRole>;
}
