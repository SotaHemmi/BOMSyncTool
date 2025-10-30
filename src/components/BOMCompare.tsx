import { useMemo } from 'react';
import type { ColumnRole, DatasetKey, ParseResult } from '../types';
import { datasetLabel } from '../utils';
import { Dropzone } from './Dropzone';
import { PreviewTable, deriveColumns, MULTIPLE_COLUMN_TOKEN } from './DatasetCard';

export interface BOMDatasetAdapter {
  dataset: DatasetKey;
  parseResult: ParseResult | null;
  fileName: string | null;
  lastUpdated?: string | null;
  columnRoles?: Record<string, ColumnRole>;
  errors?: string[];
  statusText?: string | null;
  isLoading?: boolean;
  loadFile: (filePath: string, fileName: string) => Promise<void> | void;
  setColumnRole?: (role: ColumnRole, columnId: string | null) => void;
  applyDefaultPreprocess?: () => void;
  openEdit?: () => void;
  handleError?: (error: unknown) => void;
}

interface BOMCompareProps {
  datasetA: BOMDatasetAdapter;
  datasetB: BOMDatasetAdapter;
  onCompare: () => void;
  onReplace: () => void;
  isProcessing?: boolean;
}

const ROLE_LABELS: Record<ColumnRole, string> = {
  ref: 'Ref (部品番号)',
  part_no: 'Part No (部品型番)',
  manufacturer: 'Manufacturer (メーカー)',
  ignore: 'Ignore (指定しない)'
};

const VISIBLE_ROLE_ORDER: ColumnRole[] = ['ref', 'part_no', 'manufacturer', 'ignore'];

interface DropzonePreviewProps {
  dataset: DatasetKey;
  adapter: BOMDatasetAdapter;
}

interface WarningItem {
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const WARNING_SEVERITY_CLASS_MAP: Record<string, string> = {
  error: 'error',
  warning: 'warning',
  info: 'info'
};

function collectWarnings(parseResult: ParseResult | null, fallbackErrors?: string[]): WarningItem[] {
  if (!parseResult) return [];
  const structured = parseResult.structured_errors ?? [];
  if (structured.length > 0) {
    return structured.map(item => ({
      message: item.message,
      severity: item.severity ?? 'warning'
    }));
  }
  const fallback = parseResult.errors?.length ? parseResult.errors : fallbackErrors ?? [];
  return fallback.map(message => ({
    message,
    severity: 'warning'
  }));
}

function buildColumnIndexMap(columns: { id: string; name: string }[], parseResult: ParseResult): Map<string, number> {
  const map = new Map<string, number>();
  const ordered = parseResult.column_order ?? [];
  ordered.forEach((id, index) => {
    if (!map.has(id)) {
      map.set(id, index);
    }
  });
  columns.forEach((column, index) => {
    if (!map.has(column.id)) {
      map.set(column.id, index);
    }
  });
  return map;
}

function DropzonePreview({ dataset, adapter }: DropzonePreviewProps) {
  const datasetLabelText = useMemo(() => datasetLabel(dataset), [dataset]);
  const parseResult = adapter.parseResult;
  const hasData = Boolean(parseResult);
  const columns = useMemo(() => (parseResult ? deriveColumns(parseResult) : []), [parseResult]);
  const columnSamples = useMemo(() => {
    if (!parseResult) return new Map<string, string>();
    const samples = new Map<string, string>();
    const columnIndexMap = buildColumnIndexMap(columns, parseResult);
    columns.forEach(column => {
      const columnIndex = columnIndexMap.get(column.id) ?? -1;
      if (columnIndex < 0) return;
      const values: string[] = [];
      for (const row of parseResult.rows) {
        const value = row[columnIndex];
        if (value && String(value).trim()) {
          values.push(String(value).trim());
          if (values.length >= 3) break;
        }
      }
      if (values.length > 0) {
        samples.set(column.id, values.join(', '));
      }
    });
    return samples;
  }, [columns, parseResult]);

  const warnings = useMemo(
    () => collectWarnings(parseResult, adapter.errors),
    [adapter.errors, parseResult]
  );

  const roleAssignments = useMemo(() => {
    const assignments: Partial<Record<ColumnRole, string[]>> = {};
    if (!parseResult) return assignments;

    if (parseResult.column_roles) {
      Object.entries(parseResult.column_roles).forEach(([role, columnIds]) => {
        if (VISIBLE_ROLE_ORDER.includes(role as ColumnRole)) {
          assignments[role as ColumnRole] = columnIds.slice();
        }
      });
    }

    if (adapter.columnRoles) {
      Object.entries(adapter.columnRoles).forEach(([columnId, role]) => {
        if (VISIBLE_ROLE_ORDER.includes(role)) {
          const list = assignments[role] ?? (assignments[role] = []);
          if (!list.includes(columnId)) {
            list.push(columnId);
          }
        }
      });
    }

    return assignments;
  }, [adapter.columnRoles, parseResult]);

  return (
    <>
      <div className="drop-preview-header">
        <div>
          <h3 data-preview-title={dataset}>{`${datasetLabelText} プレビュー`}</h3>
          <p
            className="drop-preview-meta"
            data-preview-meta-short={dataset}
          >
            -
          </p>
        </div>
        <div>
          <button
            type="button"
            className="ghost-button"
            data-open-edit={dataset}
            disabled
          >
            編集
          </button>
        </div>
      </div>
      <div className="preview-with-settings">
        <div className="drop-preview-table">
          <div
            className="preview-table-wrapper"
            data-preview-table={dataset}
          >
            {hasData && parseResult ? (
              <PreviewTable parseResult={parseResult} maxRows={6} />
            ) : null}
          </div>
        </div>
        <aside className="column-settings-panel" data-column-settings={dataset}>
          <h4>列の役割</h4>
          {VISIBLE_ROLE_ORDER.map(role => {
            const assignedColumns = roleAssignments[role] ?? [];
            const multipleSelected = assignedColumns.length > 1;
            const initialAssigned = assignedColumns[0] ?? '';

            return (
              <div className="column-setting-group" key={role}>
                <label>
                  <span>{ROLE_LABELS[role]}</span>
                  <select
                    className={`column-select${multipleSelected ? ' column-select--multiple' : ''}`}
                    data-column-role={role}
                    data-dataset={dataset}
                    value={multipleSelected ? MULTIPLE_COLUMN_TOKEN : initialAssigned}
                    disabled={!adapter.setColumnRole || adapter.isLoading || !hasData}
                    onChange={event => {
                      if (!adapter.setColumnRole || !hasData) return;
                      const { value } = event.target;
                      if (value === MULTIPLE_COLUMN_TOKEN) return;
                      adapter.setColumnRole(role, value || null);
                    }}
                  >
                    <option value="">--</option>
                    {multipleSelected ? (
                      <option value={MULTIPLE_COLUMN_TOKEN}>複数列</option>
                    ) : null}
                    {columns.map(column => {
                      const sample = columnSamples.get(column.id);
                      const displayText = sample ? `${column.name} (${sample}...)` : column.name;
                      return (
                        <option key={column.id} value={column.id} title={sample || column.name}>
                          {displayText}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
            );
          })}
          <button
            type="button"
            className="column-default-preprocess"
            data-default-preprocess={dataset}
            disabled={!adapter.applyDefaultPreprocess || adapter.isLoading || !hasData}
            onClick={() => {
              if (!adapter.applyDefaultPreprocess || !hasData) return;
              adapter.applyDefaultPreprocess();
            }}
          >
            デフォルト前処理を適用
          </button>
        </aside>
      </div>
      <div
        className="drop-preview-errors"
        data-preview-errors={dataset}
        hidden={warnings.length === 0}
      >
        <strong>読み込み警告</strong>
        <ul>
          {warnings.slice(0, 3).map((warning, index) => (
            <li
              key={`${warning.message}-${index}`}
              className={WARNING_SEVERITY_CLASS_MAP[warning.severity] ?? 'warning'}
            >
              {warning.message}
            </li>
          ))}
        </ul>
        {warnings.length > 3 ? (
          <p>他 {warnings.length - 3} 件の警告があります。</p>
        ) : null}
      </div>
    </>
  );
}

export function BOMCompare({
  datasetA,
  datasetB,
  onCompare,
  onReplace,
  isProcessing = false
}: BOMCompareProps) {
  const combinedProcessing = isProcessing || datasetA.isLoading || datasetB.isLoading;
  const canCompare = Boolean(datasetA.parseResult && datasetB.parseResult) && !combinedProcessing;
  const hasAnyData = Boolean(datasetA.parseResult || datasetB.parseResult);

  return (
    <>
      <section className="control-panel-vertical">
        <Dropzone
          dataset={datasetA.dataset}
          fileName={datasetA.fileName}
          status={datasetA.statusText ?? datasetA.fileName ?? undefined}
          isLoading={datasetA.isLoading}
          hasData={Boolean(datasetA.parseResult)}
          onFileLoaded={(path, displayName) => datasetA.loadFile(path, displayName)}
          onError={datasetA.handleError}
        >
          <DropzonePreview dataset={datasetA.dataset} adapter={datasetA} />
        </Dropzone>

        <Dropzone
          dataset={datasetB.dataset}
          fileName={datasetB.fileName}
          status={datasetB.statusText ?? datasetB.fileName ?? undefined}
          isLoading={datasetB.isLoading}
          hasData={Boolean(datasetB.parseResult)}
          onFileLoaded={(path, displayName) => datasetB.loadFile(path, displayName)}
          onError={datasetB.handleError}
        >
          <DropzonePreview dataset={datasetB.dataset} adapter={datasetB} />
        </Dropzone>

        <div className="primary-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onCompare}
            disabled={!canCompare}
          >
            差分を比較
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={onReplace}
            disabled={!canCompare}
          >
            BOM A を BOM B で置き換え
          </button>
        </div>
      </section>

      {!hasAnyData ? (
        <div className="workspace-empty">
          BOMファイルを読み込むとプレビューと列設定が表示されます。
        </div>
      ) : null}
    </>
  );
}
