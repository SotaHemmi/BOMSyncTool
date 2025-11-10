import { useMemo, useState } from 'react';
import type { ExportGroupConfig } from './exportTypes';

interface ResultsActionBarProps {
  onPrint?: () => void;
  exportGroups?: ExportGroupConfig[];
  disabled?: boolean;
  hasData?: boolean;
  showPrint?: boolean;
}

const hasHandlers = (group: ExportGroupConfig): boolean =>
  Object.values(group.handlers).some(handler => typeof handler === 'function');

// フォーマット選択肢の定義
const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'eco', label: 'PADS-ECO' },
  { value: 'ccf', label: 'CCF' },
  { value: 'msf', label: 'MSF' },
  { value: 'pws', label: 'PWS' },
  { value: 'bd', label: 'BD' },
  { value: 'padsReport', label: 'PADSレポート' }
] as const;

type ExportFormat = (typeof FORMAT_OPTIONS)[number]['value'];

interface ExportGroupProps {
  group: ExportGroupConfig;
  disabled: boolean;
}

function ExportGroup({ group, disabled }: ExportGroupProps) {
  // 利用可能な最初のフォーマットをデフォルトにする
  const availableFormats = useMemo(() => {
    return FORMAT_OPTIONS.filter(opt => group.handlers[opt.value as keyof typeof group.handlers]);
  }, [group.handlers]);

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(
    (availableFormats[0]?.value as ExportFormat) || 'csv'
  );

  const handleExport = () => {
    const handler = group.handlers[selectedFormat as keyof typeof group.handlers];
    if (handler && typeof handler === 'function') {
      handler();
    }
  };

  if (availableFormats.length === 0) {
    return null;
  }

  return (
    <div className="results-export-group" data-export-source={group.source}>
      <span className="results-export-title">{group.label}</span>
      <div className="results-export-controls">
        <select
          className="export-select export-select--format"
          value={selectedFormat}
          onChange={(e) => setSelectedFormat(e.target.value as ExportFormat)}
          disabled={disabled}
        >
          {availableFormats.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="outline-button"
          onClick={handleExport}
          disabled={disabled}
          data-tooltip={`${group.label}を選択した形式でエクスポートします`}
        >
          出力
        </button>
      </div>
    </div>
  );
}

export function ResultsActionBar({
  onPrint,
  exportGroups,
  disabled = false,
  hasData = true,
  showPrint = true
}: ResultsActionBarProps) {
  const visibleGroups = useMemo(() => {
    if (!exportGroups) return [];
    return exportGroups.filter(group => {
      if (group.visible === undefined) return hasHandlers(group);
      return group.visible && hasHandlers(group);
    });
  }, [exportGroups]);

  const actionsDisabled = disabled || !hasData;
  const hasAnyAction = (showPrint && Boolean(onPrint)) || visibleGroups.length > 0;
  if (!hasAnyAction) {
    return null;
  }

  const handlePrint = () => {
    if (actionsDisabled) return;
    if (onPrint) {
      onPrint();
    } else if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="results-actions">
      {showPrint ? (
        <button
          id="print-results"
          type="button"
          className="ghost-button"
          onClick={handlePrint}
          disabled={actionsDisabled}
          data-tooltip="比較結果を印刷します"
        >
          印刷
        </button>
      ) : null}
      {visibleGroups.map(group => (
        <ExportGroup key={group.source} group={group} disabled={actionsDisabled} />
      ))}
    </div>
  );
}
