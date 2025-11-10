import { useMemo } from 'react';
import type {
  DictionaryTab as DictionaryTabType,
  RegistrationEntry,
  ExceptionEntry
} from '../types';

export type ApplyMode = 'replace' | 'append';
export type TargetDataset = 'a' | 'b';

export interface DictionaryTabProps {
  activeTab: DictionaryTabType;
  registrationEntries: RegistrationEntry[];
  exceptionEntries: ExceptionEntry[];
  applyMode: ApplyMode;
  targetDataset: TargetDataset;
  onTabChange: (tab: DictionaryTabType) => void;
  onLoadDictionary: () => void;
  onSaveDictionary: () => void;
  onImportDictionary: () => void;
  onExportDictionary: () => void;
  onExtractFromBOM: () => void;
  onAddRegistration: () => void;
  onRegistrationFieldChange: (index: number, field: keyof RegistrationEntry, value: string) => void;
  onRemoveRegistration: (index: number) => void;
  onClearAllRegistrations: () => void;
  onImportRegistrationCSV: () => void;
  onExportRegistrationCSV: () => void;
  onApplyRegistrationToBOM: (dataset: TargetDataset) => void;
  onAddException: () => void;
  onExceptionFieldChange: (index: number, field: keyof ExceptionEntry, value: string) => void;
  onRemoveException: (index: number) => void;
  onClearAllExceptions: () => void;
  onImportExceptionCSV: () => void;
  onExportExceptionCSV: () => void;
  onApplyExceptionToBOM: (dataset: TargetDataset) => void;
  onApplyModeChange: (mode: ApplyMode) => void;
  onTargetDatasetChange: (dataset: TargetDataset) => void;
  isProcessing?: boolean;
}

function RegistrationActions({
  isProcessing,
  applyMode,
  targetDataset,
  onExtractFromBOM,
  onAddRegistration,
  onClearAll,
  onImportCSV,
  onExportCSV,
  onApplyRegistrationToBOM,
  onApplyModeChange,
  onTargetDatasetChange
}: {
  isProcessing?: boolean;
  applyMode: ApplyMode;
  targetDataset: TargetDataset;
  onExtractFromBOM: () => void;
  onAddRegistration: () => void;
  onClearAll: () => void;
  onImportCSV: () => void;
  onExportCSV: () => void;
  onApplyRegistrationToBOM: (dataset: TargetDataset) => void;
  onApplyModeChange: (mode: ApplyMode) => void;
  onTargetDatasetChange: (dataset: TargetDataset) => void;
}) {
  const handleTargetDatasetSelect = (dataset: TargetDataset) => {
    if (isProcessing) return;
    onTargetDatasetChange(dataset);
    onApplyRegistrationToBOM(dataset);
  };

  return (
    <>
      <div className="dictionary-table-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onExtractFromBOM}
          disabled={isProcessing}
          data-tooltip="現在のBOMから部品型番と登録名を抽出します"
        >
          📋 BOMから抽出
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onAddRegistration}
          disabled={isProcessing}
          data-tooltip="新しい登録名エントリを追加します"
        >
          ➕ 行を追加
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={onClearAll}
          disabled={isProcessing}
          data-tooltip="すべての登録名エントリを削除します"
        >
          🗑️ 全削除
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onImportCSV}
          disabled={isProcessing}
          data-tooltip="CSVファイルから登録名リストをインポートします"
        >
          📁 CSVインポート
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onExportCSV}
          disabled={isProcessing}
          data-tooltip="登録名リストをCSV形式でエクスポートします"
        >
          💾 CSVエクスポート
        </button>
      </div>
      <div className="dictionary-apply-section">
        <div className="apply-config-group">
          <div className="config-section compact">
            <div className="config-label">
              <span className="label-icon">⚙️</span>
              <span className="label-text">適用モード</span>
            </div>
            <div className="apply-mode-selector">
              <label className={applyMode === 'replace' ? 'active' : ''}>
                <input
                  type="radio"
                  name="applyMode"
                  value="replace"
                  checked={applyMode === 'replace'}
                  onChange={() => onApplyModeChange('replace')}
                  disabled={isProcessing}
                />
                <span className="radio-label">
                  <span className="radio-icon">🔄</span>
                  <span className="radio-text">置き換え</span>
                </span>
              </label>
              <label className={applyMode === 'append' ? 'active' : ''}>
                <input
                  type="radio"
                  name="applyMode"
                  value="append"
                  checked={applyMode === 'append'}
                  onChange={() => onApplyModeChange('append')}
                  disabled={isProcessing}
                />
                <span className="radio-label">
                  <span className="radio-icon">➕</span>
                  <span className="radio-text">行追加</span>
                </span>
              </label>
            </div>
          </div>
          <div className="config-section compact">
            <div className="config-label">
              <span className="label-icon">🎯</span>
              <span className="label-text">適用先BOM</span>
            </div>
            <div className="target-dataset-selector">
              <button
                type="button"
                className="secondary-button target-apply-button"
                disabled={isProcessing}
                onClick={() => handleTargetDatasetSelect('a')}
              >
                BOM Aに適用
              </button>
              <button
                type="button"
                className="primary-button target-apply-button"
                disabled={isProcessing}
                onClick={() => handleTargetDatasetSelect('b')}
              >
                BOM Bに適用
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function DictionaryTab({
  activeTab,
  registrationEntries,
  exceptionEntries,
  applyMode,
  targetDataset,
  onTabChange,
  onLoadDictionary,
  onSaveDictionary,
  onImportDictionary,
  onExportDictionary,
  onExtractFromBOM,
  onAddRegistration,
  onRegistrationFieldChange,
  onRemoveRegistration,
  onClearAllRegistrations,
  onImportRegistrationCSV,
  onExportRegistrationCSV,
  onApplyRegistrationToBOM,
  onAddException,
  onExceptionFieldChange,
  onRemoveException,
  onClearAllExceptions,
  onImportExceptionCSV,
  onExportExceptionCSV,
  onApplyExceptionToBOM,
  onApplyModeChange,
  onTargetDatasetChange,
  isProcessing = false
}: DictionaryTabProps) {
  const handleExceptionDatasetSelect = (dataset: TargetDataset) => {
    if (isProcessing) return;
    onTargetDatasetChange(dataset);
    onApplyExceptionToBOM(dataset);
  };
  const hasRegistrations = registrationEntries.length > 0;
  const hasExceptions = exceptionEntries.length > 0;

  const registrationRows = useMemo(() => {
    if (!hasRegistrations) {
      return (
        <tr className="dictionary-empty-row">
          <td colSpan={3}>
          データがありません。「BOMから抽出」または「行を追加」でデータを登録してください。
          </td>
        </tr>
      );
    }

    return registrationEntries.map((entry, index) => (
      <tr key={`registration-${index}`}>
        <td>
          <input
            type="text"
            value={entry.partNo}
            onChange={event => onRegistrationFieldChange(index, 'partNo', event.target.value)}
            disabled={isProcessing}
          />
        </td>
        <td>
          <input
            type="text"
            value={entry.registrationName}
            onChange={event => onRegistrationFieldChange(index, 'registrationName', event.target.value)}
            disabled={isProcessing}
          />
        </td>
        <td className="dictionary-row-actions">
          <button
            type="button"
            className="delete-button"
            onClick={() => onRemoveRegistration(index)}
            disabled={isProcessing}
            data-tooltip="この登録名エントリを削除します"
          >
            削除
          </button>
        </td>
      </tr>
    ));
  }, [
    hasRegistrations,
    registrationEntries,
    isProcessing,
    onRegistrationFieldChange,
    onRemoveRegistration
  ]);

  const exceptionRows = useMemo(() => {
    if (!hasExceptions) {
      return (
        <tr className="dictionary-empty-row">
          <td colSpan={4}>
            データがありません。「行を追加」で例外を登録してください。
          </td>
        </tr>
      );
    }

    return exceptionEntries.map((entry, index) => (
      <tr key={`exception-${index}`}>
        <td>
          <input
            type="text"
            value={entry.ref}
            onChange={event => onExceptionFieldChange(index, 'ref', event.target.value)}
            disabled={isProcessing}
          />
        </td>
        <td>
          <input
            type="text"
            value={entry.partNo}
            onChange={event => onExceptionFieldChange(index, 'partNo', event.target.value)}
            disabled={isProcessing}
          />
        </td>
        <td>
          <input
            type="text"
            value={entry.registrationName}
            onChange={event => onExceptionFieldChange(index, 'registrationName', event.target.value)}
            disabled={isProcessing}
          />
        </td>
        <td className="dictionary-row-actions">
          <button
            type="button"
            className="delete-button"
            onClick={() => onRemoveException(index)}
            disabled={isProcessing}
            data-tooltip="この例外エントリを削除します"
          >
            削除
          </button>
        </td>
      </tr>
    ));
  }, [
    hasExceptions,
    exceptionEntries,
    isProcessing,
    onExceptionFieldChange,
    onRemoveException
  ]);

  return (
    <section className="settings-panel" id="settings-panel-dictionary">
      <nav className="sub-tabs">
        <button
          type="button"
          className={`sub-tab${activeTab === 'registration' ? ' is-active' : ''}`}
          data-dictionary-tab="registration"
          onClick={() => onTabChange('registration')}
          disabled={isProcessing}
        >
          登録名リスト
        </button>
        <button
          type="button"
          className={`sub-tab${activeTab === 'exception' ? ' is-active' : ''}`}
          data-dictionary-tab="exception"
          onClick={() => onTabChange('exception')}
          disabled={isProcessing}
        >
          特定部品
        </button>
      </nav>

      <div className="dictionary-sync-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={onLoadDictionary}
          disabled={isProcessing}
          data-tooltip="保存された辞書ファイルを読み込みます"
        >
          ⟳ 辞書を読み込み
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onSaveDictionary}
          disabled={isProcessing}
          data-tooltip="辞書をファイルに保存します"
        >
          💾 辞書を保存
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onImportDictionary}
          disabled={isProcessing}
          data-tooltip="JSONファイルから辞書をインポートします"
        >
          📁 JSONインポート
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onExportDictionary}
          disabled={isProcessing}
          data-tooltip="辞書をJSON形式でエクスポートします"
        >
          ⬇ JSONエクスポート
        </button>
      </div>

      {activeTab === 'registration' ? (
        <div className="dictionary-content" id="dictionary-content-registration">
          <div className="dictionary-description">
            <p>
              部品型番と登録名（社内表記名）を紐付けて管理します。BOMに適用すると、同じ型番に自動で同じ登録名が割り当てられます。
            </p>
          </div>
          <RegistrationActions
            isProcessing={isProcessing}
            applyMode={applyMode}
            targetDataset={targetDataset}
            onExtractFromBOM={onExtractFromBOM}
            onAddRegistration={onAddRegistration}
            onClearAll={onClearAllRegistrations}
            onImportCSV={onImportRegistrationCSV}
            onExportCSV={onExportRegistrationCSV}
            onApplyRegistrationToBOM={onApplyRegistrationToBOM}
            onApplyModeChange={onApplyModeChange}
            onTargetDatasetChange={onTargetDatasetChange}
          />
          <div className="dictionary-table-wrapper">
            <table className="dictionary-table">
              <thead>
                <tr>
                  <th>部品型番 (Part No)</th>
                  <th>登録名</th>
                  <th style={{ width: '110px' }}>操作</th>
                </tr>
              </thead>
              <tbody id="registration-table-body">{registrationRows}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="dictionary-content" id="dictionary-content-exception">
          <div className="dictionary-description">
            <p>
              特定の部品番号（Ref）に対して登録名リストとは別の登録名を割り当てます。登録名リストより優先して適用されます。
            </p>
          </div>
          <div className="dictionary-table-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onAddException}
              disabled={isProcessing}
              data-tooltip="新しい例外エントリを追加します"
            >
              ➕ 行を追加
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={onClearAllExceptions}
              disabled={isProcessing}
              data-tooltip="すべての例外エントリを削除します"
            >
              🗑️ 全削除
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onImportExceptionCSV}
              disabled={isProcessing}
              data-tooltip="CSVファイルから例外リストをインポートします"
            >
              📁 CSVインポート
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onExportExceptionCSV}
              disabled={isProcessing}
              data-tooltip="例外リストをCSV形式でエクスポートします"
            >
              💾 CSVエクスポート
            </button>
          </div>
          <div className="dictionary-apply-section">
            <div className="apply-config-group">
              <div className="config-section compact">
                <div className="config-label">
                  <span className="label-icon">⚙️</span>
                  <span className="label-text">適用モード</span>
                </div>
                <div className="apply-mode-selector">
                  <label className={applyMode === 'replace' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="applyModeException"
                      value="replace"
                      checked={applyMode === 'replace'}
                      onChange={() => onApplyModeChange('replace')}
                      disabled={isProcessing}
                    />
                    <span className="radio-label">
                      <span className="radio-icon">🔄</span>
                      <span className="radio-text">置き換え</span>
                    </span>
                  </label>
                  <label className={applyMode === 'append' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="applyModeException"
                      value="append"
                      checked={applyMode === 'append'}
                      onChange={() => onApplyModeChange('append')}
                      disabled={isProcessing}
                    />
                    <span className="radio-label">
                      <span className="radio-icon">➕</span>
                      <span className="radio-text">行追加</span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="config-section compact">
                <div className="config-label">
                  <span className="label-icon">🎯</span>
                  <span className="label-text">適用先BOM</span>
                </div>
                <div className="target-dataset-selector">
                  <button
                    type="button"
                    className="secondary-button target-apply-button"
                    disabled={isProcessing}
                    onClick={() => handleExceptionDatasetSelect('a')}
                  >
                    BOM Aに適用
                  </button>
                  <button
                    type="button"
                    className="primary-button target-apply-button"
                    disabled={isProcessing}
                    onClick={() => handleExceptionDatasetSelect('b')}
                  >
                    BOM Bに適用
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="dictionary-table-wrapper">
            <table className="dictionary-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>部品型番 (Part No)</th>
                  <th>登録名</th>
                  <th style={{ width: '110px' }}>操作</th>
                </tr>
              </thead>
              <tbody id="exception-table-body">{exceptionRows}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
