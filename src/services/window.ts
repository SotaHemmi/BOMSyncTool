/**
 * window.ts - ウィンドウ管理サービス
 *
 * 複数ウィンドウの作成、プロジェクト転送などを管理
 */

import { invoke } from '@tauri-apps/api/core';
import type { ProjectRecord } from '../types';

export interface WindowPosition {
  x: number;
  y: number;
}

/**
 * 新しいウィンドウでプロジェクトを開く
 *
 * @param projectId - 開くプロジェクトのID
 * @param position - ウィンドウの位置（オプション）
 */
export async function openProjectInNewWindow(
  projectId: string,
  position?: WindowPosition
): Promise<void> {
  await invoke('open_project_window', {
    projectId,
    position: position || null
  });
}

/**
 * プロジェクトデータを別ウィンドウに転送
 *
 * @param targetLabel - 転送先ウィンドウのラベル
 * @param project - 転送するプロジェクトデータ
 */
export async function transferProjectToWindow(
  targetLabel: string,
  project: ProjectRecord
): Promise<void> {
  const projectData = JSON.stringify(project);
  await invoke('transfer_project_to_window', {
    targetLabel,
    projectData
  });
}
