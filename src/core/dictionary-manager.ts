/**
 * 辞書管理
 *
 * IPC登録名マスタと例外マスタの管理機能（BomRow不使用）
 */

import type { DatasetKey, RegistrationEntry, ExceptionEntry, ParseResult, ColumnMeta } from '../types';
import { dictionaryState, datasetState } from '../state/app-state';
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
import { loadDictionary, saveDictionary, loadSessionFromFile, saveSessionToFile } from '../services';
import { open, save } from '@tauri-apps/plugin-dialog';

function parseJsonContent(content: string): unknown {
  if (!content.trim()) {
    return [];
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    console.error('Failed to parse dictionary JSON', error);
    throw new Error('辞書データの解析に失敗しました。内容を確認してください。');
  }
}

function normalizeRegistrationEntries(data: unknown): RegistrationEntry[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(item => {
    if (typeof item !== 'object' || item === null) {
      return { partNo: '', registrationName: '' };
    }
    const record = item as Record<string, unknown>;
    const partNoRaw = record.partNo ?? record.part_no ?? '';
    const nameRaw = record.registrationName ?? record.registration_name ?? '';
    return {
      partNo: typeof partNoRaw === 'string' ? partNoRaw : String(partNoRaw ?? '').trim(),
      registrationName: typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '').trim()
    };
  });
}

function normalizeExceptionEntries(data: unknown): ExceptionEntry[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(item => {
    if (typeof item !== 'object' || item === null) {
      return { ref: '', partNo: '', registrationName: '' };
    }
    const record = item as Record<string, unknown>;
    const refRaw = record.ref ?? '';
    const partNoRaw = record.partNo ?? record.part_no ?? '';
    const nameRaw = record.registrationName ?? record.registration_name ?? '';
    return {
      ref: typeof refRaw === 'string' ? refRaw : String(refRaw ?? '').trim(),
      partNo: typeof partNoRaw === 'string' ? partNoRaw : String(partNoRaw ?? '').trim(),
      registrationName: typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '').trim()
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
  if (!parseResult.columns || parseResult.columns.length === 0) {
    const headers = parseResult.headers && parseResult.headers.length > 0
      ? parseResult.headers
      : Array.from({ length: parseResult.rows[0]?.length ?? 0 }, (_, index) => `Column ${index + 1}`);

    parseResult.columns = headers.map((name, index) => ({
      id: `col-${index}`,
      name
    }));
    parseResult.column_order = parseResult.columns.map(column => column.id);
    parseResult.headers = headers;
  }
  return parseResult.columns;
}

function ensureRegistrationColumn(parseResult: ParseResult): number {
  const columns = ensureColumns(parseResult);
  const headerName = 'Registration Name';
  let index = columns.findIndex(column => column.name === headerName);
  if (index >= 0) {
    return index;
  }

  const existingIds = new Set(columns.map(column => column.id));
  let nextIndex = columns.length;
  let columnId = `col-${nextIndex}`;
  while (existingIds.has(columnId)) {
    nextIndex += 1;
    columnId = `col-${nextIndex}`;
  }

  const newColumn: ColumnMeta = {
    id: columnId,
    name: headerName
  };

  columns.push(newColumn);
  parseResult.columns = columns;

  parseResult.column_order = [...(parseResult.column_order ?? []), newColumn.id];

  const headers = parseResult.headers ?? [];
  if (headers.length < columns.length) {
    parseResult.headers = [...columns.map(column => column.name)];
  } else {
    parseResult.headers[index] = headerName;
  }

  parseResult.rows.forEach(row => {
    while (row.length < columns.length) {
      row.push('');
    }
  });

  return columns.length - 1;
}

/**
 * 現在アクティブな辞書名を取得
 */
export function currentDictionaryName(): string {
  return dictionaryState.currentTab === 'exception' ? 'exception_master' : 'ipc_master';
}

/**
 * 辞書ストアからデータを読み込みテーブルへ反映
 */
export async function loadDictionaryIntoEditor(): Promise<void> {
  try {
    setProcessing(true, '辞書を読み込み中...');
    const raw = await loadDictionary(currentDictionaryName());
    const parsed = parseJsonContent(raw);

    if (dictionaryState.currentTab === 'exception') {
      dictionaryState.exceptions = normalizeExceptionEntries(parsed);
      saveDictionaryExceptionData();
      renderExceptionTable();
    } else {
      dictionaryState.registrations = normalizeRegistrationEntries(parsed);
      saveDictionaryRegistrationData();
      renderRegistrationTable();
    }

    logActivity('辞書を読み込みました。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`辞書の読み込みに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 現在の辞書データを保存
 */
export async function saveDictionaryFromEditor(): Promise<void> {
  try {
    setProcessing(true, '辞書を書き込み中...');

    let payload = '';
    if (dictionaryState.currentTab === 'exception') {
      saveDictionaryExceptionData();
      payload = exceptionsToJson(dictionaryState.exceptions);
    } else {
      saveDictionaryRegistrationData();
      payload = registrationsToJson(dictionaryState.registrations);
    }

    await saveDictionary(currentDictionaryName(), payload);
    logActivity('辞書を保存しました。');
    alert('辞書を保存しました。');
  } catch (error) {
    console.error('Failed to save dictionary', error);
    const message = error instanceof Error ? error.message : String(error);
    alert(`辞書の保存に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 外部ファイルから辞書をインポート
 */
export async function importDictionaryFromFile(): Promise<void> {
  const filePath = await open({
    filters: [{ name: 'JSON ファイル', extensions: ['json'] }]
  });
  if (!filePath || Array.isArray(filePath)) return;

  try {
    setProcessing(true, '辞書をインポート中...');
    const content = await loadSessionFromFile(filePath);
    const parsed = parseJsonContent(content);

    if (dictionaryState.currentTab === 'exception') {
      dictionaryState.exceptions = normalizeExceptionEntries(parsed);
      saveDictionaryExceptionData();
      renderExceptionTable();
    } else {
      dictionaryState.registrations = normalizeRegistrationEntries(parsed);
      saveDictionaryRegistrationData();
      renderRegistrationTable();
    }

    logActivity('辞書をファイルから読み込みました。');
    alert('辞書をインポートしました。');
  } catch (error) {
    console.error('Failed to import dictionary', error);
    const message = error instanceof Error ? error.message : String(error);
    alert(`辞書のインポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 現在の辞書をファイルにエクスポート
 */
export async function exportDictionaryToFile(): Promise<void> {
  const filePath = await save({
    filters: [{ name: 'JSON ファイル', extensions: ['json'] }],
    defaultPath: `${currentDictionaryName()}-${Date.now()}.json`
  });
  if (!filePath) return;

  try {
    setProcessing(true, '辞書をエクスポート中...');
    const payload = dictionaryState.currentTab === 'exception'
      ? exceptionsToJson(dictionaryState.exceptions)
      : registrationsToJson(dictionaryState.registrations);

    await saveSessionToFile(filePath, stringifyJSON(payload));
    logActivity('辞書をファイルに書き出しました。');
    alert('辞書をエクスポートしました。');
  } catch (error) {
    console.error('Failed to export dictionary', error);
    const message = error instanceof Error ? error.message : String(error);
    alert(`辞書のエクスポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 辞書登録データを保存
 */
export function saveDictionaryRegistrationData(): void {
  saveRegistrationData(dictionaryState.registrations);
}

/**
 * 辞書例外データを保存
 */
export function saveDictionaryExceptionData(): void {
  saveExceptionData(dictionaryState.exceptions);
}

/**
 * 辞書登録データを読み込み
 */
export function loadDictionaryRegistrationData(): void {
  const data = loadRegistrationData();
  dictionaryState.registrations = data;
  renderRegistrationTable();
}

/**
 * 辞書例外データを読み込み
 */
export function loadDictionaryExceptionData(): void {
  const data = loadExceptionData();
  dictionaryState.exceptions = data;
  renderExceptionTable();
}

/**
 * 登録マスタテーブルをレンダリング（BomRow不使用版）
 */
export function renderRegistrationTable(): void {
  const tbody = document.getElementById('registration-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (dictionaryState.registrations.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'dictionary-empty-row';
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 3;
    emptyCell.textContent = 'データがありません。「BOMから抽出」または「行を追加」でデータを登録してください。';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  dictionaryState.registrations.forEach((entry, index) => {
    const row = document.createElement('tr');

    // Part No列
    const partNoCell = document.createElement('td');
    const partNoInput = document.createElement('input');
    partNoInput.type = 'text';
    partNoInput.value = entry.partNo;
    partNoInput.addEventListener('blur', () => {
      dictionaryState.registrations[index].partNo = partNoInput.value;
      saveDictionaryRegistrationData();
    });
    partNoCell.appendChild(partNoInput);

    // Registration Name列
    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = entry.registrationName;
    nameInput.addEventListener('blur', () => {
      dictionaryState.registrations[index].registrationName = nameInput.value;
      saveDictionaryRegistrationData();
    });
    nameCell.appendChild(nameInput);

    // 操作列
    const actionsCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-button';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => {
      dictionaryState.registrations.splice(index, 1);
      saveDictionaryRegistrationData();
      renderRegistrationTable();
    });
    actionsCell.appendChild(deleteBtn);

    row.appendChild(partNoCell);
    row.appendChild(nameCell);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

/**
 * 例外マスタテーブルをレンダリング（BomRow不使用版）
 */
export function renderExceptionTable(): void {
  const tbody = document.getElementById('exception-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (dictionaryState.exceptions.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'dictionary-empty-row';
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 4;
    emptyCell.textContent = 'データがありません。「行を追加」でデータを登録してください。';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    return;
  }

  dictionaryState.exceptions.forEach((entry, index) => {
    const row = document.createElement('tr');

    // Ref列
    const refCell = document.createElement('td');
    const refInput = document.createElement('input');
    refInput.type = 'text';
    refInput.value = entry.ref;
    refInput.addEventListener('blur', () => {
      dictionaryState.exceptions[index].ref = refInput.value;
      saveDictionaryExceptionData();
    });
    refCell.appendChild(refInput);

    // Part No列
    const partNoCell = document.createElement('td');
    const partNoInput = document.createElement('input');
    partNoInput.type = 'text';
    partNoInput.value = entry.partNo;
    partNoInput.addEventListener('blur', () => {
      dictionaryState.exceptions[index].partNo = partNoInput.value;
      saveDictionaryExceptionData();
    });
    partNoCell.appendChild(partNoInput);

    // Registration Name列
    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = entry.registrationName;
    nameInput.addEventListener('blur', () => {
      dictionaryState.exceptions[index].registrationName = nameInput.value;
      saveDictionaryExceptionData();
    });
    nameCell.appendChild(nameInput);

    // 操作列
    const actionsCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-button';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => {
      dictionaryState.exceptions.splice(index, 1);
      saveDictionaryExceptionData();
      renderExceptionTable();
    });
    actionsCell.appendChild(deleteBtn);

    row.appendChild(refCell);
    row.appendChild(partNoCell);
    row.appendChild(nameCell);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

/**
 * 登録マスタに新しい行を追加
 */
export function addRegistrationRow(): void {
  dictionaryState.registrations.push({
    partNo: '',
    registrationName: ''
  });
  saveDictionaryRegistrationData();
  renderRegistrationTable();
}

/**
 * 例外マスタに新しい行を追加
 */
export function addExceptionRow(): void {
  dictionaryState.exceptions.push({
    ref: '',
    partNo: '',
    registrationName: ''
  });
  saveDictionaryExceptionData();
  renderExceptionTable();
}

/**
 * BOMから登録マスタを抽出（BomRow不使用版）
 */
export function extractFromBOM(): void {
  const dataset: DatasetKey = 'a';
  const parseResult = datasetState[dataset].parseResult;

  if (!parseResult || parseResult.rows.length === 0) {
    alert('BOMデータがありません。先にBOMを読み込んでください。');
    return;
  }

  try {
    setProcessing(true, 'BOMから抽出中...');

    // 既存のpart_noを収集
    const existingPartNos = new Set(
      dictionaryState.registrations.map(entry => entry.partNo.trim().toLowerCase())
    );

    let addedCount = 0;

    // ParseResultからPart No列を特定して抽出
    parseResult.rows.forEach((_row, rowIndex) => {
      const partNo = getPartNo(parseResult, rowIndex).trim();

      if (partNo && !existingPartNos.has(partNo.toLowerCase())) {
        dictionaryState.registrations.push({
          partNo,
          registrationName: '' // 空欄で追加
        });
        existingPartNos.add(partNo.toLowerCase());
        addedCount++;
      }
    });

    saveDictionaryRegistrationData();
    renderRegistrationTable();

    logActivity(`BOMから${addedCount}件の部品番号を抽出しました。`);
    alert(`${addedCount}件の新しい部品番号を抽出しました。`);
  } catch (error) {
    console.error('Extract from BOM failed', error);
    alert(`抽出に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * CSVから登録マスタをインポート
 */
export async function importRegistrationCSV(): Promise<void> {
  const filePath = await open({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }]
  });
  if (!filePath || Array.isArray(filePath)) return;

  try {
    setProcessing(true, '登録マスタをインポート中...');

    // Tauriのread_text_fileを使用してファイル読み込み
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const content = await readTextFile(filePath);

    const lines = content.split('\n').filter(line => line.trim());
    let addedCount = 0;

    // ヘッダー行をスキップして読み込み
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2) {
        dictionaryState.registrations.push({
          partNo: parts[0],
          registrationName: parts[1]
        });
        addedCount++;
      }
    }

    saveDictionaryRegistrationData();
    renderRegistrationTable();
    logActivity(`${addedCount}件の登録マスタをインポートしました。`);
    alert(`${addedCount}件の登録マスタをインポートしました。`);
  } catch (error) {
    console.error('Import registration CSV failed', error);
    alert(`インポートに失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 登録マスタをCSVにエクスポート
 */
export async function exportRegistrationCSV(): Promise<void> {
  if (dictionaryState.registrations.length === 0) {
    alert('エクスポートするデータがありません。');
    return;
  }

  const filePath = await save({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }],
    defaultPath: `registration_${Date.now()}.csv`
  });
  if (!filePath) return;

  try {
    setProcessing(true, '登録マスタをエクスポート中...');

    const lines: string[] = [];
    lines.push('Part No,Registration Name');

    dictionaryState.registrations.forEach(entry => {
      const partNo = entry.partNo.includes(',') ? `"${entry.partNo}"` : entry.partNo;
      const name = entry.registrationName.includes(',') ? `"${entry.registrationName}"` : entry.registrationName;
      lines.push(`${partNo},${name}`);
    });

    const csvContent = lines.join('\n');

    // Tauriのwrite_text_fileを使用してファイル保存
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, csvContent);

    logActivity('登録マスタをCSVにエクスポートしました。');
    alert('登録マスタをエクスポートしました。');
  } catch (error) {
    console.error('Export registration CSV failed', error);
    alert(`エクスポートに失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * CSVから例外マスタをインポート
 */
export async function importExceptionCSV(): Promise<void> {
  const filePath = await open({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }]
  });
  if (!filePath || Array.isArray(filePath)) return;

  try {
    setProcessing(true, '例外マスタをインポート中...');

    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const content = await readTextFile(filePath);

    const lines = content.split('\n').filter(line => line.trim());
    let addedCount = 0;

    // ヘッダー行をスキップして読み込み
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        dictionaryState.exceptions.push({
          ref: parts[0],
          partNo: parts[1],
          registrationName: parts[2]
        });
        addedCount++;
      }
    }

    saveDictionaryExceptionData();
    renderExceptionTable();
    logActivity(`${addedCount}件の例外マスタをインポートしました。`);
    alert(`${addedCount}件の例外マスタをインポートしました。`);
  } catch (error) {
    console.error('Import exception CSV failed', error);
    alert(`インポートに失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 例外マスタをCSVにエクスポート
 */
export async function exportExceptionCSV(): Promise<void> {
  if (dictionaryState.exceptions.length === 0) {
    alert('エクスポートするデータがありません。');
    return;
  }

  const filePath = await save({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }],
    defaultPath: `exception_${Date.now()}.csv`
  });
  if (!filePath) return;

  try {
    setProcessing(true, '例外マスタをエクスポート中...');

    const lines: string[] = [];
    lines.push('Ref,Part No,Registration Name');

    dictionaryState.exceptions.forEach(entry => {
      const ref = entry.ref.includes(',') ? `"${entry.ref}"` : entry.ref;
      const partNo = entry.partNo.includes(',') ? `"${entry.partNo}"` : entry.partNo;
      const name = entry.registrationName.includes(',') ? `"${entry.registrationName}"` : entry.registrationName;
      lines.push(`${ref},${partNo},${name}`);
    });

    const csvContent = lines.join('\n');

    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, csvContent);

    logActivity('例外マスタをCSVにエクスポートしました。');
    alert('例外マスタをエクスポートしました。');
  } catch (error) {
    console.error('Export exception CSV failed', error);
    alert(`エクスポートに失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * 登録マスタをBOMに適用（BomRow不使用版）
 */
export function applyRegistrationToBOM(): number {
  const datasets: DatasetKey[] = ['a', 'b'];
  const hasRegistrationData = dictionaryState.registrations.length > 0;
  const hasExceptionData = dictionaryState.exceptions.length > 0;

  if (!hasRegistrationData && !hasExceptionData) {
    alert('適用する辞書データがありません。');
    return 0;
  }

  const availableDatasets = datasets.filter(dataset => {
    const result = datasetState[dataset].parseResult;
    return result && result.rows.length > 0;
  });

  if (availableDatasets.length === 0) {
    alert('BOMデータがありません。先にBOMを読み込んでください。');
    return 0;
  }

  try {
    setProcessing(true, 'BOMに登録名を適用中...');

    const registrationMap = new Map<string, string>();
    dictionaryState.registrations.forEach(entry => {
      const key = entry.partNo.trim().toLowerCase();
      if (key && entry.registrationName.trim()) {
        registrationMap.set(key, entry.registrationName);
      }
    });

    const exceptionMap = new Map<string, string>();
    dictionaryState.exceptions.forEach(entry => {
      const key = `${entry.ref.trim().toLowerCase()}:${entry.partNo.trim().toLowerCase()}`;
      if (entry.ref.trim() && entry.partNo.trim() && entry.registrationName.trim()) {
        exceptionMap.set(key, entry.registrationName);
      }
    });

    let appliedCount = 0;

    availableDatasets.forEach(dataset => {
      const parseResult = datasetState[dataset].parseResult;
      if (!parseResult) return;

      const columnIndex = ensureRegistrationColumn(parseResult);

      parseResult.rows.forEach((_row, rowIndex) => {
        const ref = getRef(parseResult, rowIndex).trim();
        const partNo = getPartNo(parseResult, rowIndex).trim();

        if (!partNo) return;

        const exceptionKey = `${ref.toLowerCase()}:${partNo.toLowerCase()}`;
        const partNoKey = partNo.toLowerCase();

        const registrationName = exceptionMap.get(exceptionKey) ?? registrationMap.get(partNoKey) ?? '';

        if (registrationName) {
          setCellValue(parseResult, rowIndex, columnIndex, registrationName);
          appliedCount++;
        } else {
          setCellValue(parseResult, rowIndex, columnIndex, '');
        }
      });

      datasetState[dataset].lastUpdated = new Date().toISOString();
    });

    if (appliedCount === 0) {
      alert('適用できる登録名が見つかりませんでした。');
    } else {
      logActivity(`${appliedCount}件の登録名をBOMに適用しました。`);
      alert(`${appliedCount}件の登録名を適用しました。`);
    }
    return appliedCount;
  } catch (error) {
    console.error('Apply registration to BOM failed', error);
    alert(`適用に失敗しました: ${error}`);
    return 0;
  } finally {
    setProcessing(false);
  }
}

/**
 * 辞書タブのイベントハンドラを登録
 */
export function registerDictionaryTabs(): void {
  const registrationTab = document.querySelector('[data-dictionary-tab="registration"]');
  const exceptionTab = document.querySelector('[data-dictionary-tab="exception"]');

  const registrationContent = document.getElementById('dictionary-content-registration');
  const exceptionContent = document.getElementById('dictionary-content-exception');

  registrationTab?.addEventListener('click', () => {
    dictionaryState.currentTab = 'registration';
    renderRegistrationTable();

    registrationTab.classList.add('is-active');
    exceptionTab?.classList.remove('is-active');
    registrationContent?.removeAttribute('hidden');
    exceptionContent?.setAttribute('hidden', '');
  });

  exceptionTab?.addEventListener('click', () => {
    dictionaryState.currentTab = 'exception';
    renderExceptionTable();

    exceptionTab.classList.add('is-active');
    registrationTab?.classList.remove('is-active');
    exceptionContent?.removeAttribute('hidden');
    registrationContent?.setAttribute('hidden', '');
  });

  // 初期表示
  loadDictionaryRegistrationData();
  loadDictionaryExceptionData();
}
