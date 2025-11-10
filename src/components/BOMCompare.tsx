import React, { useEffect, useMemo } from 'react';
import type { ColumnRole, DatasetKey, ParseResult } from '../types';
import { datasetLabel, formatDateLabel } from '../utils';
import { Dropzone } from './Dropzone';
import { PreviewTable } from './DatasetCard';
import { deriveColumns } from '../core/bom-columns';
import { useColumnSamples } from '../hooks/useColumnSamples';
import { requestLayoutAdjustment } from '../ui/layout';

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
  exportECO?: () => void;
  exportCCF?: () => void;
  exportMSF?: () => void;
  exportPWS?: () => void;
  exportBD?: () => void;
  exportPADSReport?: () => void;
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

function DropzonePreview({ dataset, adapter }: DropzonePreviewProps) {
  const datasetLabelText = useMemo(() => datasetLabel(dataset), [dataset]);
  const parseResult = adapter.parseResult;
  const hasData = Boolean(parseResult);
  const columns = useMemo(() => (parseResult ? deriveColumns(parseResult) : []), [parseResult]);
  const columnSamples = useColumnSamples(columns, parseResult);
  const previewMetricsKey = parseResult ? `${parseResult.rows.length}:${parseResult.columns?.length ?? 0}` : 'empty';

  const warnings = useMemo(
    () => collectWarnings(parseResult, adapter.errors),
    [adapter.errors, parseResult]
  );

  const columnRoleMap = useMemo(() => {
    const map: Record<string, ColumnRole> = {};
    if (parseResult?.column_roles) {
      Object.entries(parseResult.column_roles).forEach(([role, columnIds]) => {
        if (!VISIBLE_ROLE_ORDER.includes(role as ColumnRole)) {
          return;
        }
        columnIds.forEach(columnId => {
          map[columnId] = role as ColumnRole;
        });
      });
    }

    if (adapter.columnRoles) {
      Object.entries(adapter.columnRoles).forEach(([columnId, role]) => {
        if (VISIBLE_ROLE_ORDER.includes(role)) {
          map[columnId] = role;
        }
      });
    }

    return map;
  }, [adapter.columnRoles, parseResult]);

  const previewTitle = adapter.fileName ?? `${datasetLabelText} プレビュー`;
  const previewMeta = useMemo(() => {
    if (!parseResult) {
      return adapter.fileName ? '読み込み済み' : '未読み込み';
    }
    const rowCount = parseResult.rows.length;
    const formattedDate = adapter.lastUpdated ? formatDateLabel(adapter.lastUpdated) : null;
    const rowLabel = `${rowCount.toLocaleString()}行`;
    return formattedDate ? `${rowLabel} | ${formattedDate}` : rowLabel;
  }, [adapter.fileName, adapter.lastUpdated, parseResult]);

  useEffect(() => {
    requestLayoutAdjustment(60);
  }, [previewMetricsKey, adapter.fileName, adapter.lastUpdated]);

  return (
    <>
      <div className="drop-preview-header">
        <div>
          <h3 data-preview-title={dataset}>{previewTitle}</h3>
          <p
            className="drop-preview-meta"
            data-preview-meta-short={dataset}
          >
            {previewMeta}
          </p>
        </div>
        <div>
          <button
            type="button"
            className="ghost-button"
            data-open-edit={dataset}
            disabled={!adapter.openEdit || adapter.isLoading || !hasData}
            onClick={() => {
              if (!adapter.openEdit || adapter.isLoading || !hasData) return;
              adapter.openEdit();
            }}
            data-tooltip="データを編集します"
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
              <PreviewTable parseResult={parseResult} maxRows={15} />
            ) : null}
          </div>
        </div>
        <aside className="column-settings-panel" data-column-settings={dataset}>
          <h4>列の役割</h4>
          {columns.map((column, index) => {
            const currentRole = columnRoleMap[column.id] ?? 'ignore';
            const sample = columnSamples.get(column.id);
            const columnLabel = sample ? `${column.name} (${sample}...)` : column.name;

            return (
              <div className="column-setting-group" key={column.id}>
                <label>
                  <span>{`${index + 1}. ${columnLabel}`}</span>
                  <select
                    className="column-select"
                    data-column-id={column.id}
                    data-dataset={dataset}
                    value={currentRole}
                    disabled={!adapter.setColumnRole || adapter.isLoading || !hasData}
                    onChange={event => {
                      if (!adapter.setColumnRole || !hasData) return;
                      adapter.setColumnRole(event.target.value as ColumnRole, column.id);
                    }}
                  >
                    {VISIBLE_ROLE_ORDER.map(role => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
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
            data-tooltip="デフォルトの前処理設定を適用します"
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

  const [exportDataset, setExportDataset] = React.useState<'a' | 'b'>('a');
  const [exportFormat, setExportFormat] = React.useState<'eco' | 'ccf' | 'msf' | 'pws' | 'bd' | 'rpt'>('eco');

  const handleExport = () => {
    const adapter = exportDataset === 'a' ? datasetA : datasetB;
    if (exportFormat === 'eco' && adapter.exportECO) {
      adapter.exportECO();
    } else if (exportFormat === 'ccf' && adapter.exportCCF) {
      adapter.exportCCF();
    } else if (exportFormat === 'msf' && adapter.exportMSF) {
      adapter.exportMSF();
    } else if (exportFormat === 'pws' && adapter.exportPWS) {
      adapter.exportPWS();
    } else if (exportFormat === 'bd' && adapter.exportBD) {
      adapter.exportBD();
    } else if (exportFormat === 'rpt' && adapter.exportPADSReport) {
      adapter.exportPADSReport();
    }
  };

  const canExport = (exportDataset === 'a' ? Boolean(datasetA.parseResult) : Boolean(datasetB.parseResult)) && !combinedProcessing;

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

        <div className="export-actions">
          <select
            className="export-select export-select--dataset"
            value={exportDataset}
            onChange={(e) => setExportDataset(e.target.value as 'a' | 'b')}
          >
            <option value="a">BOM A</option>
            <option value="b">BOM B</option>
          </select>
          <select
            className="export-select export-select--format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'eco' | 'ccf' | 'msf' | 'pws' | 'bd' | 'rpt')}
          >
            <option value="eco">PADS-ECO</option>
            <option value="ccf">CCF</option>
            <option value="msf">MSF</option>
            <option value="pws">PWS</option>
            <option value="bd">BD</option>
            <option value="rpt">PADSレポート</option>
          </select>
          <button
            type="button"
            className="outline-button"
            onClick={handleExport}
            disabled={!canExport}
            data-tooltip="選択したBOMを指定形式で出力します"
          >
            出力
          </button>
        </div>

        <div className="primary-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onCompare}
            disabled={!canCompare}
            data-tooltip="BOM AとBOM Bの差分を比較します"
          >
            差分を比較
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={onReplace}
            disabled={!canCompare}
            data-tooltip="BOM AのデータをBOM Bで置き換えます"
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
