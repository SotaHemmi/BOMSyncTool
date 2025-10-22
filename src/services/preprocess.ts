/**
 * 前処理パイプライン処理
 */

import { invoke } from '@tauri-apps/api/core';
import type { BomRow, FormatOptions } from '../types';

/**
 * Referenceを展開（C1-C4 → C1, C2, C3, C4）
 */
export async function expandReference(rows: BomRow[]): Promise<BomRow[]> {
  return await invoke<BomRow[]>('expand_reference', { rows });
}

/**
 * Reference行を分割（1つのRefに複数のPart_Noがある場合に分割）
 */
export async function splitReferenceRows(rows: BomRow[]): Promise<BomRow[]> {
  return await invoke<BomRow[]>('split_reference_rows', { rows });
}

/**
 * 空白セルを埋める
 */
export async function fillBlankCells(rows: BomRow[]): Promise<BomRow[]> {
  return await invoke<BomRow[]>('fill_blank_cells', { rows });
}

/**
 * テキストデータのクレンジング
 */
export async function cleanseTextData(bom: BomRow[]): Promise<BomRow[]> {
  return await invoke<BomRow[]>('cleanse_text_data', { bom });
}

/**
 * フォーマットルールの適用
 */
export async function applyFormatRules(rows: BomRow[], options: FormatOptions): Promise<BomRow[]> {
  return await invoke<BomRow[]>('apply_format_rules', { rows, options });
}
