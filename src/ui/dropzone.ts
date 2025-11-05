/**
 * ドロップゾーンUI
 *
 * ファイルのドラッグ&ドロップ機能
 */

import { logger } from '../utils/logger';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { DatasetKey } from '../types';
import { datasetState, setDataset } from '../state/app-state';
import { parseBomFile } from '../services';
import {
  toggleDropzoneHover,
  datasetFromPosition,
  datasetLabel,
  setProcessing,
  logActivity,
  formatDateLabel
} from '../utils';
import { updateActionAvailability } from './event-handlers';
import { populateColumnSettings } from './column-editor';
import { createDatasetPreviewTable, syncPreviewEmptyState } from './dataset-view';

// ネイティブドロップ状態
const nativeDropState: {
  dataset: DatasetKey | null;
  paths: string[];
} = {
  dataset: null,
  paths: []
};



function updateDropzone(dataset: DatasetKey) {
  logger.log('[updateDropzone] Called for dataset:', dataset);
  const state = datasetState[dataset];
  const result = state.parseResult;
  logger.log('[updateDropzone] Has result:', Boolean(result));

  const dropzone = document.querySelector<HTMLElement>(
    `.dropzone[data-target="${dataset}"]`
  );
  const preview = dropzone?.querySelector<HTMLDivElement>(`[data-preview="${dataset}"]`);
  const placeholder = dropzone?.querySelector<HTMLElement>(`[data-placeholder="${dataset}"]`);
  const statusChip = dropzone?.querySelector<HTMLElement>(`[data-status-placeholder="${dataset}"]`);
  const statusText = statusChip?.querySelector<HTMLSpanElement>('.dataset-status-text');
  const surface = dropzone?.querySelector<HTMLDivElement>(`[data-surface="${dataset}"]`);
  const tableContainer = preview?.querySelector<HTMLDivElement>(`[data-preview-table="${dataset}"]`);
  const summaryMeta = preview?.querySelector<HTMLParagraphElement>(
    `[data-preview-meta-short="${dataset}"]`
  );
  const title = preview?.querySelector<HTMLElement>(`[data-preview-title="${dataset}"]`);
  const errorsBox = preview?.querySelector<HTMLDivElement>(`[data-preview-errors="${dataset}"]`);
  const preprocessButton = dropzone?.querySelector<HTMLButtonElement>(
    `[data-default-preprocess="${dataset}"]`
  );
  const editButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-open-edit="${dataset}"]`)
  );

  if (!dropzone) {
    logger.warn('[updateDropzone] Dropzone element not found for dataset:', dataset);
    return;
  }

  if (!result) {
    if (placeholder) placeholder.hidden = false;
    if (preview) preview.hidden = true;
    if (surface) {
      surface.hidden = false;
      delete surface.dataset.hasData;
    }
    if (statusChip) statusChip.hidden = false;
    if (statusText) statusText.textContent = '未読み込み';
    if (title) title.textContent = `${datasetLabel(dataset)} プレビュー`;
    if (errorsBox) {
      errorsBox.hidden = true;
      errorsBox.textContent = '';
    }
    if (preprocessButton) {
      preprocessButton.disabled = true;
    }
    if (tableContainer) {
      tableContainer.innerHTML = '';
    }
    dropzone.classList.remove('has-data');
    editButtons.forEach(btn => {
      btn.disabled = true;
    });
    updateActionAvailability();
    syncPreviewEmptyState();
    return;
  }

  if (placeholder) placeholder.hidden = true;
  if (preview) preview.hidden = false;
  if (surface) {
    surface.hidden = false;
    surface.dataset.hasData = 'true';
  }
  if (statusChip) statusChip.hidden = false;
  if (statusText) {
    statusText.textContent = state.fileName
      ? `${state.fileName} を読み込み済み`
      : '読み込み済み';
  }
  if (title) {
    title.textContent = state.fileName
      ? state.fileName
      : `${datasetLabel(dataset)} プレビュー`;
  }
  dropzone.classList.add('has-data');
  editButtons.forEach(btn => {
    btn.disabled = false;
  });
  if (preprocessButton) {
    preprocessButton.disabled = false;
  }

  const rowCount = result.rows?.length ?? 0;
  if (summaryMeta) {
    const lastUpdate = state.lastUpdated ? formatDateLabel(state.lastUpdated) : '';
    summaryMeta.textContent = `${rowCount}行 | ${lastUpdate}`;
  }

  if (tableContainer) {
    tableContainer.innerHTML = '';
    const table = createDatasetPreviewTable(dataset, 6);
    if (table) {
      tableContainer.appendChild(table);
    }
  }

  if (errorsBox) {
    errorsBox.innerHTML = '';
    const structuredErrors = (result.structured_errors ?? []) as Array<{ message: string; severity?: string; row?: number; column?: number }>;
    const simpleErrors = result.errors ?? [];
    const hasStructured = structuredErrors.length > 0;
    const relevantErrors = hasStructured ? structuredErrors : simpleErrors;

    if (relevantErrors.length > 0) {
      const list = document.createElement('ul');
      relevantErrors.slice(0, 3).forEach(err => {
        const li = document.createElement('li');
        if (typeof err === 'string') {
          li.textContent = err;
        } else {
          li.textContent = err.message;
          if (err.severity) {
            li.classList.add(err.severity);
          }
        }
        list.appendChild(li);
      });
      errorsBox.appendChild(list);
      if (relevantErrors.length > 3) {
        const more = document.createElement('p');
        more.textContent = `他 ${relevantErrors.length - 3} 件の警告があります。`;
        errorsBox.appendChild(more);
      }
      errorsBox.hidden = false;
    } else {
      errorsBox.hidden = true;
    }
  }

  updateActionAvailability();
  syncPreviewEmptyState();
}

function onDropzoneFileSelected(dataset: DatasetKey, path: string, fileName: string) {
  void loadBomFile(dataset, path, fileName);
}

async function loadBomFile(dataset: DatasetKey, path: string, fileName: string) {
  try {
    logger.log('[loadBomFile] Starting load:', { dataset, path, fileName });
    setProcessing(true, `${datasetLabel(dataset)} を読み込み中...`);
    const parseResult = await parseBomFile(path);
    const rowCount = parseResult.rows?.length ?? 0;
    logger.log('[loadBomFile] Parse result received:', {
      dataset,
      rowCount,
      errors: parseResult.errors.length
    });

    setDataset(dataset, parseResult, fileName, path);
    populateColumnSettings(dataset);

    logger.log('[loadBomFile] datasetState updated:', {
      dataset,
      hasParseResult: Boolean(datasetState[dataset].parseResult)
    });

    logger.log('[loadBomFile] Calling updateDropzone...');
    updateDropzone(dataset);
    logger.log('[loadBomFile] updateDropzone completed');
    logActivity(`${datasetLabel(dataset)}: ${fileName} を読み込みました (${rowCount}行)`);

    window.dispatchEvent(new CustomEvent('bomsync:dataLoaded', { detail: { dataset } }));
  } catch (error) {
    logger.error('[loadBomFile] Error:', error);
    alert(`${datasetLabel(dataset)} の読み込みに失敗しました:\n${error}`);
  } finally {
    setProcessing(false);
  }
}

export function registerDropzoneEvents() {
  const dropzones = Array.from(document.querySelectorAll<HTMLElement>('.dropzone'));
  dropzones.forEach(zone => {
    const dataset = zone.dataset.target as DatasetKey | undefined;
    if (!dataset) return;
    if (zone.dataset.dropzoneInitialized === 'true') {
      return;
    }
    zone.dataset.dropzoneInitialized = 'true';
    const surface = zone.querySelector<HTMLElement>('[data-surface]');

    const setDragging = (active: boolean) => {
      toggleDropzoneHover(dataset, active);
    };

    let dragCounter = 0;

    const handleDrop = (event: DragEvent) => {
      logger.log('[html-drop] ===== DROP EVENT FIRED =====');
      event.preventDefault();
      event.stopPropagation();
      dragCounter = 0;
      setDragging(false);
      logger.log('[html-drop] Drop event received on dataset:', dataset);
      logger.log('[html-drop] event.dataTransfer?.files:', event.dataTransfer?.files);
      logger.log('[html-drop] Current nativeDropState:', JSON.stringify(nativeDropState));

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) {
        logger.warn('[html-drop] Drop event contained no files');
        return;
      }
      const file = files[0] as File & { path?: string };
      logger.log('[html-drop] File object:', { name: file.name, size: file.size, type: file.type, path: file.path });

      let dropPath: string | undefined = file.path ?? undefined;
      logger.log('[html-drop] file.path =', dropPath);

      if (!dropPath && nativeDropState.dataset === dataset && nativeDropState.paths.length > 0) {
        [dropPath] = nativeDropState.paths;
        logger.log('[html-drop] Using path from nativeDropState:', dropPath);
      }

      if (!dropPath) {
        logger.error('[html-drop] File path is unavailable.');
        alert('ファイルパスを取得できませんでした。選択ボタンから読み込んでください。');
        setTimeout(() => {
          nativeDropState.dataset = null;
          nativeDropState.paths = [];
        }, 100);
        return;
      }
      const displayName = file.name || dropPath.split(/[\\/]/).pop() || 'ドロップファイル';
      logger.log('[html-drop] Invoking loader with path:', dropPath);
      onDropzoneFileSelected(dataset, dropPath, displayName);
      setTimeout(() => {
        logger.log('[html-drop] Clearing nativeDropState after successful load');
        nativeDropState.dataset = null;
        nativeDropState.paths = [];
      }, 100);
    };

    const attachDragEvents = (element: HTMLElement | null) => {
      if (!element) return;
      element.addEventListener(
        'dragenter',
        event => {
          logger.log('[html-drag] dragenter event on dataset:', dataset);
          event.preventDefault();
          dragCounter += 1;
          setDragging(true);
        },
        false
      );
      element.addEventListener(
        'dragover',
        event => {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
          }
          setDragging(true);
        },
        false
      );
      element.addEventListener(
        'dragleave',
        event => {
          event.preventDefault();
          dragCounter = Math.max(dragCounter - 1, 0);
          if (dragCounter === 0) {
            setDragging(false);
          }
        },
        false
      );
      element.addEventListener('drop', handleDrop, false);
    };

    attachDragEvents(surface);
    attachDragEvents(zone);
  });
}

export function registerNativeDropBridge() {
  if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    logger.info('[dropzone] Native drag/drop bridge unavailable (non-Tauri environment).');
    return;
  }

  logger.log('[dropzone] Registering native drag/drop bridge...');
  const currentWindow = getCurrentWindow();

  currentWindow
    .onDragDropEvent((event) => {
      const eventType = event.payload.type;
      const position = 'position' in event.payload ? event.payload.position : undefined;
      const paths = 'paths' in event.payload ? event.payload.paths : [];

      logger.log('[native-drop] Event received:', { type: eventType, position, paths, currentState: nativeDropState });

      if (eventType === 'over') {
        const dataset = datasetFromPosition(position);
        logger.log('[native-drop] Over detected over dataset:', dataset);
        if (dataset !== nativeDropState.dataset) {
          if (nativeDropState.dataset) {
            toggleDropzoneHover(nativeDropState.dataset, false);
          }
          nativeDropState.dataset = dataset;
        }
        if (dataset) {
          toggleDropzoneHover(dataset, true);
        }
      } else if (eventType === 'drop') {
        logger.log('[native-drop] Drop event - saving paths:', paths);
        const dataset = datasetFromPosition(position);
        logger.log('[native-drop] Drop position dataset:', dataset);

        if (dataset && paths && paths.length > 0) {
          const filePath = paths[0];
          const fileName = filePath.split(/[\\/]/).pop() || 'ドロップファイル';
          logger.log('[native-drop] Loading file via bridge:', { dataset, filePath, fileName });
          toggleDropzoneHover(dataset, false);
          const customEvent = new CustomEvent('bomsync:nativeDrop', {
            cancelable: true,
            detail: { dataset, path: filePath, fileName }
          });
          const handled = !window.dispatchEvent(customEvent);
          if (!handled) {
            onDropzoneFileSelected(dataset, filePath, fileName);
          }
          nativeDropState.dataset = null;
          nativeDropState.paths = [];
        } else {
          if (dataset) {
            nativeDropState.dataset = dataset;
            nativeDropState.paths = paths ?? [];
          } else if (nativeDropState.paths.length === 0) {
            nativeDropState.paths = paths ?? [];
          }
          logger.log('[native-drop] nativeDropState saved for HTML handler:', nativeDropState);
          if (nativeDropState.dataset) {
            toggleDropzoneHover(nativeDropState.dataset, false);
          }
        }
      } else {
        logger.log('[native-drop] Cancel/leave event');
        if (nativeDropState.dataset) {
          toggleDropzoneHover(nativeDropState.dataset, false);
        }
        nativeDropState.dataset = null;
        nativeDropState.paths = [];
      }
    })
    .catch((error: unknown) => {
      logger.error('[dropzone] Failed to register native drag/drop bridge:', error);
    });

  logger.log('[dropzone] Native drag/drop bridge registered successfully');
}
