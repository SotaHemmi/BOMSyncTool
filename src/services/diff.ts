/**
 * BOM比較・マージ処理
 */

import { invoke } from '@tauri-apps/api/core';
import type { BomRow, DiffRow } from '../types';

/**
 * 2つのBOMを比較して差分を取得
 */
export async function compareBoms(bomA: BomRow[], bomB: BomRow[]): Promise<DiffRow[]> {
  return await invoke<DiffRow[]>('compare_boms', { bomA, bomB });
}

/**
 * BOM Aの内容をBOM Bで更新し、新規行を追加
 */
export async function updateAndAppendBoms(bomA: BomRow[], bomB: BomRow[]): Promise<BomRow[]> {
  return await invoke<BomRow[]>('update_and_append_boms', { bomA, bomB });
}
