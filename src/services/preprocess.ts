/**
 * 前処理パイプライン処理
 */

import { invoke } from '@tauri-apps/api/core';
import type { ParseResult, FormatOptions } from '../types';

/**
 * Referenceを展開（C1-C4 → C1, C2, C3, C4）
 *
 * @param parse - 元のBOMデータ
 * @returns 展開後のBOMデータ
 */
export async function expandReference(parse: ParseResult): Promise<ParseResult> {
  return await invoke<ParseResult>('expand_reference', { parse });
}

/**
 * Reference行を分割（1つのRefに複数のPart_Noがある場合に分割）
 *
 * @param parse - 元のBOMデータ
 * @returns 分割後のBOMデータ
 */
export async function splitReferenceRows(parse: ParseResult): Promise<ParseResult> {
  return await invoke<ParseResult>('split_reference_rows', { parse });
}

/**
 * 空白セルを埋める
 *
 * @param parse - 元のBOMデータ
 * @returns 空欄補完後のBOMデータ
 */
export async function fillBlankCells(parse: ParseResult): Promise<ParseResult> {
  return await invoke<ParseResult>('fill_blank_cells', { parse });
}

/**
 * テキストデータのクレンジング
 *
 * @param parse - 元のBOMデータ
 * @returns クレンジング後のBOMデータ
 */
export async function cleanseTextData(parse: ParseResult): Promise<ParseResult> {
  return await invoke<ParseResult>('cleanse_text_data', { parse });
}

/**
 * フォーマットルールの適用
 *
 * @param parse - 元のBOMデータ
 * @param options - フォーマットオプション
 * @returns 整形後のBOMデータ
 */
export async function applyFormatRules(parse: ParseResult, options: FormatOptions): Promise<ParseResult> {
  return await invoke<ParseResult>('apply_format_rules', { parse, options });
}
