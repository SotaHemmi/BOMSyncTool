import { useCallback, useMemo, useState } from 'react';
import type {
  DictionaryTab,
  RegistrationEntry,
  ExceptionEntry,
  ParseResult,
  DatasetKey,
  ColumnMeta
} from '../types';
import {
  loadRegistrationData,
  saveRegistrationData,
  loadExceptionData,
  saveExceptionData,
  setProcessing,
  logActivity,
  getRef,
  getPartNo,
  stringifyJSON,
  setCellValue
} from '../utils';
import {
  loadDictionary,
  saveDictionary,
  loadSessionFromFile,
  saveSessionToFile
} from '../services';
import { datasetState } from '../state/app-state';
import {
  open,
  save
} from '@tauri-apps/plugin-dialog';

const REGISTRATION_DICTIONARY_NAME = 'ipc_master';
const EXCEPTION_DICTIONARY_NAME = 'exception_master';

function normalizeRegistrationEntries(raw: unknown): RegistrationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item !== 'object' || item === null) {
      return { partNo: '', registrationName: '' };
    }
    const record = item as Record<string, unknown>;
    const partNo = typeof record.partNo === 'string'
      ? record.partNo
      : typeof record.part_no === 'string'
        ? record.part_no
        : '';
    const registrationName = typeof record.registrationName === 'string'
      ? record.registrationName
      : typeof record.registration_name === 'string'
        ? record.registration_name
        : '';
    return {
      partNo: partNo.trim(),
      registrationName: registrationName.trim()
    };
  });
}

function normalizeExceptionEntries(raw: unknown): ExceptionEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item !== 'object' || item === null) {
      return { ref: '', partNo: '', registrationName: '' };
    }
    const record = item as Record<string, unknown>;
    const ref = typeof record.ref === 'string' ? record.ref : '';
    const partNo = typeof record.partNo === 'string'
      ? record.partNo
      : typeof record.part_no === 'string'
        ? record.part_no
        : '';
    const registrationName = typeof record.registrationName === 'string'
      ? record.registrationName
      : typeof record.registration_name === 'string'
        ? record.registration_name
        : '';
    return {
      ref: ref.trim(),
      partNo: partNo.trim(),
      registrationName: registrationName.trim()
    };
  });
}

function registrationsToJson(entries: RegistrationEntry[]): string {
  const payload = entries.map(entry => ({
    part_no: entry.partNo,
    registration_name: entry.registrationName
  }));
  return JSON.stringify(payload, null, 2);
}

function exceptionsToJson(entries: ExceptionEntry[]): string {
  const payload = entries.map(entry => ({
    ref: entry.ref,
    part_no: entry.partNo,
    registration_name: entry.registrationName
  }));
  return JSON.stringify(payload, null, 2);
}

function ensureColumns(parseResult: ParseResult): ColumnMeta[] {
  if (parseResult.columns && parseResult.columns.length > 0) {
    return parseResult.columns;
  }

  const rowLength = parseResult.rows[0]?.length ?? 0;
  const headers = parseResult.headers && parseResult.headers.length > 0
    ? parseResult.headers
    : Array.from({ length: rowLength }, (_, index) => `Column ${index + 1}`);

  const columns = headers.map((name, index) => ({
    id: parseResult.column_order?.[index] ?? `col-${index}`,
    name
  }));

  parseResult.columns = columns;
  if (!parseResult.column_order || parseResult.column_order.length === 0) {
    parseResult.column_order = columns.map(column => column.id);
  }
  if (!parseResult.headers || parseResult.headers.length === 0) {
    parseResult.headers = headers;
  }
  return columns;
}

function ensureRegistrationColumn(dataset: DatasetKey, parseResult: ParseResult): number {
  const columns = ensureColumns(parseResult);

  const headerName = 'Registration Name';
  let index = columns.findIndex(column => column.name === headerName);
  if (index >= 0) {
    return index;
  }

  let nextId = `col-${columns.length}`;
  const existingIds = new Set(columns.map(column => column.id));
  while (existingIds.has(nextId)) {
    nextId = `col-${existingIds.size + 1}`;
  }

  const newColumn = {
    id: nextId,
    name: headerName
  };
  columns.push(newColumn);
  parseResult.columns = columns;
  parseResult.column_order = [...(parseResult.column_order ?? []), newColumn.id];
  parseResult.headers = columns.map(column => column.name);

  parseResult.rows.forEach(row => {
    while (row.length < columns.length) {
      row.push('');
    }
  });

  datasetState[dataset].columnRoles = datasetState[dataset].columnRoles ?? {};
  return columns.length - 1;
}

export interface UseDictionaryResult {
  activeTab: DictionaryTab;
  registrationEntries: RegistrationEntry[];
  exceptionEntries: ExceptionEntry[];
  setActiveTab: (tab: DictionaryTab) => void;
  addRegistration: () => void;
  removeRegistration: (index: number) => void;
  updateRegistration: (index: number, field: keyof RegistrationEntry, value: string) => void;
  addException: () => void;
  removeException: (index: number) => void;
  updateException: (index: number, field: keyof ExceptionEntry, value: string) => void;
  loadDictionaryFile: () => Promise<void>;
  saveDictionaryFile: () => Promise<void>;
  importDictionaryFile: () => Promise<void>;
  exportDictionaryFile: () => Promise<void>;
  extractFromBOM: () => Promise<void>;
  importRegistrationCSV: () => Promise<void>;
  exportRegistrationCSV: () => Promise<void>;
  importExceptionCSV: () => Promise<void>;
  exportExceptionCSV: () => Promise<void>;
  applyRegistrationToBOM: () => Promise<number>;
  reload: () => void;
}

export function useDictionary(): UseDictionaryResult {
  const [activeTab, setActiveTab] = useState<DictionaryTab>('registration');
  const [registrationEntries, setRegistrationEntries] = useState<RegistrationEntry[]>(
    () => loadRegistrationData()
  );
  const [exceptionEntries, setExceptionEntries] = useState<ExceptionEntry[]>(
    () => loadExceptionData()
  );

  const currentDictionaryName = useMemo(
    () => (activeTab === 'exception' ? EXCEPTION_DICTIONARY_NAME : REGISTRATION_DICTIONARY_NAME),
    [activeTab]
  );

  const persistRegistrations = useCallback(
    (entries: RegistrationEntry[]) => {
      setRegistrationEntries(entries);
      saveRegistrationData(entries);
    },
    []
  );

  const persistExceptions = useCallback(
    (entries: ExceptionEntry[]) => {
      setExceptionEntries(entries);
      saveExceptionData(entries);
    },
    []
  );

  const addRegistration = useCallback(() => {
    persistRegistrations([
      ...registrationEntries,
      { partNo: '', registrationName: '' }
    ]);
  }, [persistRegistrations, registrationEntries]);

  const removeRegistration = useCallback(
    (index: number) => {
      persistRegistrations(registrationEntries.filter((_, i) => i !== index));
    },
    [persistRegistrations, registrationEntries]
  );

  const updateRegistration = useCallback(
    (index: number, field: keyof RegistrationEntry, value: string) => {
      persistRegistrations(
        registrationEntries.map((entry, i) =>
          i === index ? { ...entry, [field]: value } : entry
        )
      );
    },
    [persistRegistrations, registrationEntries]
  );

  const addException = useCallback(() => {
    persistExceptions([
      ...exceptionEntries,
      { ref: '', partNo: '', registrationName: '' }
    ]);
  }, [exceptionEntries, persistExceptions]);

  const removeException = useCallback(
    (index: number) => {
      persistExceptions(exceptionEntries.filter((_, i) => i !== index));
    },
    [exceptionEntries, persistExceptions]
  );

  const updateException = useCallback(
    (index: number, field: keyof ExceptionEntry, value: string) => {
      persistExceptions(
        exceptionEntries.map((entry, i) =>
          i === index ? { ...entry, [field]: value } : entry
        )
      );
    },
    [exceptionEntries, persistExceptions]
  );

  const loadDictionaryFile = useCallback(async () => {
    try {
      setProcessing(true, '辞書を読み込み中...');
      const raw = await loadDictionary(currentDictionaryName);
      const parsed = JSON.parse(raw) as unknown;

      if (activeTab === 'exception') {
        const entries = normalizeExceptionEntries(parsed);
        persistExceptions(entries);
      } else {
        const entries = normalizeRegistrationEntries(parsed);
        persistRegistrations(entries);
      }
      logActivity('辞書を読み込みました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`辞書の読み込みに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [activeTab, currentDictionaryName, persistExceptions, persistRegistrations]);

  const saveDictionaryFile = useCallback(async () => {
    try {
      setProcessing(true, '辞書を書き込み中...');
      const payload =
        activeTab === 'exception'
          ? exceptionsToJson(exceptionEntries)
          : registrationsToJson(registrationEntries);
      await saveDictionary(currentDictionaryName, stringifyJSON(payload));
      logActivity('辞書を保存しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`辞書の保存に失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [activeTab, currentDictionaryName, exceptionEntries, registrationEntries]);

  const importDictionaryFile = useCallback(async () => {
    const filePath = await open({
      filters: [{ name: 'JSON ファイル', extensions: ['json'] }]
    });
    if (!filePath || Array.isArray(filePath)) return;

    try {
      setProcessing(true, '辞書をインポート中...');
      const content = await loadSessionFromFile(filePath);
      const parsed = JSON.parse(content) as unknown;
      if (activeTab === 'exception') {
        persistExceptions(normalizeExceptionEntries(parsed));
      } else {
        persistRegistrations(normalizeRegistrationEntries(parsed));
      }
      logActivity('辞書をインポートしました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`辞書のインポートに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [activeTab, persistExceptions, persistRegistrations]);

  const exportDictionaryFile = useCallback(async () => {
    const filePath = await save({
      filters: [{ name: 'JSON ファイル', extensions: ['json'] }],
      defaultPath: `${currentDictionaryName}-${Date.now()}.json`
    });
    if (!filePath) return;

    try {
      setProcessing(true, '辞書をエクスポート中...');
      const payload =
        activeTab === 'exception'
          ? exceptionsToJson(exceptionEntries)
          : registrationsToJson(registrationEntries);
      await saveSessionToFile(filePath, stringifyJSON(payload));
      logActivity('辞書をエクスポートしました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`辞書のエクスポートに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [activeTab, currentDictionaryName, exceptionEntries, registrationEntries]);

  const extractFromBOM = useCallback(async () => {
    const dataset: DatasetKey = 'a';
    const parseResult = datasetState[dataset].parseResult;
    if (!parseResult || parseResult.rows.length === 0) {
      alert('BOMデータがありません。先にBOMを読み込んでください。');
      return;
    }

    try {
      setProcessing(true, 'BOMから抽出中...');
      const existing = new Set(
        registrationEntries.map(entry => entry.partNo.trim().toLowerCase())
      );
      let added = 0;

      parseResult.rows.forEach((_row, rowIndex) => {
        const partNo = getPartNo(parseResult, rowIndex).trim();
        if (partNo && !existing.has(partNo.toLowerCase())) {
          existing.add(partNo.toLowerCase());
          registrationEntries.push({ partNo, registrationName: '' });
          added++;
        }
      });

      persistRegistrations([...registrationEntries]);
      logActivity(`${added}件の部品番号をBOMから抽出しました。`);
      alert(`${added}件の部品番号を抽出しました。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`抽出に失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [persistRegistrations, registrationEntries]);

  const importRegistrationCSV = useCallback(async () => {
    const filePath = await open({
      filters: [{ name: 'CSV ファイル', extensions: ['csv'] }]
    });
    if (!filePath || Array.isArray(filePath)) return;

    try {
      setProcessing(true, '登録名リストをインポート中...');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(filePath);
      const lines = content.split('\n').filter(line => line.trim());
      const entries: RegistrationEntry[] = [];

      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i]!.split(',').map(part => part.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 2) {
          entries.push({
            partNo: parts[0] ?? '',
            registrationName: parts[1] ?? ''
          });
        }
      }

      persistRegistrations(entries);
      logActivity(`${entries.length}件の登録名をCSVから読み込みました。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`CSVの読み込みに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [persistRegistrations]);

  const exportRegistrationCSV = useCallback(async () => {
    if (registrationEntries.length === 0) {
      alert('エクスポートする登録名データがありません。');
      return;
    }

    const filePath = await save({
      filters: [{ name: 'CSV ファイル', extensions: ['csv'] }],
      defaultPath: `registration_${Date.now()}.csv`
    });
    if (!filePath) return;

    try {
      setProcessing(true, '登録名リストをエクスポート中...');
      const lines: string[] = ['Part No,Registration Name'];
      registrationEntries.forEach(entry => {
        const partNo = entry.partNo.includes(',') ? `"${entry.partNo}"` : entry.partNo;
        const name = entry.registrationName.includes(',')
          ? `"${entry.registrationName}"`
          : entry.registrationName;
        lines.push(`${partNo},${name}`);
      });

      const csv = lines.join('\n');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, csv);
      logActivity('登録名リストをCSVにエクスポートしました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`CSVの書き出しに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [registrationEntries]);

  const importExceptionCSV = useCallback(async () => {
    const filePath = await open({
      filters: [{ name: 'CSV ファイル', extensions: ['csv'] }]
    });
    if (!filePath || Array.isArray(filePath)) return;

    try {
      setProcessing(true, '特定部品リストをインポート中...');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(filePath);
      const lines = content.split('\n').filter(line => line.trim());
      const entries: ExceptionEntry[] = [];

      for (let i = 1; i < lines.length; i += 1) {
        const parts = lines[i]!.split(',').map(part => part.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 3) {
          entries.push({
            ref: parts[0] ?? '',
            partNo: parts[1] ?? '',
            registrationName: parts[2] ?? ''
          });
        }
      }

      persistExceptions(entries);
      logActivity(`${entries.length}件の特定部品をCSVから読み込みました。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`CSVの読み込みに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [persistExceptions]);

  const exportExceptionCSV = useCallback(async () => {
    if (exceptionEntries.length === 0) {
      alert('エクスポートする特定部品データがありません。');
      return;
    }

    const filePath = await save({
      filters: [{ name: 'CSV ファイル', extensions: ['csv'] }],
      defaultPath: `exception_${Date.now()}.csv`
    });
    if (!filePath) return;

    try {
      setProcessing(true, '特定部品リストをエクスポート中...');
      const lines: string[] = ['Ref,Part No,Registration Name'];
      exceptionEntries.forEach(entry => {
        const ref = entry.ref.includes(',') ? `"${entry.ref}"` : entry.ref;
        const partNo = entry.partNo.includes(',') ? `"${entry.partNo}"` : entry.partNo;
        const name = entry.registrationName.includes(',')
          ? `"${entry.registrationName}"`
          : entry.registrationName;
        lines.push(`${ref},${partNo},${name}`);
      });

      const csv = lines.join('\n');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, csv);
      logActivity('特定部品リストをCSVにエクスポートしました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`CSVの書き出しに失敗しました: ${message}`);
    } finally {
      setProcessing(false);
    }
  }, [exceptionEntries]);

  const applyRegistrationToBOM = useCallback(async () => {
    const datasets: DatasetKey[] = ['a', 'b'];
    const hasRegistrations = registrationEntries.length > 0;
    const hasExceptions = exceptionEntries.length > 0;
    if (!hasRegistrations && !hasExceptions) {
      alert('適用する辞書データがありません。');
      return 0;
    }

    const availableDatasets = datasets.filter(dataset => {
      const state = datasetState[dataset];
      return state.parseResult && state.parseResult.rows.length > 0;
    });
    if (availableDatasets.length === 0) {
      alert('BOMデータがありません。先にBOMを読み込んでください。');
      return 0;
    }

    try {
      setProcessing(true, 'BOMに登録名を適用中...');
      const registrationMap = new Map<string, string>();
      registrationEntries.forEach(entry => {
        const key = entry.partNo.trim().toLowerCase();
        if (key && entry.registrationName.trim()) {
          registrationMap.set(key, entry.registrationName);
        }
      });

      const exceptionMap = new Map<string, string>();
      exceptionEntries.forEach(entry => {
        const ref = entry.ref.trim().toLowerCase();
        const partNo = entry.partNo.trim().toLowerCase();
        if (ref && partNo && entry.registrationName.trim()) {
          exceptionMap.set(`${ref}:${partNo}`, entry.registrationName);
        }
      });

      let applied = 0;

      availableDatasets.forEach(dataset => {
        const state = datasetState[dataset];
        const parseResult = state.parseResult;
        if (!parseResult) return;

        const columnIndex = ensureRegistrationColumn(dataset, parseResult);
        parseResult.rows.forEach((_row, rowIndex) => {
          const ref = getRef(parseResult, rowIndex).trim().toLowerCase();
          const partNo = getPartNo(parseResult, rowIndex).trim().toLowerCase();
          if (!partNo) return;
          const exceptionKey = `${ref}:${partNo}`;
          const registrationName = exceptionMap.get(exceptionKey) ?? registrationMap.get(partNo) ?? '';
          setCellValue(parseResult, rowIndex, columnIndex, registrationName);
          if (registrationName) {
            applied += 1;
          }
        });

        state.lastUpdated = new Date().toISOString();
      });

      if (applied === 0) {
        alert('適用できる登録名が見つかりませんでした。');
      } else {
        alert(`${applied}件の登録名をBOMに適用しました。`);
        logActivity(`${applied}件の登録名をBOMに適用しました。`);
      }
      return applied;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`適用に失敗しました: ${message}`);
      return 0;
    } finally {
      setProcessing(false);
    }
  }, [exceptionEntries, registrationEntries]);

  const reload = useCallback(() => {
    setRegistrationEntries(loadRegistrationData());
    setExceptionEntries(loadExceptionData());
  }, []);

  return {
    activeTab,
    registrationEntries,
    exceptionEntries,
    setActiveTab,
    addRegistration,
    removeRegistration,
    updateRegistration,
    addException,
    removeException,
    updateException,
    loadDictionaryFile,
    saveDictionaryFile,
    importDictionaryFile,
    exportDictionaryFile,
    extractFromBOM,
    importRegistrationCSV,
    exportRegistrationCSV,
    importExceptionCSV,
    exportExceptionCSV,
    applyRegistrationToBOM,
    reload
  };
}
