import './styles.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';

// 型定義のインポート
import type {
  BomRow,
  ParseError,
  ParseResult,
  DiffRow,
  DatasetKey,
  DatasetState,
  ProjectPayload,
  ProjectRecord,
  ProjectSettings,
  RegistrationEntry,
  ExceptionEntry,
  DictionaryTab,
  EditModalState,
  ColumnRole,
  ColumnMeta
} from './types';

// ユーティリティ関数のインポート
import {
  formatDateLabel,
  datasetLabel,
  guessRoleFromColumnName,
  displayNameForColumn,
  stringifyJSON,
  setProcessing,
  logActivity,
  closeModal,
  toggleDropzoneHover,
  datasetFromPosition,
  getStoredProjects,
  saveStoredProjects,
  loadActiveProjectId,
  saveActiveProjectId,
  getFavoriteProjects,
  saveFavoriteProjects,
  loadProjectSettings,
  saveProjectSettings as saveProjectSettingsToStorage,
  loadRegistrationData,
  saveRegistrationData,
  loadExceptionData,
  saveExceptionData,
  loadThemeSettings,
  cloneRows,
  buildColumns,
  getCellValue
} from './utils';

// サービス関数のインポート
import {
  parseBomFile,
  normalizeBomData,
  loadSessionFromFile,
  saveSessionToFile,
  loadDictionary,
  saveDictionary,
  compareBoms,
  updateAndAppendBoms,
  expandReference,
  splitReferenceRows,
  fillBlankCells,
  cleanseTextData,
  applyFormatRules
} from './services';

// ---- 状態 -------------------------------------------------------------------
const datasetState: Record<DatasetKey, DatasetState> = {
  a: {
    parseResult: null,
    normalizedBom: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  },
  b: {
    parseResult: null,
    normalizedBom: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  }
};

let currentDiffs: DiffRow[] = [];
let mergedBom: BomRow[] | null = null;
let editModalState: EditModalState | null = null;
// 前処理チェックボックスの状態は各チェックボックスから直接取得

const dictionaryState: {
  currentTab: DictionaryTab;
  registrations: RegistrationEntry[];
  exceptions: ExceptionEntry[];
} = {
  currentTab: 'registration',
  registrations: [],
  exceptions: []
};

const nativeDropState: {
  dataset: DatasetKey | null;
  paths: string[];
} = {
  dataset: null,
  paths: []
};

// ---- DOM参照 -----------------------------------------------------------------
const compareButton = document.getElementById('run-compare') as HTMLButtonElement | null;
const replaceButton = document.getElementById('run-replace') as HTMLButtonElement | null;
const inlineSaveButton = document.getElementById(
  'manual-session-save-inline'
) as HTMLButtonElement | null;
// create-project と save-project-as ボタンは削除されました
const sessionTabBar = document.getElementById('session-tab-bar') as HTMLDivElement | null;
// processingOverlay, processingMessage, activityLog はutils/dom.tsで直接アクセスされています
const diffResultContainer = document.getElementById('diff-result') as HTMLDivElement | null;
const resultsSummary = document.getElementById('results-summary') as HTMLDivElement | null;
const resultsPanel = document.getElementById('results-panel') as HTMLDivElement | null;
const editModal = document.getElementById('edit-modal') as HTMLDialogElement | null;
const settingsModal = document.getElementById('settings-modal') as HTMLDialogElement | null;
const dictionaryEditor = document.getElementById('dictionary-editor') as HTMLTextAreaElement | null;

// ---- 汎用ユーティリティ -----------------------------------------------------
// 以下の関数はutils/からインポートされています:
// formatDateLabel, cloneRows, datasetLabel, logActivity, setProcessing, buildColumns,
// getCellValue, toggleDropzoneHover, datasetFromPosition,
// normalizeToken, guessRoleFromColumnName, displayNameForColumn

function syncPreviewEmptyState() {
  const message = document.getElementById('preview-empty-message');
  const grid = document.querySelector<HTMLElement>('.preview-grid');
  if (!message) return;
  const hasData = Boolean(datasetState.a.parseResult) || Boolean(datasetState.b.parseResult);
  message.hidden = hasData;
  if (grid) {
    grid.hidden = !hasData;
  }
}

function createPreviewTable(
  rows: BomRow[],
  columns: string[],
  maxRows = 8,
  structuredErrors?: ParseError[],
  rowNumbers?: number[]
): HTMLTableElement {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = displayNameForColumn(col);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  rows.slice(0, maxRows).forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const actualRowNumber = rowNumbers ? rowNumbers[rowIndex] : rowIndex + 1;

    columns.forEach((col, colIndex) => {
      const td = document.createElement('td');
      td.textContent = getCellValue(row, col);

      // エラーがある場合、該当セルをハイライト
      if (structuredErrors) {
        const cellErrors = structuredErrors.filter(
          err => err.row === actualRowNumber && err.column === colIndex
        );
        if (cellErrors.length > 0) {
          const severity = cellErrors[0].severity;
          td.classList.add('cell-with-error');
          td.classList.add(`cell-${severity}`);
          td.title = cellErrors.map(e => e.message).join('\n');
        }
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (rows.length > maxRows) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length;
    td.textContent = `... 他 ${rows.length - maxRows} 行`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function createDatasetPreviewTable(
  dataset: DatasetKey,
  maxRows = 6
): HTMLTableElement | null {
  const state = datasetState[dataset];
  const result = state.parseResult;
  const rows = state.normalizedBom;
  if (!result || !rows) {
    return null;
  }

  const columns =
    result.columns && result.columns.length > 0
      ? result.columns
      : resolveColumnsFromParseResult(result);
  const structuredErrors = result.structured_errors ?? [];
  const rowNumbers = result.row_numbers ?? [];

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.name;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  rows.slice(0, maxRows).forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const actualRowNumber = rowNumbers[rowIndex] ?? rowIndex + 1;

    columns.forEach((column, columnIndex) => {
      const td = document.createElement('td');
      const role = state.columnRoles[column.id] ?? 'ignore';
      td.textContent = getValueForColumnRole(row, column, role);

      const cellErrors = structuredErrors.filter(
        err => err.row === actualRowNumber && err.column === columnIndex
      );
      if (cellErrors.length > 0) {
        const severity = cellErrors[0].severity;
        td.classList.add('cell-with-error');
        td.classList.add(`cell-${severity}`);
        td.title = cellErrors.map(e => e.message).join('\n');
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (rows.length > maxRows) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length;
    td.textContent = `... 他 ${rows.length - maxRows} 行`;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function updateActionAvailability() {
  const aLoaded = Boolean(datasetState.a.parseResult);
  const bLoaded = Boolean(datasetState.b.parseResult);

  if (compareButton) {
    compareButton.disabled = !(aLoaded && bLoaded);
  }
  if (replaceButton) {
    replaceButton.disabled = !(aLoaded && bLoaded);
  }
  if (inlineSaveButton) {
    inlineSaveButton.disabled = !(aLoaded || bLoaded);
  }
  // saveProjectAsButton は削除されました
}

function isColumnRole(value: string): value is ColumnRole {
  return value === 'ref' || value === 'part_no' || value === 'manufacturer' || value === 'ignore';
}

const MULTIPLE_SELECTION_VALUE = '__MULTIPLE__';

function getValueForColumnRole(row: BomRow, column: ColumnMeta, role: ColumnRole): string {
  switch (role) {
    case 'ref':
      return row.ref ?? '';
    case 'part_no':
      return row.part_no ?? '';
    case 'manufacturer':
      return row.attributes?.manufacturer ?? row.attributes?.[column.name] ?? '';
    default:
      return row.attributes?.[column.name] ?? '';
  }
}

function setValueForColumnRole(row: BomRow, column: ColumnMeta, role: ColumnRole, value: string) {
  const trimmed = value.trim();
  switch (role) {
    case 'ref':
      row.ref = trimmed;
      if (row.attributes) {
        delete row.attributes[column.name];
      }
      break;
    case 'part_no':
      row.part_no = trimmed;
      if (row.attributes) {
        delete row.attributes[column.name];
      }
      break;
    case 'manufacturer':
      if (!row.attributes) {
        row.attributes = {};
      }
      if (trimmed) {
        row.attributes.manufacturer = trimmed;
        row.attributes[column.name] = trimmed;
      } else {
        delete row.attributes.manufacturer;
        delete row.attributes[column.name];
      }
      break;
    default:
      if (!row.attributes) {
        row.attributes = {};
      }
      if (trimmed) {
        row.attributes[column.name] = trimmed;
      } else {
        delete row.attributes[column.name];
      }
      break;
  }
}

function resolveColumnsFromParseResult(result: ParseResult): { id: string; name: string }[] {
  if (result.columns && result.columns.length > 0) {
    return result.columns.map(column => ({
      id: column.id,
      name: column.name
    }));
  }
  if (result.headers && result.headers.length > 0) {
    return result.headers.map((name, index) => ({
      id: `col-${index}`,
      name
    }));
  }
  return [];
}

function deriveInitialColumnRoles(result: ParseResult): Record<string, ColumnRole> {
  const roles: Record<string, ColumnRole> = {};
  const columns = resolveColumnsFromParseResult(result);
  if (result.guessed_roles) {
    for (const [columnId, role] of Object.entries(result.guessed_roles)) {
      if (isColumnRole(role)) {
        roles[columnId] = role;
      }
    }
  } else if (result.guessed_columns) {
    for (const [role, index] of Object.entries(result.guessed_columns)) {
      if (!isColumnRole(role)) continue;
      const column = columns[index];
      if (column) {
        roles[column.id] = role;
      }
    }
  }
  return roles;
}

function normalizeStoredColumnRoles(
  result: ParseResult | null,
  stored?: Record<string, ColumnRole>
): Record<string, ColumnRole> {
  if (!result) {
    return stored ? { ...stored } : {};
  }
  if (!stored) {
    return deriveInitialColumnRoles(result);
  }
  const columns = resolveColumnsFromParseResult(result);
  const columnIdByName = new Map(columns.map(column => [column.name, column.id]));
  const isAlreadyIdBased = Object.keys(stored).every(key => key.startsWith('col-'));
  if (isAlreadyIdBased) {
    return { ...stored };
  }
  const normalized: Record<string, ColumnRole> = {};
  for (const [key, role] of Object.entries(stored)) {
    if (!isColumnRole(role)) continue;
    const columnId = columnIdByName.get(key);
    if (columnId) {
      normalized[columnId] = role;
    }
  }
  if (Object.keys(normalized).length === 0) {
    return deriveInitialColumnRoles(result);
  }
  return normalized;
}

async function recomputeNormalizedDataForDataset(dataset: DatasetKey): Promise<void> {
  const state = datasetState[dataset];
  if (!state.parseResult) {
    throw new Error('BOMデータが読み込まれていません。');
  }
  if (!state.parseResult.rows || state.parseResult.rows.length === 0) {
    throw new Error('元の行データが存在しません。ファイルを再読み込みしてください。');
  }
  const columns =
    state.parseResult.columns && state.parseResult.columns.length > 0
      ? state.parseResult.columns
      : resolveColumnsFromParseResult(state.parseResult);

  const normalized = await normalizeBomData(columns, state.parseResult.rows, state.columnRoles);
  state.normalizedBom = normalized;
  state.parseResult.bom_data = normalized;
  state.lastUpdated = new Date().toISOString();

  const guessedRoles: Record<string, ColumnRole> = {};
  const guessedColumns: Record<string, number> = {};
  columns.forEach((column, index) => {
    const role = state.columnRoles[column.id];
    if (role) {
      guessedRoles[column.id] = role;
      guessedColumns[role] = index;
    }
  });
  state.parseResult.guessed_roles = guessedRoles;
  state.parseResult.guessed_columns = guessedColumns;
}

async function handleColumnRoleChange(event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  const datasetAttr = select.dataset.dataset;
  const roleAttr = select.getAttribute('data-column-role');
  if (!datasetAttr || !roleAttr || !isColumnRole(roleAttr)) {
    return;
  }
  const dataset = datasetAttr as DatasetKey;
  const selectedColumnId = select.value;

  if (selectedColumnId === MULTIPLE_SELECTION_VALUE) {
    select.value = MULTIPLE_SELECTION_VALUE;
    return;
  }

  const previousRoles = { ...datasetState[dataset].columnRoles };
  const updatedRoles: Record<string, ColumnRole> = { ...previousRoles };

  for (const [columnId, assignedRole] of Object.entries(updatedRoles)) {
    if (assignedRole === roleAttr) {
      delete updatedRoles[columnId];
    }
  }

  if (selectedColumnId) {
    for (const columnId of Object.keys(updatedRoles)) {
      if (columnId === selectedColumnId) {
        delete updatedRoles[columnId];
      }
    }
    updatedRoles[selectedColumnId] = roleAttr;
  }

  datasetState[dataset].columnRoles = updatedRoles;

  try {
    await recomputeNormalizedDataForDataset(dataset);
    populateColumnSettings(dataset);
    updateDropzone(dataset);
    updatePreviewCard(dataset);

    if (editModalState && editModalState.dataset === dataset) {
      const stateForModal = datasetState[dataset];
      const columnsForModal = editModalState.columns;
      const syncedRoles: Record<string, ColumnRole> = {};
      columnsForModal.forEach(column => {
        syncedRoles[column.id] = stateForModal.columnRoles[column.id] ?? 'ignore';
      });
      editModalState.headerRoles = syncedRoles;
      if (stateForModal.normalizedBom) {
        editModalState.workingRows = cloneRows(stateForModal.normalizedBom);
      }
      renderHeaderRoleControls(editModalState);
      renderEditTable(editModalState);
    }
  } catch (error) {
    datasetState[dataset].columnRoles = previousRoles;
    populateColumnSettings(dataset);
    const message = error instanceof Error ? error.message : String(error);
    alert(`列の役割を更新できませんでした: ${message}`);
    if (editModalState && editModalState.dataset === dataset) {
      const columnsForModal = editModalState.columns;
      const fallbackRoles: Record<string, ColumnRole> = {};
      columnsForModal.forEach(column => {
        fallbackRoles[column.id] = previousRoles[column.id] ?? 'ignore';
      });
      editModalState.headerRoles = fallbackRoles;
      renderHeaderRoleControls(editModalState);
      renderEditTable(editModalState);
    }
  }
}

function populateColumnSettings(dataset: DatasetKey) {
  const result = datasetState[dataset].parseResult;
  if (!result) return;

  const panel = document.querySelector<HTMLElement>(`[data-column-settings="${dataset}"]`);
  if (!panel) return;

  const columns = resolveColumnsFromParseResult(result);
  const selects = panel.querySelectorAll<HTMLSelectElement>('.column-select');
  const currentRoles = datasetState[dataset].columnRoles ?? {};

  selects.forEach(select => {
    const role = select.getAttribute('data-column-role');
    select.innerHTML = '<option value="">--</option>';

    const existingMultipleOption = select.querySelector(`option[value="${MULTIPLE_SELECTION_VALUE}"]`);
    if (existingMultipleOption) {
      existingMultipleOption.remove();
    }

    columns.forEach(column => {
      const option = document.createElement('option');
      option.value = column.id;
      option.textContent = column.name;
      select.appendChild(option);
    });

    select.classList.remove('column-select--multiple');
    select.removeAttribute('data-multiple-columns');

    if (!role) {
      select.onchange = null;
      return;
    }

    const assignedColumns = Object.entries(currentRoles)
      .filter(([, assignedRole]) => assignedRole === role)
      .map(([columnId]) => columnId);

    let selectedValue = '';

    if (assignedColumns.length > 1) {
      const multiOption = document.createElement('option');
      multiOption.value = MULTIPLE_SELECTION_VALUE;
      multiOption.textContent = '複数列';
      select.insertBefore(multiOption, select.firstChild?.nextSibling ?? null);
      selectedValue = MULTIPLE_SELECTION_VALUE;
      select.dataset.multipleColumns = assignedColumns.join(',');
      select.classList.add('column-select--multiple');
      select.title = assignedColumns
        .map(columnId => columns.find(column => column.id === columnId)?.name ?? columnId)
        .join(', ');
    } else if (assignedColumns.length === 1) {
      selectedValue = assignedColumns[0];
      select.removeAttribute('title');
    } else {
      select.removeAttribute('title');
      const guessedById = Object.entries(result.guessed_roles ?? {}).find(
        ([columnId, guessedRole]) => guessedRole === role && columns.some(column => column.id === columnId)
      );
      if (guessedById) {
        selectedValue = guessedById[0];
      } else if (result.guessed_columns) {
        const guessedIndex = result.guessed_columns[role];
        if (guessedIndex !== undefined) {
          const column = columns[guessedIndex];
          if (column) {
            selectedValue = column.id;
          }
        }
      }
    }

    if (selectedValue) {
      select.value = selectedValue;
    } else {
      select.value = '';
    }

    select.onchange = event => {
      void handleColumnRoleChange(event);
    };
  });
}

function updateDropzone(dataset: DatasetKey) {
  console.log('[updateDropzone] Called for dataset:', dataset);
  const result = datasetState[dataset].parseResult;
  const normalized = datasetState[dataset].normalizedBom;
  console.log('[updateDropzone] Has result:', Boolean(result), 'Has normalized:', Boolean(normalized));

  const preview = document.getElementById(`drop-preview-${dataset}`) as HTMLDivElement | null;
  const placeholder = document.querySelector<HTMLElement>(`[data-placeholder="${dataset}"]`);
  const statusChip = document.querySelector<HTMLElement>(`[data-status-placeholder="${dataset}"]`);
  const surface = document.querySelector<HTMLDivElement>(`[data-surface="${dataset}"]`);
  const tableContainer = preview?.querySelector<HTMLDivElement>(`[data-preview-table="${dataset}"]`);
  const summaryMeta = preview?.querySelector<HTMLParagraphElement>(
    `[data-preview-meta-short="${dataset}"]`
  );
  const errorsBox = preview?.querySelector<HTMLDivElement>(`[data-preview-errors="${dataset}"]`);
  const dropzone = preview?.closest('.dropzone');
  const editButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-open-edit="${dataset}"]`)
  );

  console.log('[updateDropzone] Elements found:', {
    preview: Boolean(preview),
    placeholder: Boolean(placeholder),
    statusChip: Boolean(statusChip),
    surface: Boolean(surface),
    tableContainer: Boolean(tableContainer),
    summaryMeta: Boolean(summaryMeta),
    errorsBox: Boolean(errorsBox)
  });

  if (
    !preview ||
    !placeholder ||
    !statusChip ||
    !tableContainer ||
    !summaryMeta ||
    !errorsBox ||
    !surface
  ) {
    console.error('[updateDropzone] Missing required elements, aborting');
    return;
  }

  if (result && normalized) {
    console.log('[updateDropzone] Result exists, showing preview');
    const newTable = createDatasetPreviewTable(dataset, 6);
    if (newTable) {
      tableContainer.innerHTML = '';
      tableContainer.appendChild(newTable);
    }
    console.log('[updateDropzone] Setting preview.hidden = false, placeholder.hidden = true');
    preview.hidden = false;
    placeholder.hidden = true;
    console.log('[updateDropzone] After setting - preview.hidden:', preview.hidden, 'placeholder.hidden:', placeholder.hidden);
    statusChip.textContent = `${normalized.length} 行読込済み`;
    statusChip.style.backgroundColor = '#dcfce7';
    statusChip.style.color = '#166534';
    surface.classList.add('dropzone-surface--filled');
    surface.classList.remove('dragover');
    summaryMeta.textContent = [
      `行数 ${normalized.length.toLocaleString()}`,
      datasetState[dataset].fileName ? `ファイル ${datasetState[dataset].fileName}` : null,
      `更新 ${formatDateLabel(datasetState[dataset].lastUpdated)}`
    ]
      .filter(Boolean)
      .join(' / ');
    // structured_errors を優先的に使用
    const structuredErrors = result.structured_errors || [];
    const simpleErrors = result.errors || [];

    if (structuredErrors.length > 0 || simpleErrors.length > 0) {
      const list = document.createElement('ul');

      // structured_errorsがあればそれを使用
      if (structuredErrors.length > 0) {
        structuredErrors.slice(0, 3).forEach(error => {
          const li = document.createElement('li');
          li.className = error.severity;
          li.textContent = error.message;

          // 行番号と列番号がある場合、クリック可能にする
          if (error.row !== undefined && error.column !== undefined) {
            li.style.cursor = 'pointer';
            li.style.textDecoration = 'underline';
            li.title = 'クリックして該当セルへ移動（編集モードで確認できます）';

            li.addEventListener('click', () => {
              // プレビューからは編集モーダルを開く
              openEditModalForDataset(dataset);
              // モーダルが開いた後にハイライト
              setTimeout(() => {
                highlightCell(error.row!, error.column!, 'edit');
              }, 100);
            });
          }

          list.appendChild(li);
        });
      } else {
        // 従来のエラー表示
        simpleErrors.slice(0, 3).forEach(err => {
          const li = document.createElement('li');
          li.textContent = err;
          list.appendChild(li);
        });
      }

      errorsBox.innerHTML = '<strong>警告</strong>';
      errorsBox.appendChild(list);

      const totalErrors = structuredErrors.length > 0 ? structuredErrors.length : simpleErrors.length;
      if (totalErrors > 3) {
        const more = document.createElement('p');
        more.textContent = `他 ${totalErrors - 3} 件の警告があります。`;
        errorsBox.appendChild(more);
      }
      errorsBox.hidden = false;
    } else {
      errorsBox.hidden = true;
      errorsBox.innerHTML = '';
    }
    dropzone?.classList.add('dropzone--has-data');
    editButtons.forEach(btn => {
      btn.disabled = false;
    });
    populateColumnSettings(dataset);
  } else {
    tableContainer.innerHTML = '';
    preview.hidden = true;
    placeholder.hidden = false;
    statusChip.textContent = '未読込';
    statusChip.style.backgroundColor = '#e5e7eb';
    statusChip.style.color = '#6b7280';
    summaryMeta.textContent = '-';
    errorsBox.hidden = true;
    errorsBox.innerHTML = '';
    surface.classList.remove('dropzone-surface--filled');
    surface.classList.remove('dragover');
    dropzone?.classList.remove('dropzone--has-data');
    editButtons.forEach(btn => {
      btn.disabled = true;
    });
  }
  syncPreviewEmptyState();
}

function updatePreviewCard(dataset: DatasetKey) {
  const result = datasetState[dataset].parseResult;
  const normalized = datasetState[dataset].normalizedBom;
  const card = document.querySelector<HTMLElement>(`.preview-card[data-source="${dataset}"]`);
  const meta = document.getElementById(`preview-meta-${dataset}`) as HTMLParagraphElement | null;
  const tableWrapper = document.getElementById(`preview-table-${dataset}`) as HTMLDivElement | null;
  const errorsBox = document.getElementById(`preview-errors-${dataset}`) as HTMLDivElement | null;
  const editButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-open-edit="${dataset}"]`)
  );

  if (!meta || !tableWrapper || !errorsBox || !card) return;

  tableWrapper.innerHTML = '';
  errorsBox.innerHTML = '';

  if (result && normalized) {
    card.hidden = false;
    const previewTable = createDatasetPreviewTable(dataset, 15);
    if (previewTable) {
      tableWrapper.appendChild(previewTable);
    }
    tableWrapper.hidden = false;

    // structured_errors を優先的に使用
    const structuredErrors = result.structured_errors || [];
    const simpleErrors = result.errors || [];

    errorsBox.hidden = structuredErrors.length === 0 && simpleErrors.length === 0;

    if (structuredErrors.length > 0 || simpleErrors.length > 0) {
      const title = document.createElement('strong');
      title.textContent = '読み込み時の警告';
      errorsBox.appendChild(title);
      const list = document.createElement('ul');

      if (structuredErrors.length > 0) {
        structuredErrors.forEach(error => {
          const li = document.createElement('li');
          li.className = error.severity;
          li.textContent = error.message;

          // 行番号と列番号がある場合、クリック可能にする
          if (error.row !== undefined && error.column !== undefined) {
            li.style.cursor = 'pointer';
            li.style.textDecoration = 'underline';
            li.title = 'クリックして該当セルへ移動（編集モードで確認できます）';

            li.addEventListener('click', () => {
              openEditModalForDataset(dataset);
              setTimeout(() => {
                highlightCell(error.row!, error.column!, 'edit');
              }, 100);
            });
          }

          list.appendChild(li);
        });
      } else {
        simpleErrors.forEach(err => {
          const li = document.createElement('li');
          li.textContent = err;
          list.appendChild(li);
        });
      }

      errorsBox.appendChild(list);
    }
    const metaLines: string[] = [];
    metaLines.push(`行数: ${normalized.length.toLocaleString()}`);
    if (datasetState[dataset].fileName) {
      metaLines.push(`ファイル: ${datasetState[dataset].fileName}`);
    }
    metaLines.push(`更新: ${formatDateLabel(datasetState[dataset].lastUpdated)}`);
    meta.textContent = metaLines.join(' / ');
    editButtons.forEach(btn => {
      btn.disabled = false;
    });
  } else {
    card.hidden = true;
    tableWrapper.hidden = true;
    errorsBox.hidden = true;
    meta.textContent = '未読込';
    editButtons.forEach(btn => {
      btn.disabled = true;
    });
  }
  syncPreviewEmptyState();
}

let currentFilter: 'all' | 'diff' | 'added' | 'removed' | 'changed' = 'diff';

function renderDiffTable(diffs: DiffRow[]) {
  if (!diffResultContainer) return;

  const resultsActions = document.getElementById('results-actions');
  const filterControls = document.getElementById('results-filter-controls');

  if (resultsPanel) {
    resultsPanel.hidden = false;
  }

  diffResultContainer.innerHTML = '';

  if (diffs.length === 0) {
    diffResultContainer.innerHTML = '<p style="padding: 16px; text-align: center; color: #61748f;">差分は検出されませんでした。</p>';
    diffResultContainer.hidden = false;
    if (resultsActions) resultsActions.hidden = true;
    if (filterControls) filterControls.hidden = true;
    return;
  }

  // カウントを更新
  const added = diffs.filter(diff => diff.status === '追加').length;
  const removed = diffs.filter(diff => diff.status === '削除').length;
  const changed = diffs.filter(diff => diff.status === '変更').length;
  const total = added + removed + changed;

  updateFilterCounts(total, added, removed, changed);

  // フィルターを適用
  const filteredDiffs = applyFilter(diffs, currentFilter);

  if (filteredDiffs.length === 0) {
    diffResultContainer.innerHTML = '<p style="padding: 16px; text-align: center; color: #61748f;">フィルター条件に一致する項目がありません。</p>';
    diffResultContainer.hidden = false;
    if (resultsActions) resultsActions.hidden = false;
    if (filterControls) filterControls.hidden = false;
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['ステータス', 'Ref', 'A: 部品型番', 'B: 部品型番', '詳細'].forEach(title => {
    const th = document.createElement('th');
    th.textContent = title;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  filteredDiffs.forEach(diff => {
    const tr = document.createElement('tr');
    const statusCell = document.createElement('td');
    statusCell.textContent = diff.status;
    if (diff.status === '追加') {
      statusCell.style.color = '#166534';
    } else if (diff.status === '削除') {
      statusCell.style.color = '#b91c1c';
    } else if (diff.status === '変更') {
      statusCell.style.color = '#b45309';
    }
    tr.appendChild(statusCell);

    const refCell = document.createElement('td');
    refCell.textContent = diff.a?.ref ?? diff.b?.ref ?? '-';
    tr.appendChild(refCell);

    const partACell = document.createElement('td');
    partACell.textContent = diff.a?.part_no ?? '-';
    tr.appendChild(partACell);

    const partBCell = document.createElement('td');
    partBCell.textContent = diff.b?.part_no ?? '-';
    tr.appendChild(partBCell);

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  diffResultContainer.appendChild(table);
  diffResultContainer.hidden = false;

  // 出力ボタンを表示
  if (resultsActions) resultsActions.hidden = false;

  // フィルターコントロールを表示
  if (filterControls) filterControls.hidden = false;
}

function applyFilter(diffs: DiffRow[], filter: 'all' | 'diff' | 'added' | 'removed' | 'changed'): DiffRow[] {
  if (filter === 'all') {
    // 全件表示（同一も含む）
    return diffs;
  }

  if (filter === 'diff') {
    // 全ての差分（追加+削除+変更）
    return diffs.filter(diff => diff.status !== '同一');
  }

  // 特定のステータスのみ
  const statusMap = {
    added: '追加',
    removed: '削除',
    changed: '変更'
  };

  return diffs.filter(diff => diff.status === statusMap[filter]);
}

function updateFilterCounts(total: number, added: number, removed: number, changed: number) {
  const countTotal = document.getElementById('count-total');
  const countAdded = document.getElementById('count-added');
  const countRemoved = document.getElementById('count-removed');
  const countChanged = document.getElementById('count-changed');

  if (countTotal) countTotal.textContent = String(total);
  if (countAdded) countAdded.textContent = String(added);
  if (countRemoved) countRemoved.textContent = String(removed);
  if (countChanged) countChanged.textContent = String(changed);
}

function setActiveFilter(filter: 'all' | 'diff' | 'added' | 'removed' | 'changed') {
  currentFilter = filter;

  // ボタンの状態を更新
  const buttons = document.querySelectorAll('.filter-button');
  buttons.forEach(btn => {
    btn.classList.remove('is-active');
  });

  const activeButton = document.getElementById(`filter-${filter}`);
  if (activeButton) {
    activeButton.classList.add('is-active');
  }

  // テーブルを再描画
  renderDiffTable(currentDiffs);
}


function setEditDatasetToggle(dataset: DatasetKey) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-edit-dataset]')
  );
  buttons.forEach(button => {
    const isActive = button.dataset.editDataset === dataset;
    button.classList.toggle('is-active', isActive);
  });
}

function renderHeaderRoleControls(state: EditModalState) {
  const container = document.getElementById('header-role-controls');
  if (!container) return;
  container.innerHTML = '';

  const roleOptions: { value: ColumnRole; label: string }[] = [
    { value: 'ref', label: '部品番号' },
    { value: 'part_no', label: '部品型番' },
    { value: 'manufacturer', label: 'メーカー名' },
    { value: 'ignore', label: '指定しない' }
  ];

  state.columns.forEach((column, index) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'header-role';
    const name = document.createElement('span');
    name.textContent = `${index + 1}. ${column.name}`;
    const select = document.createElement('select');
    select.dataset.columnId = column.id;
    roleOptions.forEach(option => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });
    const currentRole = state.headerRoles[column.id] ?? 'ignore';
    select.value = currentRole;
    select.addEventListener('change', async () => {
      state.headerRoles[column.id] = select.value as ColumnRole;

      // datasetStateも更新
      datasetState[state.dataset].columnRoles = { ...state.headerRoles };

      // 生データから再正規化
      try {
        setProcessing(true, '列の役割を更新中...');
        await recomputeNormalizedDataForDataset(state.dataset);

        // 再計算された結果でworkingRowsを更新
        state.workingRows = cloneRows(datasetState[state.dataset].normalizedBom ?? []);

        // テーブルを再描画
        renderEditTable(state);
        setProcessing(false);
      } catch (error) {
        setProcessing(false);
        console.error('[renderHeaderRoleControls] Re-normalization failed:', error);
        alert(`列の役割変更に失敗しました: ${error}`);
      }
    });
    wrapper.appendChild(name);
    wrapper.appendChild(select);
    container.appendChild(wrapper);
  });
}

function renderEditTable(state: EditModalState) {
  const head = document.getElementById('edit-table-head');
  const body = document.getElementById('edit-table-body');
  if (!head || !body) return;

  head.innerHTML = '';
  body.innerHTML = '';

  const headerRow = document.createElement('tr');
  state.columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.name;
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);

  // エラー情報を取得
  const parseResult = datasetState[state.dataset].parseResult;
  const structuredErrors = parseResult?.structured_errors || [];

  // エラーをマップに変換（行,列 -> エラー）
  const errorMap = new Map<string, ParseError>();
  structuredErrors.forEach(error => {
    if (error.row !== undefined && error.column !== undefined) {
      const key = `${error.row},${error.column}`;
      errorMap.set(key, error);
    }
  });

  const MAX_EDIT_ROWS = 200;
  state.workingRows.slice(0, MAX_EDIT_ROWS).forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    state.columns.forEach((column, columnIndex) => {
      const td = document.createElement('td');
      td.contentEditable = 'true';
      td.dataset.rowIndex = String(rowIndex);
      td.dataset.columnName = column.name;
      td.dataset.columnId = column.id;
      td.dataset.columnIndex = String(columnIndex);
      const role = state.headerRoles[column.id] ?? 'ignore';
      td.textContent = getValueForColumnRole(row, column, role);

      // エラーがある場合、クラスを追加
      const errorKey = `${rowIndex},${columnIndex}`;
      const error = errorMap.get(errorKey);
      if (error) {
        if (error.severity === 'error') {
          td.classList.add('cell-error');
        } else if (error.severity === 'warning') {
          td.classList.add('cell-warning');
        }
        td.title = error.message; // ツールチップとしてエラーメッセージを表示
      }

      td.addEventListener('blur', event => {
        const target = event.currentTarget as HTMLTableCellElement;
        const index = Number(target.dataset.rowIndex ?? '0');
        const colId = target.dataset.columnId ?? '';
        const workingColumn = state.columns.find(col => col.id === colId) ?? column;
        const currentRole = state.headerRoles[workingColumn.id] ?? 'ignore';
        setValueForColumnRole(
          state.workingRows[index],
          workingColumn,
          currentRole,
          target.textContent ?? ''
        );
      });
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });

  if (state.workingRows.length > MAX_EDIT_ROWS) {
    const noticeRow = document.createElement('tr');
    const noticeCell = document.createElement('td');
    noticeCell.colSpan = state.columns.length;
    noticeCell.textContent = `表示は先頭 ${MAX_EDIT_ROWS} 行までです。全体の編集結果は保存時に反映されます。`;
    noticeCell.style.color = '#b45309';
    noticeRow.appendChild(noticeCell);
    body.appendChild(noticeRow);
  }
}

function openEditModalForDataset(dataset: DatasetKey) {
  const state = datasetState[dataset];
  if (!editModal || !state.parseResult) {
    alert(`${datasetLabel(dataset)} のデータが読み込まれていません。`);
    return;
  }

  const parseResult = state.parseResult;

  const normalizedRows = state.normalizedBom ?? [];
  if (normalizedRows.length === 0) {
    alert('表示できるデータがありません。列の役割を設定してください。');
    return;
  }

  const columns: ColumnMeta[] =
    parseResult.columns && parseResult.columns.length > 0
      ? parseResult.columns
      : resolveColumnsFromParseResult(parseResult);

  editModalState = {
    dataset,
    workingRows: cloneRows(normalizedRows),
    columns,
    headerRoles: (() => {
      const existingRoles = { ...datasetState[dataset].columnRoles };
      const roles: Record<string, ColumnRole> =
        Object.keys(existingRoles).length > 0
          ? existingRoles
          : deriveInitialColumnRoles(parseResult);

      if (parseResult.guessed_roles) {
        for (const [columnId, role] of Object.entries(parseResult.guessed_roles)) {
          if (!roles[columnId] && isColumnRole(role)) {
            roles[columnId] = role;
          }
        }
      }

      columns.forEach((column, index) => {
        if (roles[column.id]) return;

        const guessedRoleFromIndex = Object.entries(parseResult.guessed_columns ?? {}).find(
          ([role, idx]) => idx === index && isColumnRole(role)
        );

        roles[column.id] = guessedRoleFromIndex
          ? (guessedRoleFromIndex[0] as ColumnRole)
          : guessRoleFromColumnName(column.name);
      });
      return roles;
    })()
  };

  const subtitle = document.getElementById('edit-modal-subtitle');
  if (subtitle) {
    subtitle.textContent = [
      `${datasetLabel(dataset)} / 行数 ${normalizedRows.length.toLocaleString()}`,
      state.fileName ? `ファイル ${state.fileName}` : null
    ]
      .filter(Boolean)
      .join(' / ');
  }

  setEditDatasetToggle(dataset);
  renderHeaderRoleControls(editModalState);
  renderEditTable(editModalState);
  renderEditTable(editModalState);
  renderEditWarnings(parseResult);

  if (!editModal.open) {
    editModal.showModal();
  }
}

function highlightCell(rowIndex: number, columnIndex: number, context: 'edit' | 'preview') {
  let targetCell: HTMLElement | null = null;

  if (context === 'edit') {
    // 編集モーダル内のセルを探す
    const editTable = document.getElementById('edit-table');
    if (editTable) {
      const rows = editTable.querySelectorAll('tbody tr');
      const targetRow = rows[rowIndex];
      if (targetRow) {
        const cells = targetRow.querySelectorAll('td');
        targetCell = cells[columnIndex] as HTMLElement;
      }
    }
  } else {
    // プレビューテーブルのセルを探す
    // プレビューは複数あるので、どちらのデータセットか判断が必要
    // 現在の編集対象に応じて処理
  }

  if (targetCell) {
    // 既存のハイライトを削除
    document.querySelectorAll('.cell-highlight').forEach(el => {
      el.classList.remove('cell-highlight');
    });

    // 新しいセルをハイライト（一時的な強調）
    targetCell.classList.add('cell-highlight');

    // スクロールして表示（編集テーブルラッパー内でスクロール）
    const tableWrapper = targetCell.closest('.editable-table-wrapper');
    if (tableWrapper) {
      const cellRect = targetCell.getBoundingClientRect();
      const wrapperRect = tableWrapper.getBoundingClientRect();

      // セルがビューポート外にある場合、スクロール
      if (cellRect.top < wrapperRect.top || cellRect.bottom > wrapperRect.bottom) {
        targetCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      targetCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // フォーカスを当てる
    targetCell.focus();

    // 2秒後にハイライトを解除（エラー/警告の背景色は残る）
    setTimeout(() => {
      targetCell?.classList.remove('cell-highlight');
    }, 2000);
  }
}

function renderEditWarnings(parseResult: ParseResult) {
  const warningsPanel = document.getElementById('edit-warnings');
  const warningsList = document.getElementById('edit-warnings-list');

  if (!warningsPanel || !warningsList) return;

  const errors = parseResult.structured_errors || [];

  if (errors.length === 0) {
    warningsPanel.hidden = true;
    return;
  }

  warningsPanel.hidden = false;
  warningsList.innerHTML = '';

  errors.forEach(error => {
    const li = document.createElement('li');
    li.className = error.severity;
    li.textContent = error.message;

    // 行番号と列番号がある場合、クリック可能にする
    if (error.row !== undefined && error.column !== undefined) {
      li.style.cursor = 'pointer';
      li.style.textDecoration = 'underline';
      li.title = 'クリックして該当セルへ移動';

      li.addEventListener('click', () => {
        highlightCell(error.row!, error.column!, 'edit');
      });
    }

    warningsList.appendChild(li);
  });
}

// closeModal はutils/からインポートされています

function currentDictionaryName(): string {
  return dictionaryState.currentTab === 'registration' ? 'ipc_master' : 'exception_master';
}

// stringifyJSON はutils/からインポートされています

function onDropzoneFileSelected(dataset: DatasetKey, path: string, fileName: string) {
  void loadBomFile(dataset, path, fileName);
}

async function loadBomFile(dataset: DatasetKey, path: string, fileName: string) {
  try {
    console.log('[loadBomFile] Starting load:', { dataset, path, fileName });
    setProcessing(true, `${datasetLabel(dataset)} を読み込み中...`);
    const parseResult = await parseBomFile(path);
    const rowCount = parseResult.rows?.length ?? parseResult.bom_data.length;
    console.log('[loadBomFile] Parse result received:', {
      dataset,
      rowCount,
      errors: parseResult.errors.length
    });

    const initialColumnRoles = deriveInitialColumnRoles(parseResult);
    const columnMeta =
      parseResult.columns && parseResult.columns.length > 0
        ? parseResult.columns
        : resolveColumnsFromParseResult(parseResult);

    let normalizedBom = parseResult.bom_data ?? null;
    if (parseResult.rows && parseResult.rows.length > 0) {
      try {
        normalizedBom = await normalizeBomData(columnMeta, parseResult.rows, initialColumnRoles);
      } catch (normalizeError) {
        console.error('[loadBomFile] normalizeBomData failed, falling back to bom_data', normalizeError);
        normalizedBom = parseResult.bom_data ?? null;
      }
    }
    if (normalizedBom) {
      parseResult.bom_data = normalizedBom;
    }

    datasetState[dataset] = {
      parseResult,
      normalizedBom,
      fileName,
      filePath: path,
      lastUpdated: new Date().toISOString(),
      columnRoles: initialColumnRoles
    };

    console.log('[loadBomFile] datasetState updated:', {
      dataset,
      hasParseResult: Boolean(datasetState[dataset].parseResult)
    });

    console.log('[loadBomFile] Calling updateDropzone...');
    updateDropzone(dataset);
    console.log('[loadBomFile] Calling updatePreviewCard...');
    updatePreviewCard(dataset);
    console.log('[loadBomFile] Calling updateActionAvailability...');
    updateActionAvailability();
    logActivity(`${datasetLabel(dataset)} に ${fileName} を読み込みました。`);
    console.log('[loadBomFile] Load complete');

    // 直ちに自動保存を実行して最新状態を残しておく
    await autoSaveActiveProject(datasetState[dataset].fileName ?? undefined);
  } catch (error: unknown) {
    console.error('[loadBomFile] Failed to load BOM file');
    console.error('[loadBomFile] Error object:', error);
    console.error('[loadBomFile] Error type:', typeof error);
    console.error('[loadBomFile] Error JSON:', JSON.stringify(error, null, 2));

    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);

    console.error('[loadBomFile] Formatted message:', message);
    alert(`ファイルの読み込みに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

function registerDropzoneEvents() {
  const dropzones = Array.from(document.querySelectorAll<HTMLElement>('.dropzone'));
  dropzones.forEach(zone => {
    const dataset = zone.dataset.target as DatasetKey | undefined;
    if (!dataset) return;
    const surface = zone.querySelector<HTMLElement>('[data-surface]');

    const setDragging = (active: boolean) => {
      toggleDropzoneHover(dataset, active);
    };

    let dragCounter = 0;

    const handleDrop = (event: DragEvent) => {
      console.log('[html-drop] ===== DROP EVENT FIRED =====');
      event.preventDefault();
      event.stopPropagation();
      dragCounter = 0;
      setDragging(false);
      console.log('[html-drop] Drop event received on dataset:', dataset);
      console.log('[html-drop] event.dataTransfer?.files:', event.dataTransfer?.files);
      console.log('[html-drop] Current nativeDropState:', JSON.stringify(nativeDropState));

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) {
        console.warn('[html-drop] Drop event contained no files');
        return;
      }
      const file = files[0] as File & { path?: string };
      console.log('[html-drop] File object:', { name: file.name, size: file.size, type: file.type, path: file.path });

      let dropPath: string | undefined = file.path ?? undefined;
      console.log('[html-drop] file.path =', dropPath);

      if (!dropPath && nativeDropState.dataset === dataset && nativeDropState.paths.length > 0) {
        [dropPath] = nativeDropState.paths;
        console.log('[html-drop] Using path from nativeDropState:', dropPath);
      }

      if (!dropPath) {
        console.error('[html-drop] File path is unavailable.');
        console.error('[html-drop] file.path:', file.path);
        console.error('[html-drop] nativeDropState:', JSON.stringify(nativeDropState));
        console.error('[html-drop] Full file object:', file);
        alert('ファイルパスを取得できませんでした。選択ボタンから読み込んでください。');
        // エラー時のみクリア
        setTimeout(() => {
          nativeDropState.dataset = null;
          nativeDropState.paths = [];
        }, 100);
        return;
      }
      const displayName = file.name || dropPath.split(/[\\/]/).pop() || 'ドロップファイル';
      console.log('[html-drop] Invoking loader with path:', dropPath);
      onDropzoneFileSelected(dataset, dropPath, displayName);
      // ファイル読み込み処理が開始された後、少し遅延させてクリア
      // これにより、遅延したネイティブdropイベントが既存の値を上書きするのを防ぐ
      setTimeout(() => {
        console.log('[html-drop] Clearing nativeDropState after successful load');
        nativeDropState.dataset = null;
        nativeDropState.paths = [];
      }, 100);
    };

    const attachDragEvents = (element: HTMLElement | null) => {
      if (!element) return;
      element.addEventListener(
        'dragenter',
        event => {
          console.log('[html-drag] dragenter event on dataset:', dataset);
          event.preventDefault();
          dragCounter += 1;
          setDragging(true);
        },
        false
      );
      element.addEventListener(
        'dragover',
        event => {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
          }
          setDragging(true);
        },
        false
      );
      element.addEventListener(
        'dragleave',
        event => {
          event.preventDefault();
          dragCounter = Math.max(dragCounter - 1, 0);
          if (dragCounter === 0) {
            setDragging(false);
          }
        },
        false
      );
      element.addEventListener('drop', handleDrop, false);
    };

    attachDragEvents(surface);
    attachDragEvents(zone);
  });
}

function registerNativeDropBridge() {
  if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    console.info('[dropzone] Native drag/drop bridge unavailable (non-Tauri environment).');
    return;
  }

  console.log('[dropzone] Registering native drag/drop bridge...');
  const currentWindow = getCurrentWindow();

  currentWindow
    .onDragDropEvent((event) => {
      const eventType = event.payload.type;
      const position = 'position' in event.payload ? event.payload.position : undefined;
      const paths = 'paths' in event.payload ? event.payload.paths : [];

      console.debug('[native-drop] Event received:', { type: eventType, position, paths, currentState: nativeDropState });

      if (eventType === 'over') {
        const dataset = datasetFromPosition(position);
        console.debug('[native-drop] Over detected over dataset:', dataset);
        if (dataset !== nativeDropState.dataset) {
          if (nativeDropState.dataset) {
            toggleDropzoneHover(nativeDropState.dataset, false);
          }
          nativeDropState.dataset = dataset;
        }
        if (dataset) {
          toggleDropzoneHover(dataset, true);
        }
      } else if (eventType === 'drop') {
        console.log('[native-drop] Drop event - saving paths:', paths);
        // dropイベント時にpositionからdatasetを取得
        const dataset = datasetFromPosition(position);
        console.log('[native-drop] Drop position dataset:', dataset);

        if (dataset && paths && paths.length > 0) {
          // ネイティブdropイベントから直接ファイルを読み込む
          const filePath = paths[0];
          const fileName = filePath.split(/[\\/]/).pop() || 'ドロップファイル';
          console.log('[native-drop] Loading file directly:', { dataset, filePath, fileName });
          toggleDropzoneHover(dataset, false);
          onDropzoneFileSelected(dataset, filePath, fileName);
        } else {
          // フォールバック: HTML dropイベントのために状態を保存
          if (dataset) {
            nativeDropState.dataset = dataset;
            nativeDropState.paths = paths ?? [];
          } else if (nativeDropState.paths.length === 0) {
            nativeDropState.paths = paths ?? [];
          }
          console.log('[native-drop] nativeDropState saved for HTML handler:', nativeDropState);
          if (nativeDropState.dataset) {
            toggleDropzoneHover(nativeDropState.dataset, false);
          }
        }
      } else {
        console.debug('[native-drop] Cancel/leave event');
        if (nativeDropState.dataset) {
          toggleDropzoneHover(nativeDropState.dataset, false);
        }
        nativeDropState.dataset = null;
        nativeDropState.paths = [];
      }
    })
    .catch((error: unknown) => {
      console.error('[dropzone] Failed to register native drag/drop bridge:', error);
    });

  console.log('[dropzone] Native drag/drop bridge registered successfully');
}

function registerFilePickerButtons() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-select-target]')
  );
  buttons.forEach(button => {
    const dataset = button.dataset.selectTarget as DatasetKey | undefined;
    if (!dataset) return;
    button.addEventListener('click', async () => {
      const file = await open({
        filters: [
          { name: 'BOM Files', extensions: ['csv', 'xlsx'] },
          { name: 'すべてのファイル', extensions: ['*'] }
        ]
      });
      if (!file) return;
      if (Array.isArray(file)) {
        alert('複数ファイルには対応していません。');
        return;
      }
      onDropzoneFileSelected(dataset, file, file.split(/[\\/]/).pop() ?? '選択ファイル');
    });
  });
}

function registerEditButtons() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-open-edit]')
  );
  buttons.forEach(button => {
    const dataset = button.dataset.openEdit as DatasetKey | undefined;
    if (!dataset) return;
    button.addEventListener('click', () => {
      openEditModalForDataset(dataset);
    });
  });
}

function registerEditDatasetToggle() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-edit-dataset]')
  );
  buttons.forEach(button => {
    const dataset = button.dataset.editDataset as DatasetKey | undefined;
    if (!dataset) return;
    button.addEventListener('click', () => {
      openEditModalForDataset(dataset);
    });
  });
}

function registerModalCloseButtons() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-modal-close]')
  );
  buttons.forEach(button => {
    const modalId = button.dataset.modalClose;
    button.addEventListener('click', () => {
      const modal = document.getElementById(modalId ?? '') as HTMLDialogElement | null;
      closeModal(modal);
    });
  });
}

async function applyPreprocessPipeline() {
  if (!editModalState) return;

  const expandRef = (document.getElementById('expand-reference') as HTMLInputElement)?.checked;
  const splitRef = (document.getElementById('split-reference-rows') as HTMLInputElement)?.checked;
  const fillBlank = (document.getElementById('fill-blank-cells') as HTMLInputElement)?.checked;
  const cleanse = (document.getElementById('cleanse-text-data') as HTMLInputElement)?.checked;
  const formatRules = (document.getElementById('apply-format-rules') as HTMLInputElement)?.checked;

  if (!expandRef && !splitRef && !fillBlank && !cleanse && !formatRules) {
    alert('前処理を選択してください。');
    return;
  }

  try {
    setProcessing(true, '前処理を適用中...');
    let rows = editModalState.workingRows;

    if (expandRef) {
      rows = await expandReference(rows);
    }
    if (splitRef) {
      rows = await splitReferenceRows(rows);
    }
    if (fillBlank) {
      rows = await fillBlankCells(rows);
    }
    if (cleanse) {
      rows = await cleanseTextData(rows);
    }
    if (formatRules) {
      rows = await applyFormatRules(rows, {
        use_strikethrough: false,
        use_cell_color: true
      });
    }

    editModalState.workingRows = cloneRows(rows);
    renderEditTable(editModalState);
    logActivity(`${datasetLabel(editModalState.dataset)} に前処理を適用しました。`);
  } catch (error: unknown) {
    console.error('Failed to apply preprocess', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`前処理の実行に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

// ---- 前処理機能 (シンプルチェックボックス版) ----------------------------------
// チェックボックスの状態はDOM要素から直接取得するため、ここでは特に関数なし

async function applyEditChanges() {
  if (!editModalState) return;
  const dataset = editModalState.dataset;
  const original = datasetState[dataset].parseResult;
  if (!original) return;

  const { columns, headerRoles, workingRows } = editModalState;
  const refColumns = columns.filter(column => headerRoles[column.id] === 'ref');
  const partColumns = columns.filter(column => headerRoles[column.id] === 'part_no');

  if (refColumns.length === 0 || partColumns.length === 0) {
    alert('部品番号と部品型番の列を指定してください。');
    return;
  }

  columns.forEach(column => {
    if (!headerRoles[column.id]) {
      headerRoles[column.id] = 'ignore';
    }
  });

  const normalizedRows = cloneRows(workingRows);

  const rebuiltRows = normalizedRows.map(row =>
    columns.map(column => {
      const role = headerRoles[column.id] ?? 'ignore';
      return getValueForColumnRole(row, column, role);
    })
  );

  const appliedRoles: Record<string, ColumnRole> = {};
  for (const [columnId, role] of Object.entries(headerRoles)) {
    if (role !== 'ignore') {
      appliedRoles[columnId] = role;
    }
  }

  const guessedColumns: Record<string, number> = {};
  columns.forEach((column, index) => {
    const role = appliedRoles[column.id];
    if (role && role !== 'ignore') {
      guessedColumns[role] = index;
    }
  });

  original.rows = rebuiltRows;
  original.bom_data = cloneRows(normalizedRows);
  original.headers = columns.map(column => column.name);
  original.columns = columns;
  original.guessed_roles = { ...appliedRoles };
  original.guessed_columns = guessedColumns;

  datasetState[dataset].normalizedBom = normalizedRows;
  datasetState[dataset].columnRoles = appliedRoles;
  datasetState[dataset].lastUpdated = new Date().toISOString();

  editModalState.workingRows = cloneRows(normalizedRows);

  const summarize = (role: ColumnRole) => {
    const assigned = columns.filter(column => appliedRoles[column.id] === role);
    if (assigned.length === 0) return '未設定';
    if (assigned.length === 1) return assigned[0].name;
    return '複数列';
  };
  const roleSummary = [
    `部品番号: ${summarize('ref')}`,
    `部品型番: ${summarize('part_no')}`,
    `メーカー名: ${summarize('manufacturer')}`
  ].join(' / ');
  logActivity(`${datasetLabel(dataset)} の変更を反映しました（${roleSummary}）。`);

  populateColumnSettings(dataset);
  updateDropzone(dataset);
  updatePreviewCard(dataset);
  updateActionAvailability();
  renderHeaderRoleControls(editModalState);

  await autoSaveActiveProject();
  // モーダルは閉じない
}

async function runCompare() {
  if (!datasetState.a.parseResult || !datasetState.b.parseResult) {
    alert('両方のBOMを読み込んでから比較してください。');
    return;
  }
  const bomA = datasetState.a.normalizedBom;
  const bomB = datasetState.b.normalizedBom;
  if (!bomA || !bomB) {
    alert('列の役割が未設定のため比較できません。');
    return;
  }
  try {
    setProcessing(true, '差分を比較中...');
    currentDiffs = await compareBoms(bomA, bomB);
    renderDiffTable(currentDiffs);
    logActivity('BOM A と BOM B の比較を実行しました。');

    // 比較結果も履歴に残す
    await autoSaveActiveProject();
  } catch (error: unknown) {
    console.error('Comparison failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`比較処理に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function runReplace() {
  if (!datasetState.a.parseResult || !datasetState.b.parseResult) {
    alert('両方のBOMを読み込んでから置き換えを実行してください。');
    return;
  }
  const bomA = datasetState.a.normalizedBom;
  const bomB = datasetState.b.normalizedBom;
  if (!bomA || !bomB) {
    alert('列の役割が未設定のため置き換え処理を実行できません。');
    return;
  }
  try {
    setProcessing(true, '置き換えを実行中...');
    mergedBom = await updateAndAppendBoms(bomA, bomB);

    const summary = `置き換え結果: ${mergedBom.length.toLocaleString()} 行`;
    if (resultsSummary) {
      resultsSummary.textContent = summary;
    }
    if (diffResultContainer) {
      const table = createPreviewTable(mergedBom, buildColumns(mergedBom), 20);
      diffResultContainer.innerHTML = '';
      diffResultContainer.appendChild(table);
      diffResultContainer.hidden = false;
    }
    if (resultsPanel) {
      resultsPanel.hidden = false;
    }

    // 出力ボタンを表示
    const resultsActions = document.getElementById('results-actions');
    if (resultsActions) resultsActions.hidden = false;

    logActivity('置き換え処理を実行しました。');

    // 自動保存
    await autoSaveActiveProject();
  } catch (error: unknown) {
    console.error('Replace failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`置き換え処理に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

// ---- プロジェクト管理 --------------------------------------------------------

// ProjectRecord, ProjectSettings はtypes/からインポートされています

const PROJECT_ID_PREFIX = 'project_';
const AUTO_SAVE_MAX_LIMIT = 30;
const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autoIntervalMinutes: 15,
  autoMaxEntries: 10,
  defaultPreprocess: {
    expandReference: true,
    splitReferenceRows: false,
    fillBlankCells: true,
    cleanseTextData: true,
    applyFormatRules: false
  }
};

function normalizeDefaultPreprocessSettings(
  value?: ProjectSettings['defaultPreprocess']
): Required<NonNullable<ProjectSettings['defaultPreprocess']>> {
  const defaults = DEFAULT_PROJECT_SETTINGS.defaultPreprocess!;
  return {
    expandReference: value?.expandReference ?? defaults.expandReference,
    splitReferenceRows: value?.splitReferenceRows ?? defaults.splitReferenceRows,
    fillBlankCells: value?.fillBlankCells ?? defaults.fillBlankCells,
    cleanseTextData: value?.cleanseTextData ?? defaults.cleanseTextData,
    applyFormatRules: value?.applyFormatRules ?? defaults.applyFormatRules
  };
}

let projectSettings: ProjectSettings = loadProjectSettingsFromStorage();
let autoSaveTimer: number | null = null;
let activeProjectId: string | null = loadActiveProjectId();

// getStoredProjects, saveStoredProjects, loadActiveProjectId はutils/storageからインポートされています

function updateProjectControlStates() {
  const openWindowButton = document.getElementById('open-tab-window') as HTMLButtonElement | null;
  if (openWindowButton) {
    openWindowButton.disabled = !activeProjectId;
  }
}

function setActiveProject(projectId: string | null, options?: { skipRender?: boolean }) {
  activeProjectId = projectId;
  saveActiveProjectId(projectId);
  updateProjectUrl(projectId);
  if (!options?.skipRender) {
    renderProjectTabs();
  }
  updateCurrentTabDisplay();
  updateProjectControlStates();
}

function updateProjectUrl(projectId: string | null) {
  const url = new URL(window.location.href);
  if (projectId) {
    url.searchParams.set('project', projectId);
  } else {
    url.searchParams.delete('project');
  }
  window.history.replaceState(null, '', url.toString());
}

// ---- タブ表示管理 -------------------------------------------------------------
// getFavoriteProjects, saveFavoriteProjects はutils/storageからインポートされています

function updateCurrentTabDisplay() {
  const tabNameElement = document.getElementById('current-tab-name');

  if (!tabNameElement) return;

  if (activeProjectId) {
    const projects = getStoredProjects();
    const currentProject = projects.find(p => p.id === activeProjectId);
    const tabName = currentProject?.name || '未命名タブ';
    tabNameElement.textContent = tabName;
  } else {
    tabNameElement.textContent = '未命名タブ';
  }
}

// renameCurrentTab, toggleFavorite, openInNewWindow関数は削除されました
// タブの名前変更はプロジェクトタブバーで行います

function renderProjectTabs() {
  const favoritesTabBar = document.getElementById('favorites-tab-bar');
  if (!sessionTabBar) return;

  const favoriteProjects = getFavoriteProjects();
  const allProjects = getStoredProjects().sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const favorites = allProjects.filter(p => favoriteProjects.has(p.id));

  if (activeProjectId && !allProjects.some(project => project.id === activeProjectId)) {
    activeProjectId = null;
    saveActiveProjectId(null);
  }

  // お気に入りタブバーをレンダリング
  if (favoritesTabBar) {
    favoritesTabBar.innerHTML = '';
    if (favorites.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'session-tab-empty';
      empty.textContent = 'お気に入りはありません';
      favoritesTabBar.appendChild(empty);
    } else {
      favorites.forEach(project => {
        favoritesTabBar.appendChild(createProjectTabElement(project, favoriteProjects));
      });
    }
  }

  // 全プロジェクトタブバーをレンダリング
  sessionTabBar.innerHTML = '';
  if (allProjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'session-tab-empty';
    empty.textContent = '保存されたプロジェクトはありません';
    sessionTabBar.appendChild(empty);
  }

  allProjects.forEach(project => {
    sessionTabBar.appendChild(createProjectTabElement(project, favoriteProjects));
  });

  sessionTabBar.appendChild(createProjectTabAddElement());
}

function createProjectTabElement(project: ProjectRecord, favoriteProjects: Set<string>): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'session-tab';
  if (project.id === activeProjectId) {
    tab.classList.add('is-active');
  }

  const button = document.createElement('button');
  button.className = 'session-tab-button';
  button.type = 'button';
  const buttonContent = document.createElement('span');
  buttonContent.className = 'session-tab-text';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'session-tab-label';
  labelSpan.textContent = project.name ? project.name : '未命名タブ';
  buttonContent.appendChild(labelSpan);

  button.appendChild(buttonContent);
  button.addEventListener('click', () => {
    if (project.id === activeProjectId) {
      return;
    }
    loadProject(project);
  });

  // 星アイコン（お気に入りトグル）
  const star = document.createElement('button');
  star.className = 'session-tab-close session-tab-star';
  star.type = 'button';
  star.setAttribute('aria-label', favoriteProjects.has(project.id) ? 'お気に入りから削除' : 'お気に入りに追加');
  star.textContent = favoriteProjects.has(project.id) ? '★' : '☆';
  star.title = favoriteProjects.has(project.id) ? 'お気に入りから削除' : 'お気に入りに追加';
  star.addEventListener('click', event => {
    event.stopPropagation();
    toggleProjectFavorite(project.id);
  });

  // 別ウィンドウで開く
  const open = document.createElement('button');
  open.className = 'session-tab-close';
  open.type = 'button';
  open.setAttribute('aria-label', '別ウィンドウで開く');
  open.textContent = '↗︎';
  open.title = '別ウィンドウで開く';
  open.addEventListener('click', event => {
    event.stopPropagation();
    void invoke('open_project_window', { projectId: project.id });
  });

  // 名前変更
  const rename = document.createElement('button');
  rename.className = 'session-tab-close';
  rename.type = 'button';
  rename.setAttribute('aria-label', 'タブ名を変更');
  rename.textContent = '✎';
  rename.title = '名前変更';
  rename.addEventListener('click', event => {
    event.stopPropagation();
    startInlineTabRename(project.id, button, labelSpan);
  });

  // 削除
  const close = document.createElement('button');
  close.className = 'session-tab-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'タブを削除');
  close.textContent = '×';
  close.title = '削除';
  close.addEventListener('click', event => {
    event.stopPropagation();
    const displayName = project.name ?? '未命名タブ';
    if (confirm(`「${displayName}」を削除しますか？`)) {
      deleteStoredProject(project.id);
    }
  });

  tab.appendChild(button);
  tab.appendChild(star);
  tab.appendChild(open);
  tab.appendChild(rename);
  tab.appendChild(close);

  return tab;
}

function createProjectTabAddElement(): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'session-tab session-tab-action';

  const button = document.createElement('button');
  button.className = 'session-tab-button';
  button.type = 'button';
  const buttonContent = document.createElement('span');
  buttonContent.className = 'session-tab-text';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'session-tab-label';
  labelSpan.textContent = '＋ 新しいタブ';
  buttonContent.appendChild(labelSpan);

  button.appendChild(buttonContent);
  button.addEventListener('click', () => {
    void createNewProjectTab();
  });

  tab.appendChild(button);
  return tab;
}

function toggleProjectFavorite(projectId: string) {
  const favorites = getFavoriteProjects();

  if (favorites.has(projectId)) {
    favorites.delete(projectId);
    logActivity('お気に入りから削除しました');
  } else {
    favorites.add(projectId);
    logActivity('お気に入りに追加しました');
  }

  saveFavoriteProjects(favorites);
  updateCurrentTabDisplay();
  renderProjectTabs();
}

function renameProject(projectId: string, rawName: string): boolean {
  const projects = getStoredProjects();
  const target = projects.find(project => project.id === projectId);
  if (!target) {
    return false;
  }

  const trimmed = rawName.trim();
  const normalized = trimmed.length > 0 ? trimmed : null;

  if (target.name === normalized) {
    return false;
  }

  target.name = normalized;
  target.updatedAt = new Date().toISOString();

  if (!saveStoredProjects(projects)) {
    return false;
  }

  const displayName = normalized ?? '未命名タブ';
  logActivity(`タブ名を「${displayName}」に変更しました。`);
  renderProjectTabs();
  if (projectId === activeProjectId) {
    updateCurrentTabDisplay();
  }
  return true;
}

function startInlineTabRename(
  projectId: string,
  button: HTMLButtonElement,
  labelSpan: HTMLSpanElement
) {
  if (button.querySelector('.session-tab-rename-input')) {
    return;
  }

  const originalText = labelSpan.textContent ?? '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'session-tab-rename-input';
  input.value = labelSpan.textContent ?? '';
  input.setAttribute('aria-label', 'タブ名を変更');

  labelSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  const restoreLabel = (text = originalText) => {
    if (committed) {
      return;
    }
    labelSpan.textContent = text;
    if (input.isConnected) {
      input.replaceWith(labelSpan);
    }
  };

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      committed = true;
      const newName = input.value;
      if (!renameProject(projectId, newName)) {
        committed = false;
        restoreLabel();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      restoreLabel();
    }
  });

  input.addEventListener(
    'blur',
    () => {
      restoreLabel();
    },
    { once: true }
  );
}

function loadProjectSettingsFromStorage(): ProjectSettings {
  const stored = loadProjectSettings();
  if (!stored) {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }
  return {
    autoIntervalMinutes: sanitizeAutoInterval(stored.autoIntervalMinutes),
    autoMaxEntries: sanitizeAutoCount(stored.autoMaxEntries),
    defaultPreprocess: normalizeDefaultPreprocessSettings(stored.defaultPreprocess)
  };
}

function sanitizeAutoInterval(value: unknown): number {
  const numeric = Number(value);
  const minutes = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_PROJECT_SETTINGS.autoIntervalMinutes;
  const clamped = Math.max(1, Math.min(180, minutes));
  return clamped;
}

function sanitizeAutoCount(value: unknown): number {
  const numeric = Number(value);
  const count = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_PROJECT_SETTINGS.autoMaxEntries;
  const clamped = Math.max(1, Math.min(AUTO_SAVE_MAX_LIMIT, count));
  return clamped;
}

function applyProjectSettingsToForm(settings: ProjectSettings) {
  const intervalInput = document.getElementById('session-auto-interval') as HTMLInputElement | null;
  const countInput = document.getElementById('session-auto-count') as HTMLInputElement | null;
  if (intervalInput) {
    intervalInput.value = String(settings.autoIntervalMinutes);
  }
  if (countInput) {
    countInput.value = String(settings.autoMaxEntries);
  }

  // デフォルト前処理の設定
  const preprocess = normalizeDefaultPreprocessSettings(settings.defaultPreprocess);
  const expandInput = document.getElementById('default-preprocess-expand') as HTMLInputElement | null;
  const splitInput = document.getElementById('default-preprocess-split') as HTMLInputElement | null;
  const fillInput = document.getElementById('default-preprocess-fill') as HTMLInputElement | null;
  const cleanseInput = document.getElementById('default-preprocess-cleanse') as HTMLInputElement | null;
  const formatInput = document.getElementById('default-preprocess-format') as HTMLInputElement | null;
  if (expandInput) expandInput.checked = preprocess.expandReference;
  if (splitInput) splitInput.checked = preprocess.splitReferenceRows;
  if (fillInput) fillInput.checked = preprocess.fillBlankCells;
  if (cleanseInput) cleanseInput.checked = preprocess.cleanseTextData;
  if (formatInput) formatInput.checked = preprocess.applyFormatRules;
}

function readProjectSettingsFromForm(): ProjectSettings {
  const intervalInput = document.getElementById('session-auto-interval') as HTMLInputElement | null;
  const countInput = document.getElementById('session-auto-count') as HTMLInputElement | null;
  const intervalValue = intervalInput?.value ?? DEFAULT_PROJECT_SETTINGS.autoIntervalMinutes;
  const countValue = countInput?.value ?? DEFAULT_PROJECT_SETTINGS.autoMaxEntries;

  // デフォルト前処理の設定を読み取り
  const expandInput = document.getElementById('default-preprocess-expand') as HTMLInputElement | null;
  const splitInput = document.getElementById('default-preprocess-split') as HTMLInputElement | null;
  const fillInput = document.getElementById('default-preprocess-fill') as HTMLInputElement | null;
  const cleanseInput = document.getElementById('default-preprocess-cleanse') as HTMLInputElement | null;
  const formatInput = document.getElementById('default-preprocess-format') as HTMLInputElement | null;

  return {
    autoIntervalMinutes: sanitizeAutoInterval(intervalValue),
    autoMaxEntries: sanitizeAutoCount(countValue),
    defaultPreprocess: {
      expandReference: expandInput?.checked ?? true,
      splitReferenceRows: splitInput?.checked ?? false,
      fillBlankCells: fillInput?.checked ?? true,
      cleanseTextData: cleanseInput?.checked ?? true,
      applyFormatRules: formatInput?.checked ?? false
    }
  };
}

function saveProjectSettings(settings: ProjectSettings) {
  projectSettings = {
    autoIntervalMinutes: sanitizeAutoInterval(settings.autoIntervalMinutes),
    autoMaxEntries: sanitizeAutoCount(settings.autoMaxEntries),
    defaultPreprocess: normalizeDefaultPreprocessSettings(settings.defaultPreprocess)
  };
  saveProjectSettingsToStorage(projectSettings);
  startAutoSaveTimer();
  applyProjectSettingsToForm(projectSettings);
}

function startAutoSaveTimer() {
  stopAutoSaveTimer();
  const intervalMinutes = sanitizeAutoInterval(projectSettings.autoIntervalMinutes);
  const intervalMs = intervalMinutes * 60_000;
  autoSaveTimer = window.setInterval(() => {
    void triggerScheduledAutoSave();
  }, intervalMs);
}

function stopAutoSaveTimer() {
  if (autoSaveTimer !== null) {
    window.clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

async function triggerScheduledAutoSave() {
  if (!hasAnyDatasetLoaded()) {
    return;
  }
  await autoSaveActiveProject();
}

function hasAnyDatasetLoaded(): boolean {
  return Boolean(datasetState.a.parseResult || datasetState.b.parseResult);
}

function getAutoSaveLimit(): number {
  return sanitizeAutoCount(projectSettings.autoMaxEntries);
}

function createEmptyProjectSnapshot(): ProjectPayload {
  const savedAt = new Date().toISOString();
  return {
    version: 1,
    savedAt,
    bomA: null,
    bomB: null,
    columnRolesA: {},
    columnRolesB: {},
    normalizedBomA: null,
    normalizedBomB: null
  };
}

function createProjectSnapshot(): ProjectPayload {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    bomA: datasetState.a.parseResult,
    bomB: datasetState.b.parseResult,
    columnRolesA: { ...datasetState.a.columnRoles },
    columnRolesB: { ...datasetState.b.columnRoles },
    normalizedBomA: datasetState.a.normalizedBom ? cloneRows(datasetState.a.normalizedBom) : null,
    normalizedBomB: datasetState.b.normalizedBom ? cloneRows(datasetState.b.normalizedBom) : null
  };
}

function generateTimestampLabel(): string {
  return new Date().toLocaleString('ja-JP');
}

function generateDefaultProjectName(): string {
  const bomAName = datasetState.a.fileName;
  if (bomAName) {
    return `${bomAName} ${generateTimestampLabel()}`;
  }
  return `タブ ${generateTimestampLabel()}`;
}

function resetWorkspace() {
  datasetState.a = {
    parseResult: null,
    normalizedBom: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  };

  datasetState.b = {
    parseResult: null,
    normalizedBom: null,
    fileName: null,
    filePath: null,
    lastUpdated: null,
    columnRoles: {}
  };

  currentDiffs = [];
  mergedBom = null;
  editModalState = null;

  updateDropzone('a');
  updateDropzone('b');
  updatePreviewCard('a');
  updatePreviewCard('b');
  updateActionAvailability();

  if (diffResultContainer) {
    diffResultContainer.innerHTML = '';
    diffResultContainer.hidden = true;
  }
  if (resultsSummary) {
    resultsSummary.textContent = '結果がまだありません。比較または置き換えを実行してください。';
  }
  const resultsActions = document.getElementById('results-actions');
  if (resultsActions) {
    resultsActions.hidden = true;
  }
  if (resultsPanel) {
    resultsPanel.hidden = true;
  }
  syncPreviewEmptyState();
}

function applyProjectLimit(projects: ProjectRecord[]): ProjectRecord[] {
  const limit = getAutoSaveLimit();
  if (limit <= 0 || projects.length <= limit) {
    return projects;
  }
  return [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

async function createNewProjectTab() {
  await autoSaveActiveProject();

  const snapshot = createEmptyProjectSnapshot();
  const projects = getStoredProjects();
  const newProject: ProjectRecord = {
    id: `${PROJECT_ID_PREFIX}${Date.now()}`,
    name: null,
    createdAt: snapshot.savedAt,
    updatedAt: snapshot.savedAt,
    data: snapshot
  };
  projects.push(newProject);
  const limited = applyProjectLimit(projects);
  if (!saveStoredProjects(limited)) {
    return;
  }

  loadProject(newProject);
  logActivity('新しいタブを作成しました。');
}

function openActiveProjectInNewWindow() {
  if (!activeProjectId) {
    alert('開けるタブがありません。');
    return;
  }
  void invoke('open_project_window', { projectId: activeProjectId });
}

// archiveCurrentProjectIfNeeded は現在未使用（将来使用する可能性あり）
// function archiveCurrentProjectIfNeeded() {
//   if (!hasAnyDatasetLoaded()) {
//     return;
//   }
//
//   const snapshot = createProjectSnapshot();
//   const now = snapshot.savedAt;
//   const projects = getStoredProjects();
//
//   const index = activeProjectId ? projects.findIndex(project => project.id === activeProjectId) : -1;
//   const activeRecord = index >= 0 ? projects[index] : undefined;
//
//   const baseName = activeRecord?.name && activeRecord.name.trim().length > 0
//     ? activeRecord.name
//     : datasetState.a.fileName ?? 'タブ';
//   const archivedName = `${baseName} ${generateTimestampLabel()}`;
//
//   const archived: ProjectRecord = {
//     id: `${PROJECT_ID_PREFIX}${Date.now()}`,
//     name: archivedName,
//     createdAt: activeRecord?.createdAt ?? now,
//     updatedAt: now,
//     data: snapshot
//   };
//
//   if (index >= 0) {
//     projects[index] = archived;
//   } else {
//     projects.push(archived);
//   }
//   const limited = applyProjectLimit(projects);
//   saveStoredProjects(limited);
// }

async function autoSaveActiveProject(nameHint?: string) {
  if (!hasAnyDatasetLoaded()) {
    return;
  }

  const snapshot = createProjectSnapshot();
  const now = snapshot.savedAt;
  const projects = getStoredProjects();

  let projectId = activeProjectId;
  let index = projectId ? projects.findIndex(project => project.id === projectId) : -1;

  if (index >= 0) {
    projects[index] = {
      ...projects[index],
      name: projects[index].name ?? nameHint ?? projects[index].name,
      updatedAt: now,
      data: snapshot
    };
  } else {
    const newProject: ProjectRecord = {
      id: `${PROJECT_ID_PREFIX}${Date.now()}`,
      name: nameHint ?? null,
      createdAt: now,
      updatedAt: now,
      data: snapshot
    };
    projects.push(newProject);
    projectId = newProject.id;
  }

  const limited = applyProjectLimit(projects);
  if (!saveStoredProjects(limited)) {
    return;
  }

  if (projectId) {
    setActiveProject(projectId);
  } else {
    renderProjectTabs();
  }
}

async function saveProjectAs(name?: string) {
  if (!hasAnyDatasetLoaded()) {
    alert('保存できる内容がありません。');
    return;
  }

  const providedName = typeof name === 'string' ? name.trim() : '';
  const projectName =
    providedName.length > 0
      ? providedName
      : prompt('タブ名を入力してください:', generateDefaultProjectName())?.trim();

  if (!projectName) {
    return;
  }

  const snapshot = createProjectSnapshot();
  const now = snapshot.savedAt;
  const projects = getStoredProjects();

  let projectId = activeProjectId;
  let index = projectId ? projects.findIndex(project => project.id === projectId) : -1;

  if (index < 0) {
    const newProject: ProjectRecord = {
      id: `${PROJECT_ID_PREFIX}${Date.now()}`,
      name: projectName,
      createdAt: now,
      updatedAt: now,
      data: snapshot
    };
    projects.push(newProject);
    projectId = newProject.id;
  } else {
    projects[index] = {
      ...projects[index],
      name: projectName,
      updatedAt: now,
      data: snapshot
    };
  }

  const limited = applyProjectLimit(projects);
  if (!saveStoredProjects(limited)) {
    return;
  }

  if (projectId) {
    setActiveProject(projectId);
  } else {
    renderProjectTabs();
  }
  logActivity(`タブを「${projectName}」として保存しました。`);
}

function loadProject(record: ProjectRecord) {
  const payload = record.data;

  datasetState.a.parseResult = payload.bomA ? { ...payload.bomA } : null;
  datasetState.a.normalizedBom = payload.normalizedBomA
    ? cloneRows(payload.normalizedBomA)
    : payload.bomA?.bom_data
    ? cloneRows(payload.bomA.bom_data)
    : null;
  if (datasetState.a.parseResult && datasetState.a.normalizedBom) {
    datasetState.a.parseResult.bom_data = cloneRows(datasetState.a.normalizedBom);
  }
  datasetState.a.fileName = payload.bomA ? record.name ?? null : null;
  datasetState.a.filePath = null;
  datasetState.a.lastUpdated = payload.bomA ? new Date().toISOString() : null;
  datasetState.a.columnRoles = normalizeStoredColumnRoles(datasetState.a.parseResult, payload.columnRolesA);

  datasetState.b.parseResult = payload.bomB ? { ...payload.bomB } : null;
  datasetState.b.normalizedBom = payload.normalizedBomB
    ? cloneRows(payload.normalizedBomB)
    : payload.bomB?.bom_data
    ? cloneRows(payload.bomB.bom_data)
    : null;
  if (datasetState.b.parseResult && datasetState.b.normalizedBom) {
    datasetState.b.parseResult.bom_data = cloneRows(datasetState.b.normalizedBom);
  }
  datasetState.b.fileName = payload.bomB ? record.name ?? null : null;
  datasetState.b.filePath = null;
  datasetState.b.lastUpdated = payload.bomB ? new Date().toISOString() : null;
  datasetState.b.columnRoles = normalizeStoredColumnRoles(datasetState.b.parseResult, payload.columnRolesB);

  updateDropzone('a');
  updateDropzone('b');
  updatePreviewCard('a');
  updatePreviewCard('b');
  updateActionAvailability();
  logActivity(`タブ「${record.name ?? '未命名タブ'}」を読み込みました。`);
  setActiveProject(record.id);
}

function deleteStoredProject(projectId: string) {
  const projects = getStoredProjects();
  const filtered = projects.filter(project => project.id !== projectId);
  if (!saveStoredProjects(filtered)) {
    return;
  }
  if (projectId === activeProjectId) {
    setActiveProject(null, { skipRender: true });
    resetWorkspace();
  }
  renderProjectTabs();
}

// createNewProjectTab関数は削除されました
// タブの作成はプロジェクトタブバーで行います

function initializeProjects() {
  let projects = getStoredProjects();

  if (projects.length === 0) {
    const snapshot = createProjectSnapshot();
    const now = snapshot.savedAt;
    const initialProject: ProjectRecord = {
      id: `${PROJECT_ID_PREFIX}${Date.now()}`,
      name: null,
      createdAt: now,
      updatedAt: now,
      data: snapshot
    };
    if (!saveStoredProjects([initialProject])) {
      return;
    }
    projects = [initialProject];
    activeProjectId = initialProject.id;
  }

  const params = new URLSearchParams(window.location.search);
  let requestedId = params.get('project');

  const scriptProjectId = (window as typeof window & { __INITIAL_PROJECT_ID__?: unknown })
    .__INITIAL_PROJECT_ID__;

  if (!requestedId && typeof scriptProjectId === 'string' && scriptProjectId.length > 0) {
    requestedId = scriptProjectId;
  }

  let target = requestedId
    ? projects.find(project => project.id === requestedId)
    : undefined;

  if (!target && activeProjectId) {
    target = projects.find(project => project.id === activeProjectId);
  }

  if (!target) {
    target = projects[projects.length - 1];
  }

  if (target) {
    setActiveProject(target.id, { skipRender: true });
    loadProject(target);
  } else {
    renderProjectTabs();
  }
}

async function openSettings() {
  if (!settingsModal) return;
  if (!settingsModal.open) {
    settingsModal.showModal();
  }
  applyProjectSettingsToForm(projectSettings);
  await loadDictionaryIntoEditor();
}

async function loadDictionaryIntoEditor() {
  if (!dictionaryEditor) return;
  try {
    setProcessing(true, '辞書を読み込み中...');
    const content = await loadDictionary(currentDictionaryName());
    dictionaryEditor.value = stringifyJSON(content);
    logActivity('辞書を読み込みました。');
  } catch (error: unknown) {
    console.error('Load dictionary failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`辞書の読み込みに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function saveDictionaryFromEditor(event: SubmitEvent) {
  event.preventDefault();
  if (!dictionaryEditor) return;
  try {
    setProcessing(true, '辞書を書き込み中...');
    await saveDictionary(currentDictionaryName(), dictionaryEditor.value);
    logActivity('辞書を保存しました。');
    closeModal(settingsModal);
  } catch (error: unknown) {
    console.error('Save dictionary failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`辞書の保存に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function importDictionaryFromFile() {
  if (!dictionaryEditor) return;
  const file = await open({
    filters: [{ name: 'JSON ファイル', extensions: ['json'] }]
  });
  if (!file || Array.isArray(file)) return;

  try {
    setProcessing(true, '辞書をインポート中...');
    const content = await loadSessionFromFile(file);
    dictionaryEditor.value = stringifyJSON(content);
    logActivity('辞書をファイルから読み込みました。');
  } catch (error: unknown) {
    console.error('Import dictionary failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`辞書のインポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function exportDictionaryToFile() {
  if (!dictionaryEditor) return;
  const filePath = await save({
    filters: [{ name: 'JSON ファイル', extensions: ['json'] }],
    defaultPath: `${currentDictionaryName()}-${Date.now()}.json`
  });
  if (!filePath) return;

  try {
    setProcessing(true, '辞書をエクスポート中...');
    await saveSessionToFile(filePath, dictionaryEditor.value);
    logActivity('辞書をファイルに書き出しました。');
  } catch (error: unknown) {
    console.error('Export dictionary failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`辞書のエクスポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

// ---- 新しい辞書UI機能 ---------------------------------------------------------

function renderRegistrationTable() {
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

function renderExceptionTable() {
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

function saveDictionaryRegistrationData() {
  saveRegistrationData(dictionaryState.registrations);
}

function saveDictionaryExceptionData() {
  saveExceptionData(dictionaryState.exceptions);
}

function loadDictionaryRegistrationData() {
  const data = loadRegistrationData();
  if (data.length > 0) {
    dictionaryState.registrations = data;
  }
}

function loadDictionaryExceptionData() {
  const data = loadExceptionData();
  if (data.length > 0) {
    dictionaryState.exceptions = data;
  }
}

function addRegistrationRow() {
  dictionaryState.registrations.push({
    partNo: '',
    registrationName: ''
  });
  renderRegistrationTable();
}

function addExceptionRow() {
  dictionaryState.exceptions.push({
    ref: '',
    partNo: '',
    registrationName: ''
  });
  renderExceptionTable();
}

function extractFromBOM() {
  // 現在ロードされているBOMデータから部品型番を抽出
  const partNos = new Set<string>();

  if (datasetState.a.normalizedBom) {
    datasetState.a.normalizedBom.forEach(row => {
      if (row.part_no && row.part_no.trim()) {
        partNos.add(row.part_no.trim());
      }
    });
  }

  if (datasetState.b.normalizedBom) {
    datasetState.b.normalizedBom.forEach(row => {
      if (row.part_no && row.part_no.trim()) {
        partNos.add(row.part_no.trim());
      }
    });
  }

  if (partNos.size === 0) {
    alert('BOMデータがロードされていないか、部品型番が見つかりませんでした。');
    return;
  }

  // 既存の登録名リストにない部品型番のみ追加
  const existingPartNos = new Set(dictionaryState.registrations.map(e => e.partNo));

  let addedCount = 0;
  partNos.forEach(partNo => {
    if (!existingPartNos.has(partNo)) {
      dictionaryState.registrations.push({
        partNo: partNo,
        registrationName: ''
      });
      addedCount++;
    }
  });

  saveDictionaryRegistrationData();
  renderRegistrationTable();
  logActivity(`BOMから${addedCount}件の部品型番を抽出しました。`);
}

async function importRegistrationCSV() {
  const file = await open({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }]
  });
  if (!file || Array.isArray(file)) return;

  try {
    setProcessing(true, 'CSVをインポート中...');
    const result = await parseBomFile(file);

    // CSV の1列目を part_no、2列目を registration_name として読み込む
    result.bom_data.forEach(row => {
      const partNo = row.ref || ''; // 1列目
      const registrationName = row.part_no || ''; // 2列目

      if (partNo.trim()) {
        dictionaryState.registrations.push({
          partNo: partNo.trim(),
          registrationName: registrationName.trim()
        });
      }
    });

    saveDictionaryRegistrationData();
    renderRegistrationTable();
    logActivity('登録名リストをCSVからインポートしました。');
  } catch (error: unknown) {
    console.error('Import registration CSV failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`CSVのインポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function exportRegistrationCSV() {
  const filePath = await save({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }],
    defaultPath: `registration-list-${Date.now()}.csv`
  });
  if (!filePath) return;

  try {
    setProcessing(true, 'CSVをエクスポート中...');

    // CSVヘッダーと内容を生成
    let csvContent = 'Part No,Registration Name\n';
    dictionaryState.registrations.forEach(entry => {
      const partNo = entry.partNo.replace(/"/g, '""');
      const name = entry.registrationName.replace(/"/g, '""');
      csvContent += `"${partNo}","${name}"\n`;
    });

    await saveSessionToFile(filePath, csvContent);

    logActivity('登録名リストをCSVにエクスポートしました。');
  } catch (error: unknown) {
    console.error('Export registration CSV failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`CSVのエクスポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function importExceptionCSV() {
  const file = await open({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }]
  });
  if (!file || Array.isArray(file)) return;

  try {
    setProcessing(true, 'CSVをインポート中...');
    const result = await parseBomFile(file);

    // CSV の1列目を ref、2列目を part_no、3列目を registration_name として読み込む
    result.bom_data.forEach(row => {
      const ref = row.ref || '';
      const partNo = row.part_no || '';
      const registrationName = row.attributes?.['value'] || row.attributes?.['registration_name'] || ''; // 3列目

      if (ref.trim()) {
        dictionaryState.exceptions.push({
          ref: ref.trim(),
          partNo: partNo.trim(),
          registrationName: registrationName.trim()
        });
      }
    });

    saveDictionaryExceptionData();
    renderExceptionTable();
    logActivity('特定部品リストをCSVからインポートしました。');
  } catch (error: unknown) {
    console.error('Import exception CSV failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`CSVのインポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

async function exportExceptionCSV() {
  const filePath = await save({
    filters: [{ name: 'CSV ファイル', extensions: ['csv'] }],
    defaultPath: `exception-list-${Date.now()}.csv`
  });
  if (!filePath) return;

  try {
    setProcessing(true, 'CSVをエクスポート中...');

    // CSVヘッダーと内容を生成
    let csvContent = 'Ref,Part No,Registration Name\n';
    dictionaryState.exceptions.forEach(entry => {
      const ref = entry.ref.replace(/"/g, '""');
      const partNo = entry.partNo.replace(/"/g, '""');
      const name = entry.registrationName.replace(/"/g, '""');
      csvContent += `"${ref}","${partNo}","${name}"\n`;
    });

    await saveSessionToFile(filePath, csvContent);

    logActivity('特定部品リストをCSVにエクスポートしました。');
  } catch (error: unknown) {
    console.error('Export exception CSV failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`CSVのエクスポートに失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

function applyRegistrationToBOM() {
  // BOM AとBの両方に登録名を適用
  let appliedCount = 0;

  const applyToDataset = (dataset: DatasetKey) => {
    const state = datasetState[dataset];
    if (!state.normalizedBom) return;

    state.normalizedBom.forEach(row => {
      // まず例外リストをチェック（優先度高）
      const exception = dictionaryState.exceptions.find(
        e => e.ref === row.ref && e.partNo === row.part_no
      );

      if (exception && exception.registrationName) {
        if (!row.attributes) row.attributes = {};
        row.attributes['registration_name'] = exception.registrationName;
        appliedCount++;
        return;
      }

      // 次に登録名リストをチェック
      const registration = dictionaryState.registrations.find(
        e => e.partNo === row.part_no
      );

      if (registration && registration.registrationName) {
        if (!row.attributes) row.attributes = {};
        row.attributes['registration_name'] = registration.registrationName;
        appliedCount++;
      }
    });

    if (state.parseResult) {
      state.parseResult.bom_data = state.normalizedBom;
    }
  };

  applyToDataset('a');
  applyToDataset('b');

  // プレビューを更新
  updatePreviewCard('a');
  updatePreviewCard('b');

  logActivity(`${appliedCount}件の登録名をBOMに適用しました。`);
  alert(`${appliedCount}件の登録名をBOMに適用しました。`);
}

function registerDictionaryTabs() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-dictionary-tab]')
  );
  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const tab = button.dataset.dictionaryTab as DictionaryTab | undefined;
      if (!tab) return;
      dictionaryState.currentTab = tab;
      buttons.forEach(btn => {
        btn.classList.toggle('is-active', btn === button);
      });

      // 対応するタブコンテンツを表示
      const registrationContent = document.getElementById('dictionary-content-registration');
      const exceptionContent = document.getElementById('dictionary-content-exception');

      if (tab === 'registration') {
        registrationContent?.removeAttribute('hidden');
        exceptionContent?.setAttribute('hidden', '');
        renderRegistrationTable();
      } else if (tab === 'exception') {
        registrationContent?.setAttribute('hidden', '');
        exceptionContent?.removeAttribute('hidden');
        renderExceptionTable();
      }
    });
  });
}

function registerSettingsButtons() {
  document.getElementById('open-settings')?.addEventListener('click', () => {
    void openSettings();
  });

  // 設定タブ切り替え
  document.querySelectorAll('[data-settings-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = (button as HTMLElement).dataset.settingsTab;
      document.querySelectorAll('[data-settings-tab]').forEach(b => b.classList.remove('is-active'));
      button.classList.add('is-active');
      document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.setAttribute('hidden', '');
      });
      document.getElementById(`settings-panel-${tab}`)?.removeAttribute('hidden');
    });
  });

  // テーマ保存
  document.getElementById('save-settings')?.addEventListener('click', () => {
    saveAppSettings();
  });

  // テーマリセット
  document.getElementById('reset-theme')?.addEventListener('click', () => {
    resetTheme();
  });

  document.getElementById('load-dictionary')?.addEventListener('click', () => {
    void loadDictionaryIntoEditor();
  });
  document.getElementById('import-dictionary')?.addEventListener('click', () => {
    void importDictionaryFromFile();
  });
  document.getElementById('export-dictionary')?.addEventListener('click', () => {
    void exportDictionaryToFile();
  });
  document.getElementById('save-dictionary')?.addEventListener('click', () => {
    void saveDictionaryFromEditor({ preventDefault: () => {} } as SubmitEvent);
  });

  // 登録名リスト ボタン
  document.getElementById('extract-from-bom')?.addEventListener('click', () => {
    extractFromBOM();
  });
  document.getElementById('add-registration-row')?.addEventListener('click', () => {
    addRegistrationRow();
  });
  document.getElementById('import-registration-csv')?.addEventListener('click', () => {
    void importRegistrationCSV();
  });
  document.getElementById('export-registration-csv')?.addEventListener('click', () => {
    void exportRegistrationCSV();
  });
  document.getElementById('apply-registration-to-bom')?.addEventListener('click', () => {
    applyRegistrationToBOM();
  });

  // 特定部品 ボタン
  document.getElementById('add-exception-row')?.addEventListener('click', () => {
    addExceptionRow();
  });
  document.getElementById('import-exception-csv')?.addEventListener('click', () => {
    void importExceptionCSV();
  });
  document.getElementById('export-exception-csv')?.addEventListener('click', () => {
    void exportExceptionCSV();
  });
  document.getElementById('apply-exception-to-bom')?.addEventListener('click', () => {
    applyRegistrationToBOM(); // 同じ関数を使用（内部で例外と登録両方を処理）
  });
}

const DEFAULT_THEME_COLORS = {
  primary: '#3f8fc0',
  secondary: '#e6eef7',
  danger: '#d95d5d'
} as const;

function getThemeColorInputs():
  { primary: HTMLInputElement; secondary: HTMLInputElement; danger: HTMLInputElement } | null {
  const primary = document.getElementById('theme-primary-color') as HTMLInputElement | null;
  const secondary = document.getElementById('theme-secondary-color') as HTMLInputElement | null;
  const danger = document.getElementById('theme-danger-color') as HTMLInputElement | null;
  if (!primary || !secondary || !danger) {
    return null;
  }
  return { primary, secondary, danger };
}

function saveAppSettings() {
  const inputs = getThemeColorInputs();
  const colors = inputs
    ? {
        primary: inputs.primary.value,
        secondary: inputs.secondary.value,
        danger: inputs.danger.value
      }
    : { ...DEFAULT_THEME_COLORS };

  localStorage.setItem('theme-primary', colors.primary);
  localStorage.setItem('theme-secondary', colors.secondary);
  localStorage.setItem('theme-danger', colors.danger);

  applyTheme(colors.primary, colors.secondary, colors.danger);

  const projectValues = readProjectSettingsFromForm();
  saveProjectSettings(projectValues);

  alert('設定を保存しました。');
}

function resetTheme() {
  const defaults = { ...DEFAULT_THEME_COLORS };
  const inputs = getThemeColorInputs();
  if (inputs) {
    inputs.primary.value = defaults.primary;
    inputs.secondary.value = defaults.secondary;
    inputs.danger.value = defaults.danger;
  }

  localStorage.removeItem('theme-primary');
  localStorage.removeItem('theme-secondary');
  localStorage.removeItem('theme-danger');

  applyTheme(defaults.primary, defaults.secondary, defaults.danger);
}

function applyTheme(primary: string, secondary: string, danger: string) {
  document.documentElement.style.setProperty('--color-primary', primary);
  document.documentElement.style.setProperty('--color-secondary', secondary);
  document.documentElement.style.setProperty('--color-danger', danger);
}

function loadAndApplyThemeSettings() {
  const colors = loadThemeSettings();

  const inputs = getThemeColorInputs();
  if (inputs) {
    inputs.primary.value = colors.primary;
    inputs.secondary.value = colors.secondary;
    inputs.danger.value = colors.danger;
  }

  applyTheme(colors.primary, colors.secondary, colors.danger);
}

function registerInitialProjectListener() {
  window.addEventListener('initial-project-ready', () => {
    const scriptProjectId = (window as typeof window & { __INITIAL_PROJECT_ID__?: unknown }).__INITIAL_PROJECT_ID__;
    if (typeof scriptProjectId !== 'string' || scriptProjectId.length === 0) {
      return;
    }

    const projects = getStoredProjects();
    const target = projects.find(project => project.id === scriptProjectId);
    if (target) {
      loadProject(target);
    }
  }, { once: true });
}

function registerProjectButtons() {
  document.getElementById('create-new-tab')?.addEventListener('click', () => {
    void createNewProjectTab();
  });

  document.getElementById('open-tab-window')?.addEventListener('click', () => {
    openActiveProjectInNewWindow();
  });

  updateProjectControlStates();
}

// ---- 書式ルール管理 ----------------------------------------------------------
interface FormatRule {
  field: string; // 対象フィールド
  condition: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'exists'; // 条件
  value: string; // 比較値
  action: 'replace' | 'remove'; // アクション
  replacement: string; // 置換後の値
}

let formatRules: FormatRule[] = [];

function renderFormatRules() {
  const container = document.getElementById('format-rules-list');
  if (!container) return;

  container.innerHTML = '';

  if (formatRules.length === 0) {
    const empty = document.createElement('p');
    empty.style.fontSize = '12px';
    empty.style.color = '#94a3b8';
    empty.textContent = 'ルールが設定されていません';
    container.appendChild(empty);
    return;
  }

  formatRules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'format-rule-item';

    // Field row
    const fieldRow = document.createElement('div');
    fieldRow.className = 'format-rule-row';

    const fieldLabel = document.createElement('label');
    fieldLabel.textContent = 'フィールド:';

    const fieldInput = document.createElement('input');
    fieldInput.type = 'text';
    fieldInput.value = rule.field;
    fieldInput.style.flex = '1';
    fieldInput.addEventListener('input', () => {
      formatRules[index].field = fieldInput.value;
    });

    fieldRow.appendChild(fieldLabel);
    fieldRow.appendChild(fieldInput);

    // Condition row
    const conditionRow = document.createElement('div');
    conditionRow.className = 'format-rule-row';

    const conditionLabel = document.createElement('label');
    conditionLabel.textContent = '条件:';

    const conditionSelect = document.createElement('select');
    conditionSelect.style.flex = '1';
    [
      { value: 'exists', label: '存在する' },
      { value: 'contains', label: '含む' },
      { value: 'equals', label: '等しい' },
      { value: 'starts_with', label: '始まる' },
      { value: 'ends_with', label: '終わる' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      conditionSelect.appendChild(option);
    });
    conditionSelect.value = rule.condition;
    conditionSelect.addEventListener('change', () => {
      formatRules[index].condition = conditionSelect.value as FormatRule['condition'];
    });

    conditionRow.appendChild(conditionLabel);
    conditionRow.appendChild(conditionSelect);

    // Value row
    const valueRow = document.createElement('div');
    valueRow.className = 'format-rule-row';

    const valueLabel = document.createElement('label');
    valueLabel.textContent = '値:';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = rule.value;
    valueInput.style.flex = '1';
    valueInput.addEventListener('input', () => {
      formatRules[index].value = valueInput.value;
    });

    valueRow.appendChild(valueLabel);
    valueRow.appendChild(valueInput);

    // Action row
    const actionRow = document.createElement('div');
    actionRow.className = 'format-rule-row';

    const actionLabel = document.createElement('label');
    actionLabel.textContent = 'アクション:';

    const actionSelect = document.createElement('select');
    actionSelect.style.flex = '1';
    [
      { value: 'replace', label: '置換' },
      { value: 'remove', label: '削除' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      actionSelect.appendChild(option);
    });
    actionSelect.value = rule.action;
    actionSelect.addEventListener('change', () => {
      formatRules[index].action = actionSelect.value as FormatRule['action'];
    });

    const replacementInput = document.createElement('input');
    replacementInput.type = 'text';
    replacementInput.value = rule.replacement;
    replacementInput.style.flex = '1';
    replacementInput.addEventListener('input', () => {
      formatRules[index].replacement = replacementInput.value;
    });

    actionRow.appendChild(actionLabel);
    actionRow.appendChild(actionSelect);
    actionRow.appendChild(replacementInput);

    // Remove button row
    const removeRow = document.createElement('div');
    removeRow.className = 'format-rule-row';
    removeRow.style.justifyContent = 'flex-end';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'format-rule-remove';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', () => {
      formatRules.splice(index, 1);
      renderFormatRules();
    });

    removeRow.appendChild(removeBtn);

    item.appendChild(fieldRow);
    item.appendChild(conditionRow);
    item.appendChild(valueRow);
    item.appendChild(actionRow);
    item.appendChild(removeRow);

    container.appendChild(item);
  });
}

function registerFormatRulesUI() {
  const toggleBtn = document.getElementById('toggle-format-rules');
  const configPanel = document.getElementById('format-rules-config');
  const addBtn = document.getElementById('add-format-rule');

  toggleBtn?.addEventListener('click', () => {
    if (configPanel) {
      configPanel.hidden = !configPanel.hidden;
    }
  });

  addBtn?.addEventListener('click', () => {
    formatRules.push({
      field: 'ref',
      condition: 'exists',
      value: '',
      action: 'replace',
      replacement: ''
    });
    renderFormatRules();
  });

  renderFormatRules();
}

function registerPrimaryActions() {
  compareButton?.addEventListener('click', () => {
    void runCompare();
  });
 replaceButton?.addEventListener('click', () => {
    void runReplace();
  });
  inlineSaveButton?.addEventListener('click', () => {
    void saveProjectAs();
  });
  document.getElementById('apply-preprocess')?.addEventListener('click', () => {
    void applyPreprocessPipeline();
  });
  document.getElementById('apply-replace')?.addEventListener('click', () => {
    applyFindReplace();
  });
  document.getElementById('apply-edit')?.addEventListener('click', () => {
    void applyEditChanges();
  });

  // 前処理チェックボックスは特別なイベントリスナー不要（チェックボックスのstate自体で管理）
}

function applyFindReplace() {
  if (!editModalState) return;

  const findInput = document.getElementById('find-text') as HTMLInputElement | null;
  const replaceInput = document.getElementById('replace-text') as HTMLInputElement | null;

  if (!findInput || !replaceInput) return;

  const findText = findInput.value;
  const replaceText = replaceInput.value;

  if (!findText) {
    alert('検索する文字列を入力してください。');
    return;
  }

  let replacedCount = 0;

  // 全てのセルの値を置換
  editModalState.workingRows.forEach(row => {
    // ref
    if (row.ref.includes(findText)) {
      row.ref = row.ref.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
      replacedCount++;
    }
    // part_no
    if (row.part_no.includes(findText)) {
      row.part_no = row.part_no.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
      replacedCount++;
    }
    // attributes
    if (row.attributes) {
      Object.keys(row.attributes).forEach(key => {
        if (row.attributes![key].includes(findText)) {
          row.attributes![key] = row.attributes![key].replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
          replacedCount++;
        }
      });
    }
  });

  if (replacedCount > 0) {
    renderEditTable(editModalState);
    logActivity(`${replacedCount} 箇所で "${findText}" を "${replaceText}" に置換しました。`);
    alert(`${replacedCount} 箇所を置換しました。`);
  } else {
    alert('置換対象が見つかりませんでした。');
  }
}

// ---- 出力機能 ----------------------------------------------------------------

async function exportToCSV() {
  let data: BomRow[] = [];
  let filename = 'export';

  // データソースを優先順位順に選択
  if (mergedBom && mergedBom.length > 0) {
    data = mergedBom;
    filename = 'merged_bom';
  } else if (currentDiffs && currentDiffs.length > 0) {
    data = currentDiffs.map(diff => diff.b ?? diff.a).filter((row): row is BomRow => row !== null);
    filename = 'diff_result';
  } else if (datasetState.b.normalizedBom && datasetState.b.normalizedBom.length > 0) {
    data = datasetState.b.normalizedBom;
    filename = 'bom_b';
  } else if (datasetState.a.normalizedBom && datasetState.a.normalizedBom.length > 0) {
    data = datasetState.a.normalizedBom;
    filename = 'bom_a';
  }

  const filePath = await save({
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    defaultPath: `${filename}.csv`
  });

  if (!filePath) return;

  try {
    setProcessing(true, 'CSV出力中...');
    const csvLines: string[] = [];

    const columns = data.length > 0 ? buildColumns(data) : ['ref', 'part_no'];
    csvLines.push(columns.map(col => displayNameForColumn(col)).join(','));
    data.forEach(row => {
      const values = columns.map(col => {
        const value = getCellValue(row, col);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvLines.push(values.join(','));
    });

    await saveSessionToFile(filePath, csvLines.join('\n'));

    logActivity(`CSV出力完了: ${filename}.csv`);
    alert(`CSV出力が完了しました。\n${data.length}行のデータを出力しました。`);
  } catch (error: unknown) {
    console.error('CSV export failed', error);
    alert(`CSV出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

function getExportData(): BomRow[] {
  let data: BomRow[] = [];

  // データソースを優先順位順に選択
  if (mergedBom && mergedBom.length > 0) {
    data = mergedBom;
  } else if (currentDiffs && currentDiffs.length > 0) {
    data = currentDiffs.map(diff => diff.b ?? diff.a).filter((row): row is BomRow => row !== null);
  } else if (datasetState.b.normalizedBom && datasetState.b.normalizedBom.length > 0) {
    data = datasetState.b.normalizedBom;
  } else if (datasetState.a.normalizedBom && datasetState.a.normalizedBom.length > 0) {
    data = datasetState.a.normalizedBom;
  }

  return data;
}

// Part_NoでBomRowをグループ化（逆引き構造作成用）
function groupByPartNo(data: BomRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const row of data) {
    const partNo = row.part_no || '(未指定)';
    if (!grouped.has(partNo)) {
      grouped.set(partNo, []);
    }
    grouped.get(partNo)!.push(row.ref);
  }

  return grouped;
}

async function exportToECO() {
  const data = getExportData();

  const filePath = await save({
    filters: [{ name: 'PADS-ECO Netlist', extensions: ['eco'] }],
    defaultPath: 'netlist.eco'
  });

  if (!filePath) return;

  try {
    setProcessing(true, 'PADS-ECO出力中...');

    // PADS-ECO形式: *PADS-ECO* *PART* Ref Part_No *END*
    let content = '*PADS-ECO*\n*PART*\n';
    data.forEach(row => {
      content += `${row.ref} ${row.part_no}\n`;
    });
    content += '*END*\n';

    await saveSessionToFile(filePath, content);

    logActivity('PADS-ECO出力完了');
    alert(`PADS-ECO出力が完了しました。\n${data.length}個の部品を出力しました。`);
  } catch (error: unknown) {
    console.error('PADS-ECO export failed', error);
    alert(`PADS-ECO出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

async function exportToCCF() {
  const data = getExportData();

  const filePath = await save({
    filters: [{ name: 'CCF Netlist', extensions: ['ccf'] }],
    defaultPath: 'netlist.ccf'
  });

  if (!filePath) return;

  try {
    setProcessing(true, 'CCF出力中...');

    // CCF DEFINITION形式: $CCF{ DEFINITION{ Part_No:Ref1,Ref2; } NET{ } }
    const grouped = groupByPartNo(data);
    let content = '$CCF{\n     DEFINITION{\n';

    // Part_Noでソート
    const sortedPartNos = Array.from(grouped.keys()).sort();

    for (const partNo of sortedPartNos) {
      const refs = grouped.get(partNo)!;
      // 最初のRef
      content += `                ${partNo}:${refs[0]}`;

      // 残りのRefを改行インデント付きで追加
      for (let i = 1; i < refs.length; i++) {
        content += `,\n                         ${refs[i]}`;
      }
      content += ';\n';
    }

    content += '               }\n     NET{\n        }\n    }\n';

    await saveSessionToFile(filePath, content);

    logActivity('CCF出力完了');
    alert(`CCF出力が完了しました。\n${data.length}個の部品を出力しました。`);
  } catch (error: unknown) {
    console.error('CCF export failed', error);
    alert(`CCF出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

async function exportToMSF() {
  const data = getExportData();

  const filePath = await save({
    filters: [{ name: 'MSF Netlist', extensions: ['msf'] }],
    defaultPath: 'netlist.msf'
  });

  if (!filePath) return;

  try {
    setProcessing(true, 'MSF出力中...');

    // MSF SHAPE形式: $MSF { SHAPE { Part_No:Ref1,Ref2; } }
    const grouped = groupByPartNo(data);
    let content = '$MSF {\n     SHAPE {\n';

    // Part_Noでソート
    const sortedPartNos = Array.from(grouped.keys()).sort();

    for (const partNo of sortedPartNos) {
      const refs = grouped.get(partNo)!;
      // 最初のRef
      content += `                ${partNo}:${refs[0]}`;

      // 残りのRefを改行インデント付きで追加
      for (let i = 1; i < refs.length; i++) {
        content += `,\n                         ${refs[i]}`;
      }
      content += ';\n';
    }

    content += '           }\n     }\n';

    await saveSessionToFile(filePath, content);

    logActivity('MSF出力完了');
    alert(`MSF出力が完了しました。\n${data.length}個の部品を出力しました。`);
  } catch (error: unknown) {
    console.error('MSF export failed', error);
    alert(`MSF出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

// ---- 列設定ボタン登録 --------------------------------------------------------
function registerColumnSettingsButtons() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.column-default-preprocess');
  buttons.forEach(button => {
    const dataset = button.getAttribute('data-default-preprocess') as DatasetKey;
    if (!dataset) return;

    button.addEventListener('click', async () => {
      const state = datasetState[dataset];
      if (!state.parseResult || !state.normalizedBom) return;

      try {
        setProcessing(true, 'デフォルト前処理を適用中...');

        // 設定からデフォルト前処理の内容を取得
        const preprocess = normalizeDefaultPreprocessSettings(projectSettings.defaultPreprocess);

        // 設定に基づいて前処理を実行
        let processed = state.normalizedBom;
        if (preprocess.expandReference) {
          processed = await expandReference(processed);
        }
        if (preprocess.splitReferenceRows) {
          processed = await splitReferenceRows(processed);
        }
        if (preprocess.fillBlankCells) {
          processed = await fillBlankCells(processed);
        }
        if (preprocess.cleanseTextData) {
          processed = await cleanseTextData(processed);
        }
        if (preprocess.applyFormatRules) {
          processed = await applyFormatRules(processed, {
            use_strikethrough: false,
            use_cell_color: true
          });
        }

        state.normalizedBom = processed;
        state.parseResult.bom_data = processed;

        populateColumnSettings(dataset);
        updateDropzone(dataset);
        updatePreviewCard(dataset);

        logActivity(`BOM ${dataset.toUpperCase()}にデフォルト前処理を適用しました。`);
      } catch (error: unknown) {
        alert(`前処理の適用に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setProcessing(false);
      }
    });
  });
}

function registerExportButtons() {
  // CSV
  document.getElementById('export-csv')?.addEventListener('click', () => void exportToCSV());
  document.getElementById('export-csv-main')?.addEventListener('click', () => void exportToCSV());

  // ECO
  document.getElementById('export-eco')?.addEventListener('click', () => void exportToECO());
  document.getElementById('export-eco-main')?.addEventListener('click', () => void exportToECO());

  // CCF
  document.getElementById('export-ccf')?.addEventListener('click', () => void exportToCCF());
  document.getElementById('export-ccf-main')?.addEventListener('click', () => void exportToCCF());

  // MSF
  document.getElementById('export-msf')?.addEventListener('click', () => void exportToMSF());
  document.getElementById('export-msf-main')?.addEventListener('click', () => void exportToMSF());
}

function registerResultsViewButtons() {
  // フィルターボタン
  document.getElementById('filter-all')?.addEventListener('click', () => {
    setActiveFilter('all');
  });

  document.getElementById('filter-diff')?.addEventListener('click', () => {
    setActiveFilter('diff');
  });

  document.getElementById('filter-added')?.addEventListener('click', () => {
    setActiveFilter('added');
  });

  document.getElementById('filter-removed')?.addEventListener('click', () => {
    setActiveFilter('removed');
  });

  document.getElementById('filter-changed')?.addEventListener('click', () => {
    setActiveFilter('changed');
  });

  // 印刷ボタン
  document.getElementById('print-results')?.addEventListener('click', () => {
    // 印刷機能は src-tauri/capabilities/default.json に core:webview:allow-print を付与して利用
    window.print();
  });
}

// ---- ツールチップシステム ------------------------------------------------------
let tooltipElement: HTMLElement | null = null;
let tooltipTimeout: number | null = null;

function initTooltipSystem() {
  // ツールチップコンテナを作成
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'tooltip-container';
  tooltipElement.innerHTML = '<div class="tooltip-content"></div><div class="tooltip-arrow"></div>';
  document.body.appendChild(tooltipElement);

  // イベントデリゲーションを使用（mouseoverとmouseoutはバブリングする）
  document.body.addEventListener('mouseover', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      showTooltip(event);
    }
  });

  document.body.addEventListener('mouseout', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      hideTooltip();
    }
  });

  document.body.addEventListener('focus', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      showTooltip(event);
    }
  }, true);

  document.body.addEventListener('blur', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      hideTooltip();
    }
  }, true);
}

function showTooltip(event: Event) {
  if (!tooltipElement) return;

  const target = event.target as HTMLElement;
  if (!target.hasAttribute('data-tooltip')) return;

  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  // 既存のタイムアウトをクリア
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
  }

  const content = tooltipElement.querySelector('.tooltip-content') as HTMLElement;
  if (!content) return;

  content.textContent = text;

  // 少し遅延させて表示
  tooltipTimeout = window.setTimeout(() => {
    positionTooltip(target);
    tooltipElement!.classList.add('visible');
  }, 200);
}

function hideTooltip() {
  if (!tooltipElement) return;

  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }

  tooltipElement.classList.remove('visible');
}

function positionTooltip(target: HTMLElement) {
  if (!tooltipElement) return;

  const content = tooltipElement.querySelector('.tooltip-content') as HTMLElement;
  if (!content) return;

  const targetRect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spacing = 8;
  const margin = 8;

  // 利用可能なスペースを計算
  const spaceBelow = viewportHeight - targetRect.bottom - spacing - margin;
  const spaceAbove = targetRect.top - spacing - margin;
  const spaceRight = viewportWidth - targetRect.right - spacing - margin;
  const spaceLeft = targetRect.left - spacing - margin;

  // 優先順位: 下 → 上 → 右 → 左
  let position: 'bottom' | 'top' | 'right' | 'left' = 'bottom';
  let maxWidth = 320; // デフォルト最大幅

  // 最適な配置を決定
  if (spaceBelow >= 60) {
    position = 'bottom';
    maxWidth = Math.min(320, viewportWidth - 2 * margin);
  } else if (spaceAbove >= 60) {
    position = 'top';
    maxWidth = Math.min(320, viewportWidth - 2 * margin);
  } else if (spaceRight >= 100) {
    position = 'right';
    maxWidth = Math.min(280, spaceRight);
  } else if (spaceLeft >= 100) {
    position = 'left';
    maxWidth = Math.min(280, spaceLeft);
  } else {
    // スペースが足りない場合は最大のスペースを使う
    const maxSpace = Math.max(spaceBelow, spaceAbove, spaceRight, spaceLeft);
    if (maxSpace === spaceBelow) position = 'bottom';
    else if (maxSpace === spaceAbove) position = 'top';
    else if (maxSpace === spaceRight) position = 'right';
    else position = 'left';
    maxWidth = Math.min(320, maxSpace - margin);
  }

  // ツールチップの幅を設定
  content.style.maxWidth = `${maxWidth}px`;

  // 一度描画してサイズを取得
  content.style.visibility = 'hidden';
  tooltipElement.classList.add('visible');
  const tooltipRect = content.getBoundingClientRect();
  tooltipElement.classList.remove('visible');
  content.style.visibility = 'visible';

  let left = 0;
  let top = 0;

  // 位置を計算
  switch (position) {
    case 'bottom':
      top = targetRect.bottom + spacing;
      left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
      break;
    case 'top':
      top = targetRect.top - spacing - tooltipRect.height;
      left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
      break;
    case 'right':
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
      left = targetRect.right + spacing;
      break;
    case 'left':
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
      left = targetRect.left - spacing - tooltipRect.width;
      break;
  }

  // 左右の微調整
  if (left < margin) {
    left = margin;
  } else if (left + tooltipRect.width > viewportWidth - margin) {
    left = viewportWidth - tooltipRect.width - margin;
  }

  // 上下の微調整
  if (top < margin) {
    top = margin;
  } else if (top + tooltipRect.height > viewportHeight - margin) {
    top = viewportHeight - tooltipRect.height - margin;
  }

  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${top}px`;

  // 位置クラスを更新
  tooltipElement.className = `tooltip-container position-${position}`;

  // 次のフレームでvisibleクラスを追加
  requestAnimationFrame(() => {
    tooltipElement!.classList.add('visible');
  });
}

// ---- 動的レイアウト調整システム ------------------------------------------------
function adjustDynamicLayouts() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 1. 編集モーダルの高さを viewport に合わせる
  const editModal = document.getElementById('edit-modal');
  if (editModal) {
    const maxHeight = viewportHeight * 0.9;
    editModal.style.maxHeight = `${maxHeight}px`;
  }

  // 2. 編集テーブルラッパーの高さを調整
  const editTableWrapper = document.querySelector('.editable-table-wrapper') as HTMLElement;
  if (editTableWrapper) {
    const availableHeight = viewportHeight * 0.5;
    editTableWrapper.style.maxHeight = `${Math.max(300, availableHeight)}px`;
  }

  // 3. 結果テーブルの高さを調整
  const resultsTable = document.querySelector('.results-table-wrapper') as HTMLElement;
  if (resultsTable) {
    const availableHeight = viewportHeight * 0.4;
    resultsTable.style.maxHeight = `${Math.max(360, availableHeight)}px`;
  }

  // 4. プロジェクトパネルとログパネルの高さを調整
  const projectScroll = document.querySelector('.project-tab-scroll') as HTMLElement;
  const activityLog = document.querySelector('.activity-log') as HTMLElement;

  if (projectScroll || activityLog) {
    // supplementary-panelまでの使用済み高さを計算
    const header = document.querySelector('.shell-header');
    const controlPanel = document.querySelector('.control-panel-vertical');
    const resultsPanel = document.querySelector('.results-panel');

    let usedHeight = 100; // padding等
    if (header) usedHeight += header.getBoundingClientRect().height;
    if (controlPanel) usedHeight += controlPanel.getBoundingClientRect().height;
    if (resultsPanel && !resultsPanel.hasAttribute('hidden')) {
      usedHeight += resultsPanel.getBoundingClientRect().height;
    }

    const availableHeight = Math.max(250, viewportHeight - usedHeight - 100);

    if (projectScroll) {
      projectScroll.style.maxHeight = `${availableHeight}px`;
    }
    if (activityLog) {
      activityLog.style.maxHeight = `${availableHeight}px`;
    }
  }

  // 5. モバイルでのテーブル幅調整
  if (viewportWidth < 768) {
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const tableEl = table as HTMLElement;
      tableEl.style.minWidth = 'auto';
    });
  }
}

// デバウンス付きリサイズハンドラー
let layoutResizeTimeout: number | null = null;
function handleResize() {
  if (layoutResizeTimeout) {
    clearTimeout(layoutResizeTimeout);
  }
  layoutResizeTimeout = window.setTimeout(() => {
    adjustDynamicLayouts();
  }, 150);
}

function initDynamicLayoutSystem() {
  // 初回実行
  adjustDynamicLayouts();

  // リサイズイベント
  window.addEventListener('resize', handleResize);

  // DOM変更を監視して必要に応じて再調整
  const observer = new MutationObserver((mutations) => {
    let needsAdjustment = false;

    for (const mutation of mutations) {
      // hidden属性の変更を検出
      if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
        needsAdjustment = true;
        break;
      }
      // 大きな要素の追加/削除を検出
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('results-panel') ||
                el.classList.contains('modal') ||
                el.tagName === 'TABLE') {
              needsAdjustment = true;
              break;
            }
          }
        }
      }
    }

    if (needsAdjustment) {
      if (layoutResizeTimeout) clearTimeout(layoutResizeTimeout);
      layoutResizeTimeout = window.setTimeout(adjustDynamicLayouts, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });
}

// ---- 初期化 ------------------------------------------------------------------
function init() {
  initTooltipSystem(); // ツールチップシステムを初期化
  initDynamicLayoutSystem(); // 動的レイアウトシステムを初期化
  loadAndApplyThemeSettings(); // テーマを起動時に読み込み
  applyProjectSettingsToForm(projectSettings);
  startAutoSaveTimer();
  registerDropzoneEvents();
  registerNativeDropBridge();
  registerFilePickerButtons();
  registerEditButtons();
  registerEditDatasetToggle();
  registerModalCloseButtons();
  registerDictionaryTabs();
  registerSettingsButtons();
  registerProjectButtons();
  registerPrimaryActions();
  registerColumnSettingsButtons();
  registerFormatRulesUI();
  registerExportButtons();
  registerResultsViewButtons();
  registerInitialProjectListener();
  initializeProjects();

  // 辞書データを読み込み
  loadDictionaryRegistrationData();
  loadDictionaryExceptionData();

  // タブ表示を初期化
  updateCurrentTabDisplay();

  updateActionAvailability();
  syncPreviewEmptyState();
}

init();
