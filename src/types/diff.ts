/**
 * BOM差分比較関連の型定義
 */

import type { BomRow } from './bom';

export interface DiffRow {
  status: string;
  a: BomRow | null;
  b: BomRow | null;
}
