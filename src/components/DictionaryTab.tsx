import { useMemo } from 'react';
import type {
  DictionaryTab as DictionaryTabType,
  RegistrationEntry,
  ExceptionEntry
} from '../types';

export interface DictionaryTabProps {
  activeTab: DictionaryTabType;
  registrationEntries: RegistrationEntry[];
  exceptionEntries: ExceptionEntry[];
  onTabChange: (tab: DictionaryTabType) => void;
  onLoadDictionary: () => void;
  onSaveDictionary: () => void;
  onImportDictionary: () => void;
  onExportDictionary: () => void;
  onExtractFromBOM: () => void;
  onAddRegistration: () => void;
  onRegistrationFieldChange: (index: number, field: keyof RegistrationEntry, value: string) => void;
  onRemoveRegistration: (index: number) => void;
  onImportRegistrationCSV: () => void;
  onExportRegistrationCSV: () => void;
  onApplyRegistrationToBOM: () => void;
  onAddException: () => void;
  onExceptionFieldChange: (index: number, field: keyof ExceptionEntry, value: string) => void;
  onRemoveException: (index: number) => void;
  onImportExceptionCSV: () => void;
  onExportExceptionCSV: () => void;
  onApplyExceptionToBOM: () => void;
  isProcessing?: boolean;
}

function RegistrationActions({
  isProcessing,
  onExtractFromBOM,
  onAddRegistration,
  onImportCSV,
  onExportCSV,
  onApplyRegistrationToBOM
}: {
  isProcessing?: boolean;
  onExtractFromBOM: () => void;
  onAddRegistration: () => void;
  onImportCSV: () => void;
  onExportCSV: () => void;
  onApplyRegistrationToBOM: () => void;
}) {
  return (
    <div className="dictionary-table-actions">
      <button
        type="button"
        className="secondary-button"
        onClick={onExtractFromBOM}
        disabled={isProcessing}
      >
        📋 BOMから抽出
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={onAddRegistration}
        disabled={isProcessing}
      >
        ➕ 行を追加
      </button>
      <button
        type="button"
        className="ghost-button"
        onClick={onImportCSV}
        disabled={isProcessing}
      >
        📁 CSVインポート
      </button>
      <button
        type="button"
        className="ghost-button"
        onClick={onExportCSV}
        disabled={isProcessing}
      >
        💾 CSVエクスポート
      </button>
      <button
        type="button"
        className="primary-button"
        onClick={onApplyRegistrationToBOM}
        disabled={isProcessing}
      >
        ✅ BOMに適用
      </button>
    </div>
  );
}

export function DictionaryTab({
  activeTab,
  registrationEntries,
  exceptionEntries,
  onTabChange,
  onLoadDictionary,
  onSaveDictionary,
  onImportDictionary,
  onExportDictionary,
  onExtractFromBOM,
  onAddRegistration,
  onRegistrationFieldChange,
  onRemoveRegistration,
  onImportRegistrationCSV,
  onExportRegistrationCSV,
  onApplyRegistrationToBOM,
  onAddException,
  onExceptionFieldChange,
  onRemoveException,
  onImportExceptionCSV,
  onExportExceptionCSV,
  onApplyExceptionToBOM,
  isProcessing = false
}: DictionaryTabProps) {
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
        >
          ⟳ 辞書を読み込み
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onSaveDictionary}
          disabled={isProcessing}
        >
          💾 辞書を保存
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onImportDictionary}
          disabled={isProcessing}
        >
          📁 JSONインポート
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onExportDictionary}
          disabled={isProcessing}
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
            onExtractFromBOM={onExtractFromBOM}
            onAddRegistration={onAddRegistration}
            onImportCSV={onImportRegistrationCSV}
            onExportCSV={onExportRegistrationCSV}
            onApplyRegistrationToBOM={onApplyRegistrationToBOM}
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
            >
              ➕ 行を追加
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onImportExceptionCSV}
              disabled={isProcessing}
            >
              📁 CSVインポート
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onExportExceptionCSV}
              disabled={isProcessing}
            >
              💾 CSVエクスポート
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onApplyExceptionToBOM}
              disabled={isProcessing}
            >
              ✅ BOMに適用
            </button>
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
