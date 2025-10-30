/**
 * BOM比較・マージ処理
 */

import { invoke } from '@tauri-apps/api/core';
import type { ParseResult, DiffRow } from '../types';

/**
 * 2つのBOMを比較して差分を取得
 *
 * @param parseA - BOM A（比較元）
 * @param parseB - BOM B（比較先）
 * @returns 差分情報リスト（行インデックスベース）
 */
export async function compareBoms(parseA: ParseResult, parseB: ParseResult): Promise<DiffRow[]> {
  return await invoke<DiffRow[]>('compare_boms', { parseA, parseB });
}

/**
 * BOM Aの内容をBOM Bで更新し、新規行を追加
 *
 * @param parseA - 更新元のBOM
 * @param parseB - 更新内容のBOM
 * @returns マージ後のParseResult
 */
export async function updateAndAppendBoms(parseA: ParseResult, parseB: ParseResult): Promise<ParseResult> {
  return await invoke<ParseResult>('update_and_append_boms', { parseA, parseB });
}
