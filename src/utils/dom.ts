/**
 * DOM操作関連のユーティリティ関数
 */

import type { DatasetKey } from '../types';

/**
 * 処理中オーバーレイの表示/非表示
 */
export function setProcessing(active: boolean, message = '処理中...') {
  const processingOverlay = document.getElementById('processing-overlay') as HTMLDivElement | null;
  const processingMessage = document.getElementById('processing-message') as HTMLParagraphElement | null;

  if (!processingOverlay || !processingMessage) return;
  processingOverlay.hidden = !active;
  processingMessage.textContent = message;
}

/**
 * アクティビティログに追加
 */
export function logActivity(message: string) {
  const activityLog = document.getElementById('activity-log') as HTMLUListElement | null;
  if (!activityLog) return;

  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('li');
  entry.textContent = `[${timestamp}] ${message}`;
  activityLog.prepend(entry);

  // 古いログは見やすさのため20件までに抑える
  while (activityLog.children.length > 20) {
    activityLog.removeChild(activityLog.lastChild as ChildNode);
  }
}

/**
 * モーダルを閉じる
 */
export function closeModal(modal: HTMLDialogElement | null) {
  modal?.close();
}

/**
 * ドロップゾーンのホバー状態を切り替え
 */
export function toggleDropzoneHover(dataset: DatasetKey | null, active: boolean) {
  if (!dataset) return;
  const surface = document.querySelector<HTMLElement>(`[data-surface="${dataset}"]`);
  if (!surface) return;
  if (active) {
    surface.classList.add('dragover');
  } else {
    surface.classList.remove('dragover');
  }
}

/**
 * 座標からデータセットキーを取得
 */
export function datasetFromPosition(position?: { x: number; y: number }): DatasetKey | null {
  if (!position) return null;
  const target = document.elementFromPoint(position.x, position.y)?.closest<HTMLElement>('.dropzone');
  const dataset = target?.dataset.target as DatasetKey | undefined;
  return dataset ?? null;
}
