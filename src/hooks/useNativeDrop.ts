/**
 * Tauriネイティブドラッグ&ドロップフック
 *
 * Tauri環境でのネイティブドラッグ&ドロップイベントを処理
 */

import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { DatasetKey } from '../types';
import { datasetFromPosition, toggleDropzoneHover } from '../utils/dom';

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

interface UseNativeDropParams {
  onDrop: (dataset: DatasetKey, path: string, fileName: string) => void;
}

/**
 * Tauriネイティブドラッグ&ドロップイベントを処理するフック
 *
 * @param onDrop - ファイルがドロップされたときに呼ばれるコールバック
 */
export function useNativeDrop({ onDrop }: UseNativeDropParams): void {
  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let hoveredDataset: DatasetKey | null = null;
    const applyHover = (next: DatasetKey | null) => {
      if (hoveredDataset && hoveredDataset !== next) {
        toggleDropzoneHover(hoveredDataset, false);
      }
      if (next) {
        toggleDropzoneHover(next, true);
      }
      hoveredDataset = next;
    };

    const unlistenDragPromise: Promise<UnlistenFn> = currentWindow.onDragDropEvent(event => {
      const eventType = event.payload.type;
      const viewportPosition =
        'position' in event.payload ? event.payload.position : undefined;
      const paths = 'paths' in event.payload ? event.payload.paths : [];

      if (eventType === 'drop' && viewportPosition && paths.length > 0) {
        const dataset = datasetFromPosition(viewportPosition);
        if (dataset) {
          const filePath = paths[0];
          const fileName = filePath.split(/[\\/]/).pop() || 'ドロップファイル';
          onDrop(dataset, filePath, fileName);
        }
        applyHover(null);
        return;
      }

      if (eventType === 'over') {
        const dataset = datasetFromPosition(viewportPosition);
        applyHover(dataset ?? null);
        return;
      }

      applyHover(null);
    });

    return () => {
      unlistenDragPromise
        .then(unlisten => {
          unlisten();
        })
        .catch(error => {
          console.error('Failed to remove drag & drop listener', error);
        });

    };
  }, [onDrop]);
}

