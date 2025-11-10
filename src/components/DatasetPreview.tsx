/**
 * DatasetPreview - データセットプレビューコンポーネント
 *
 * Dropzone内で表示されるデータセットのプレビュー
 */

import { useMemo } from 'react';
import type { DatasetKey, ParseResult } from '../types';
import { datasetLabel, formatDateLabel } from '../utils';
import { PreviewTable } from './DatasetCard';

interface DatasetPreviewProps {
  dataset: DatasetKey;
  parseResult: ParseResult;
  fileName: string | null;
  lastUpdated: string | null;
  errors: Array<{ message: string; severity?: string }>;
  onPreprocess: () => void;
  onEdit: () => void;
}

export function DatasetPreview({
  dataset,
  parseResult,
  fileName,
  lastUpdated,
  errors,
  onPreprocess,
  onEdit
}: DatasetPreviewProps) {
  const rowCount = parseResult.rows?.length ?? 0;
  const displayName = fileName || `${datasetLabel(dataset)} プレビュー`;
  const statusText = fileName
    ? `${fileName} を読み込み済み`
    : '読み込み済み';
  const lastUpdateText = lastUpdated ? formatDateLabel(lastUpdated) : '';

  const displayErrors = useMemo(() => {
    return errors.slice(0, 3);
  }, [errors]);

  return (
    <div className="dropzone-preview" data-preview={dataset}>
      <div className="dataset-header">
        <h3 className="dataset-title" data-preview-title={dataset}>
          {displayName}
        </h3>
        <span className="dataset-status" data-status-placeholder={dataset}>
          <span className="dataset-status-text">{statusText}</span>
        </span>
      </div>

      <p className="dataset-summary" data-preview-meta-short={dataset}>
        {rowCount}行 | {lastUpdateText}
      </p>

      <div className="preview-table-wrapper" data-preview-table={dataset}>
        <PreviewTable
          parseResult={parseResult}
          maxRows={6}
        />
      </div>

      {errors.length > 0 && (
        <div className="drop-preview-errors" data-preview-errors={dataset}>
          <strong>読み込み警告</strong>
          <ul>
            {displayErrors.map((error, index) => (
              <li
                key={`${error.message}-${index}`}
                className={error.severity || 'warning'}
              >
                {error.message}
              </li>
            ))}
          </ul>
          {errors.length > 3 && (
            <p>他 {errors.length - 3} 件の警告があります。</p>
          )}
        </div>
      )}

      <div className="dataset-actions">
        <button
          type="button"
          className="secondary-button"
          data-default-preprocess={dataset}
          onClick={onPreprocess}
        >
          前処理を適用
        </button>
        <button
          type="button"
          className="secondary-button"
          data-open-edit={dataset}
          onClick={onEdit}
        >
          データを編集
        </button>
      </div>
    </div>
  );
}



