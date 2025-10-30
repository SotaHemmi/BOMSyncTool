/**
 * BOMファイルのパース・読み込み処理
 */

import { invoke } from '@tauri-apps/api/core';
import type { ParseResult } from '../types';

/**
 * BOMファイルをパースする
 *
 * @param path - ファイルパス
 * @returns パース結果（rows, column_roles, column_order含む）
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
