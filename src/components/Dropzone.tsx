/**
 * Dropzone.tsx - ファイルドロップゾーンコンポーネント
 *
 * 元の実装: src/ui/dropzone.ts, src/ui/file-picker.ts
 *
 * 役割:
 * - Tauriのドラッグ&ドロップとファイル選択ダイアログをラップ
 * - ファイルパスと表示名を親コンポーネントへ通知
 * - 読み込み状態や現在のファイル名を表示
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode
} from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { DatasetKey } from '../types';

interface DropzoneProps {
  dataset: DatasetKey;
  fileName: string | null;
  status?: string | null;
  isLoading?: boolean;
  hasData?: boolean;
  onFileLoaded: (filePath: string, fileName: string) => Promise<void> | void;
  onError?: (error: unknown) => void;
  children?: ReactNode;
}

function extractPathFromUriList(uriList: string | undefined): string | null {
  if (!uriList) return null;
  const firstLine = uriList.split('\n').find(line => line.trim().length > 0);
  if (!firstLine) return null;
  if (!firstLine.startsWith('file://')) return null;
  try {
    return decodeURI(firstLine.replace('file://', ''));
  } catch {
    return null;
  }
}

export function Dropzone({
  dataset,
  fileName,
  status,
  isLoading = false,
  hasData,
  onFileLoaded,
  onError,
  children
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleError = useCallback(
    (error: unknown) => {
      if (onError) {
        onError(error);
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      // eslint-disable-next-line no-alert
      alert(`ファイルの読み込みに失敗しました:\n${message}`);
    },
    [onError]
  );

  const notifyFileLoaded = useCallback(
    async (path: string, displayName: string) => {
      try {
        await onFileLoaded(path, displayName);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, onFileLoaded]
  );

  // Tauriネイティブドロップイベントの処理は useNativeDrop フックで行う
  // （BOMWorkspace で統合）

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(dragCounterRef.current - 1, 0);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) {
        return;
      }

      const dropped = files[0] as File & { path?: string };
      let path = dropped.path ?? null;
      if (!path) {
        path = extractPathFromUriList(event.dataTransfer?.getData('text/uri-list'));
      }

      if (!path) {
        handleError(new Error('ファイルパスを取得できませんでした。ファイル選択ボタンをお試しください。'));
        return;
      }

      const displayName = dropped.name || path.split(/[\\/]/).pop() || '選択ファイル';
      await notifyFileLoaded(path, displayName);
      event.dataTransfer?.clearData();
    },
    [handleError, notifyFileLoaded]
  );

  const handleFileSelect = useCallback(async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [
          { name: 'BOM Files', extensions: ['csv', 'xlsx'] },
          { name: 'すべてのファイル', extensions: ['*'] }
        ]
      });
      if (!result) {
        return;
      }
      if (Array.isArray(result)) {
        handleError(new Error('複数ファイルの同時選択には対応していません。1ファイルずつ読み込んでください。'));
        return;
      }

      const path = result;
      const displayName = path.split(/[\\/]/).pop() ?? '選択ファイル';
      await notifyFileLoaded(path, displayName);
    } catch (error) {
      handleError(error);
    }
  }, [handleError, notifyFileLoaded]);

  const tooltipText = useMemo(
    () =>
      `比較の${dataset === 'a' ? '基準となる既存BOM' : '対象となる新しいBOM'}を読み込みます`,
    [dataset]
  );

  const statusText = useMemo(() => {
    if (isLoading) {
      return '読み込み中...';
    }
    if (status && status.trim().length > 0) {
      return status;
    }
    if (fileName) {
      return `${fileName} を読み込み済み`;
    }
    return '未読み込み';
  }, [fileName, isLoading, status]);

  const hasDataset = (hasData ?? null) !== null ? Boolean(hasData) : Boolean(children);

  return (
    <div
      className={`dropzone${isLoading ? ' is-loading' : ''}`}
      data-target={dataset}
      data-dropzone={dataset}
      data-react-dropzone="true"
      aria-busy={isLoading}
    >
      <header className="dropzone-header">
        <div className="dropzone-title">
          <h2>BOM {dataset.toUpperCase()}</h2>
          <button
            type="button"
            className="info-button"
            aria-label={`BOM ${dataset.toUpperCase()}について`}
            data-tooltip={tooltipText}
          >
            i
          </button>
        </div>
        <span className="dropzone-status" data-status-placeholder={dataset}>
          <span className="dataset-status-text">{statusText}</span>
        </span>
      </header>

      <div className="dropzone-body">
        <div
          className={`dropzone-surface${isDragging ? ' dragover' : ''}`}
          data-surface={dataset}
          data-has-data={hasDataset || undefined}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className="dropzone-placeholder"
            data-placeholder={dataset}
            hidden={hasDataset}
          >
            <div className="dropzone-placeholder-icon">⇣</div>
            <p>ここにファイルをドラッグ＆ドロップ</p>
            <small>CSV / XLSX / CADネットリスト 対応</small>
          </div>

          {children ? (
            <div
              id={`drop-preview-${dataset}`}
              className="dropzone-preview"
              data-preview={dataset}
              hidden={!hasDataset}
            >
              {children}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="dropzone-footer">
        <button
          className="secondary-button"
          type="button"
          data-select-target={dataset}
          data-tooltip={`ファイルダイアログからBOM ${dataset.toUpperCase()}を読み込みます`}
          onClick={handleFileSelect}
          disabled={isLoading}
        >
          {isLoading ? '読み込み中...' : 'ファイルを選択'}
        </button>
      </footer>
    </div>
  );
}
