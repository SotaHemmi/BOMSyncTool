import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import type {
  ColumnMeta,
  ColumnRole,
  DatasetKey,
  ParseError
} from '../types';
import { datasetLabel, formatDateLabel } from '../utils';
import EditableTable from './EditableTable';
import { CloseIcon } from './icons';

export interface EditModalDataset {
  dataset: DatasetKey;
  columns: ColumnMeta[];
  rows: string[][];
  headerRoles: Record<string, ColumnRole>;
  structuredErrors?: ParseError[] | null;
  fileName?: string | null;
  lastUpdated?: string | null;
}

export interface EditPreprocessOptions {
  expandReference: boolean;
  splitReferenceRows: boolean;
  fillBlankCells: boolean;
  cleanseTextData: boolean;
  applyFormatRules: boolean;
}

interface FindReplaceState {
  find: string;
  replace: string;
}

const DATASET_KEYS: DatasetKey[] = ['a', 'b'];

const DEFAULT_PREPROCESS_OPTIONS: EditPreprocessOptions = {
  expandReference: false,
  splitReferenceRows: false,
  fillBlankCells: false,
  cleanseTextData: false,
  applyFormatRules: false
};

const COLUMN_ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> = [
  { value: 'ref', label: 'Ref (部品番号)' },
  { value: 'part_no', label: 'Part No (部品型番)' },
  { value: 'manufacturer', label: 'Manufacturer (メーカー)' },
  { value: 'ignore', label: 'Ignore (指定しない)' }
];

const SEVERITY_CLASS_MAP: Record<'error' | 'warning' | 'info', string> = {
  error: 'error',
  warning: 'warning',
  info: 'info'
};

export interface EditModalProps {
  open: boolean;
  activeDataset: DatasetKey;
  datasets: Partial<Record<DatasetKey, EditModalDataset | null>>;
  onOpenChange: (open: boolean) => void;
  onDatasetChange: (dataset: DatasetKey) => void;
  onCellChange: (dataset: DatasetKey, rowIndex: number, columnIndex: number, value: string) => void;
  onHeaderRoleChange: (dataset: DatasetKey, columnId: string, role: ColumnRole | null) => void;
  onApply: (dataset: DatasetKey) => void;
  onClose: () => void;
  onApplyReplace: (dataset: DatasetKey, payload: FindReplaceState) => void;
  onApplyPreprocess: (dataset: DatasetKey, options: EditPreprocessOptions) => void;
  onFindReplaceChange?: (dataset: DatasetKey, payload: FindReplaceState) => void;
  onPreprocessOptionChange?: (
    dataset: DatasetKey,
    option: keyof EditPreprocessOptions,
    value: boolean
  ) => void;
  onCellFocus?: (dataset: DatasetKey, rowIndex: number, columnIndex: number) => void;
  findReplaceValues?: Partial<Record<DatasetKey, FindReplaceState>>;
  preprocessOptions?: Partial<Record<DatasetKey, EditPreprocessOptions>>;
  highlightedCell?: { row: number; column: number } | null;
  onWarningCellClick?: (dataset: DatasetKey, row: number, column: number) => void;
  formatRulesVisible?: Partial<Record<DatasetKey, boolean>>;
  onToggleFormatRules?: (dataset: DatasetKey, nextVisible: boolean) => void;
  formatRulesContent?: ReactNode;
  applying?: boolean;
  onAddRow?: (dataset: DatasetKey) => void;
  onDeleteRow?: (dataset: DatasetKey, rowIndex: number) => void;
  onReorderColumns?: (dataset: DatasetKey, fromIndex: number, toIndex: number) => void;
}

export function EditModal({
  open,
  activeDataset,
  datasets,
  onOpenChange,
  onDatasetChange,
  onCellChange,
  onHeaderRoleChange,
  onApply,
  onClose,
  onApplyReplace,
  onApplyPreprocess,
  onFindReplaceChange,
  onPreprocessOptionChange,
  onCellFocus,
  findReplaceValues,
  preprocessOptions,
  highlightedCell,
  onWarningCellClick,
  formatRulesVisible,
  onToggleFormatRules,
  formatRulesContent,
  applying = false,
  onAddRow,
  onDeleteRow,
  onReorderColumns
}: EditModalProps) {
  const [localFindReplace, setLocalFindReplace] = useState<Record<DatasetKey, FindReplaceState>>(() => ({
    a: { find: '', replace: '' },
    b: { find: '', replace: '' }
  }));
  const [localPreprocess, setLocalPreprocess] = useState<Record<DatasetKey, EditPreprocessOptions>>(() => ({
    a: { ...DEFAULT_PREPROCESS_OPTIONS },
    b: { ...DEFAULT_PREPROCESS_OPTIONS }
  }));
  const [localFormatRulesVisible, setLocalFormatRulesVisible] = useState<Record<DatasetKey, boolean>>(() => ({
    a: false,
    b: false
  }));

  useEffect(() => {
    if (!findReplaceValues) return;
    setLocalFindReplace(prev => {
      const next = { ...prev };
      DATASET_KEYS.forEach(dataset => {
        if (findReplaceValues[dataset]) {
          next[dataset] = {
            find: findReplaceValues[dataset]!.find ?? '',
            replace: findReplaceValues[dataset]!.replace ?? ''
          };
        }
      });
      return next;
    });
  }, [findReplaceValues]);

  useEffect(() => {
    if (!preprocessOptions) return;
    setLocalPreprocess(prev => {
      const next = { ...prev };
      DATASET_KEYS.forEach(dataset => {
        if (preprocessOptions[dataset]) {
          next[dataset] = {
            expandReference: preprocessOptions[dataset]!.expandReference ?? false,
            splitReferenceRows: preprocessOptions[dataset]!.splitReferenceRows ?? false,
            fillBlankCells: preprocessOptions[dataset]!.fillBlankCells ?? false,
            cleanseTextData: preprocessOptions[dataset]!.cleanseTextData ?? false,
            applyFormatRules: preprocessOptions[dataset]!.applyFormatRules ?? false
          };
        }
      });
      return next;
    });
  }, [preprocessOptions]);

  useEffect(() => {
    if (!formatRulesVisible) return;
    setLocalFormatRulesVisible(prev => {
      const next = { ...prev };
      DATASET_KEYS.forEach(dataset => {
        if (formatRulesVisible[dataset] !== undefined) {
          next[dataset] = Boolean(formatRulesVisible[dataset]);
        }
      });
      return next;
    });
  }, [formatRulesVisible]);

  const activeDatasetData = datasets[activeDataset] ?? null;

  const summaryText = useMemo(() => {
    if (!activeDatasetData) {
      return `${datasetLabel(activeDataset)} のデータがありません`;
    }
    const rowCount = activeDatasetData.rows.length;
    const parts = [
      `${datasetLabel(activeDataset)} / 行数 ${rowCount.toLocaleString()}`,
      activeDatasetData.fileName ? `ファイル ${activeDatasetData.fileName}` : null,
      activeDatasetData.lastUpdated ? `更新 ${formatDateLabel(activeDatasetData.lastUpdated)}` : null
    ].filter(Boolean);
    return parts.join(' / ');
  }, [activeDataset, activeDatasetData]);

  const handleDatasetChange = (dataset: string) => {
    if (dataset === 'a' || dataset === 'b') {
      onDatasetChange(dataset);
    }
  };

  const handleRoleChange =
    (dataset: DatasetKey, columnId: string) => (event: ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value as ColumnRole;
      onHeaderRoleChange(dataset, columnId, nextValue === 'ignore' ? null : nextValue);
    };

  const handleFindChange = (dataset: DatasetKey) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalFindReplace(prev => {
      const next = { ...prev, [dataset]: { ...prev[dataset], find: value } };
      if (onFindReplaceChange) {
        onFindReplaceChange(dataset, next[dataset]);
      }
      return next;
    });
  };

  const handleReplaceChange = (dataset: DatasetKey) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalFindReplace(prev => {
      const next = { ...prev, [dataset]: { ...prev[dataset], replace: value } };
      if (onFindReplaceChange) {
        onFindReplaceChange(dataset, next[dataset]);
      }
      return next;
    });
  };

  const handlePreprocessChange =
    (dataset: DatasetKey, option: keyof EditPreprocessOptions) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setLocalPreprocess(prev => {
        const next = {
          ...prev,
          [dataset]: {
            ...prev[dataset],
            [option]: checked
          }
        };
        if (onPreprocessOptionChange) {
          onPreprocessOptionChange(dataset, option, checked);
        }
        return next;
      });
    };

  const handleApplyReplace = (dataset: DatasetKey) => {
    const payload = localFindReplace[dataset];
    onApplyReplace(dataset, payload);
  };

  const handleApplyPreprocess = (dataset: DatasetKey) => {
    const payload = localPreprocess[dataset];
    onApplyPreprocess(dataset, payload);
  };

  const handleToggleFormatRules = (dataset: DatasetKey) => {
    setLocalFormatRulesVisible(prev => {
      const nextVisible = !prev[dataset];
      if (onToggleFormatRules) {
        onToggleFormatRules(dataset, nextVisible);
      }
      return { ...prev, [dataset]: nextVisible };
    });
  };

  const renderWarnings = (dataset: DatasetKey, errors: ParseError[] | null | undefined) => {
    if (!errors || errors.length === 0) {
      return null;
    }
    return (
      <div className="modal-warnings" id="edit-warnings">
        <h4>警告・エラー</h4>
        <ul id="edit-warnings-list">
          {errors.map((error, index) => {
            const severity = (error.severity as 'error' | 'warning' | 'info') ?? 'warning';
            const className = SEVERITY_CLASS_MAP[severity] ?? 'warning';
            const handleClick = () => {
              if (
                onWarningCellClick &&
                typeof error.row === 'number' &&
                typeof error.column === 'number'
              ) {
                onWarningCellClick(dataset, error.row, error.column);
              }
            };
            const isNavigable =
              typeof error.row === 'number' && typeof error.column === 'number' && Boolean(onWarningCellClick);
            return (
              <li
                key={`${error.message}-${index}`}
                className={className}
                onClick={isNavigable ? handleClick : undefined}
                role={isNavigable ? 'button' : undefined}
                tabIndex={isNavigable ? 0 : undefined}
                title={isNavigable ? 'クリックして該当セルへ移動' : undefined}
                onKeyDown={
                  isNavigable
                    ? event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleClick();
                        }
                      }
                    : undefined
                }
                style={isNavigable ? { cursor: 'pointer' } : undefined}
              >
                {error.message}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderDatasetContent = (dataset: DatasetKey) => {
    const data = datasets[dataset] ?? null;
    const findReplace = localFindReplace[dataset] ?? { find: '', replace: '' };
    const preprocess = localPreprocess[dataset] ?? DEFAULT_PREPROCESS_OPTIONS;
    const showFormatRules = localFormatRulesVisible[dataset] ?? false;

    return (
      <>
        <section className="modal-main">
          {data ? (
            <>
              <EditableTable
                columns={data.columns}
                rows={data.rows}
                structuredErrors={data.structuredErrors}
                highlightedCell={dataset === activeDataset ? highlightedCell : null}
                onCellChange={(rowIndex, columnIndex, value) =>
                  onCellChange(dataset, rowIndex, columnIndex, value)
                }
                onCellFocus={onCellFocus ? (rowIndex, columnIndex) => onCellFocus(dataset, rowIndex, columnIndex) : undefined}
                onAddRow={onAddRow ? () => onAddRow(dataset) : undefined}
                onDeleteRow={onDeleteRow ? (rowIndex) => onDeleteRow(dataset, rowIndex) : undefined}
                onReorderColumns={onReorderColumns ? (fromIndex, toIndex) => onReorderColumns(dataset, fromIndex, toIndex) : undefined}
              />
              {renderWarnings(dataset, data.structuredErrors)}
            </>
          ) : (
            <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
              {datasetLabel(dataset)} のデータが読み込まれていません。
            </p>
          )}
        </section>

        <aside className="modal-aside">
          <div className="modal-group">
            <h3>列の役割（部品番号 / 部品型番 / メーカー名）</h3>
            <div id="header-role-controls">
              {data
                ? data.columns.map((column, index) => (
                    <label key={column.id} className="header-role">
                      <span>{`${index + 1}. ${column.name}`}</span>
                      <select
                        value={data.headerRoles[column.id] ?? 'ignore'}
                        onChange={handleRoleChange(dataset, column.id)}
                      >
                        {COLUMN_ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))
                : null}
            </div>
          </div>

          <div className="modal-group">
            <h3>文字列置換</h3>
            <label>
              <span style={{ fontSize: '13px', color: '#324559' }}>検索する文字列</span>
              <input
                type="text"
                value={findReplace.find}
                onChange={handleFindChange(dataset)}
                placeholder="置換前の文字列"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  marginTop: '4px'
                }}
              />
            </label>
            <label style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '13px', color: '#324559' }}>置換後の文字列</span>
              <input
                type="text"
                value={findReplace.replace}
                onChange={handleReplaceChange(dataset)}
                placeholder="置換後の文字列"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  marginTop: '4px'
                }}
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              id="apply-replace"
              style={{ marginTop: '8px', width: '100%' }}
              onClick={() => handleApplyReplace(dataset)}
              disabled={!data}
            >
              置換を実行
            </button>
          </div>

          <div className="modal-group">
            <h3>前処理</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={preprocess.expandReference}
                onChange={handlePreprocessChange(dataset, 'expandReference')}
              />
              Referenceの展開（例: C1-C4 → C1, C2, C3, C4）
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={preprocess.splitReferenceRows}
                onChange={handlePreprocessChange(dataset, 'splitReferenceRows')}
              />
              Referenceを行分割（1つのRefに複数Part_Noがある場合）
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={preprocess.fillBlankCells}
                onChange={handlePreprocessChange(dataset, 'fillBlankCells')}
              />
              空欄セルの補完
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={preprocess.cleanseTextData}
                onChange={handlePreprocessChange(dataset, 'cleanseTextData')}
              />
              テキストデータのクレンジング
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={preprocess.applyFormatRules}
                onChange={handlePreprocessChange(dataset, 'applyFormatRules')}
              />
              書式ルールの適用
            </label>
            <button
              type="button"
              className="ghost-button"
              id="toggle-format-rules"
              style={{ marginTop: '8px', fontSize: '12px' }}
              onClick={() => handleToggleFormatRules(dataset)}
              disabled={!data}
            >
              ⚙️ 書式ルール設定
            </button>
            <div
              id="format-rules-config"
              className="format-rules-config"
              hidden={!showFormatRules}
            >
              <h4>書式ルール</h4>
              <div id="format-rules-list">
                {formatRulesContent && showFormatRules ? (
                  formatRulesContent
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="secondary-button"
              id="apply-preprocess"
              style={{ marginTop: '12px', width: '100%' }}
              onClick={() => handleApplyPreprocess(dataset)}
              disabled={!data}
            >
              前処理を適用
            </button>
          </div>
        </aside>
      </>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal" id="edit-modal">
          <form method="dialog" className="modal-inner" onSubmit={event => event.preventDefault()}>
            <header className="modal-header">
              <div>
                <Dialog.Title id="edit-modal-title">編集モード</Dialog.Title>
                <Dialog.Description
                  id="edit-modal-subtitle"
                  className="modal-subtitle"
                >
                  {summaryText}
                </Dialog.Description>
              </div>
              <Tabs.Root value={activeDataset} onValueChange={handleDatasetChange}>
                <Tabs.List className="dataset-toggle" aria-label="編集対象BOM">
                  {DATASET_KEYS.map(dataset => (
                    <Tabs.Trigger
                      key={dataset}
                      className={`tab${activeDataset === dataset ? ' is-active' : ''}`}
                      value={dataset}
                    >
                      {datasetLabel(dataset)}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Tabs.Root>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="閉じる"
                  onClick={onClose}
                >
                  <CloseIcon className="icon-button-close-icon" />
                </button>
              </Dialog.Close>
            </header>

            <div className="modal-body">{renderDatasetContent(activeDataset)}</div>

            <footer className="modal-footer">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onClose}
                >
                  閉じる
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="primary-button"
                id="apply-edit"
                onClick={() => onApply(activeDataset)}
                disabled={applying || !activeDatasetData}
              >
                適用
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
