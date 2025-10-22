/**
 * BOMファイルのパース・読み込み処理
 */

import { invoke } from '@tauri-apps/api/core';
import type { BomRow, ColumnMeta, ColumnRole, ParseResult } from '../types';

/**
 * BOMファイルをパースする
 */
export async function parseBomFile(path: string): Promise<ParseResult> {
  return await invoke<ParseResult>('parse_bom_file', { path });
}

/**
 * セッションファイルを読み込む
 */
export async function loadSessionFromFile(path: string): Promise<string> {
  return await invoke<string>('load_session_from_file', { path });
}

/**
 * セッションファイルに保存する
 */
export async function saveSessionToFile(path: string, content: string): Promise<void> {
  await invoke('save_session_to_file', { path, content });
}

/**
 * 辞書ファイルを読み込む
 */
export async function loadDictionary(dictionaryName: string): Promise<string> {
  return await invoke<string>('load_dictionary', { dictionaryName });
}

/**
 * 辞書ファイルを保存する
 */
export async function saveDictionary(dictionaryName: string, content: string): Promise<void> {
  await invoke('save_dictionary', { dictionaryName, content });
}

export async function normalizeBomData(
  columns: ColumnMeta[],
  rows: string[][],
  columnRoles: Record<string, ColumnRole>
): Promise<BomRow[]> {
  return await invoke<BomRow[]>('normalize_bom_data', {
    columns,
    rows,
    columnRoles
  });
}
