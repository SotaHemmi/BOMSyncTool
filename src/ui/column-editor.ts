
/**
 * 列エディタ
 *
 * 列の役割設定と編集機能（ParseResultベース）
 */

import type {
  ParseResult,
  DatasetKey,
  ColumnRole,
  ColumnMeta,
  ParseError,
  EditModalState
} from '../types';
import { datasetState, editModalState, setEditModalState } from '../state/app-state';
import { getColumnIndices, setCellValue } from '../utils/bom';
import { guessRoleFromColumnName, datasetLabel } from '../utils';
import {
  updateDropzone as refreshDropzonePreview,
  updatePreviewCard,
  syncPreviewEmptyState
} from './dataset-view';

const MULTIPLE_SELECTION_VALUE = '__MULTIPLE__';
const MAX_EDIT_ROWS = 200;

function cloneRows(rows: string[][]): string[][] {
  return rows.map(row => [...row]);
}

function isColumnRole(role: string): role is ColumnRole {
  return ['ref', 'part_no', 'manufacturer', 'ignore'].includes(role);
}

function buildErrorMap(errors: ParseError[] | undefined): Map<string, ParseError> {
  const map = new Map<string, ParseError>();
  if (!errors) return map;
  errors.forEach(error => {
    if (typeof error.row === 'number' && typeof error.column === 'number') {
      map.set(`${error.row},${error.column}`, error);
    }
  });
  return map;
}

function ensureColumns(parseResult: ParseResult): ColumnMeta[] {
  if (parseResult.columns && parseResult.columns.length > 0) {
    return parseResult.columns;
  }

  if (parseResult.column_order && parseResult.column_order.length > 0) {
    const headers = parseResult.headers ?? [];
    const generated = parseResult.column_order.map((id, index) => ({
      id,
      name: headers[index] ?? id
    }));
    parseResult.columns = generated;
    return generated;
  }

  const fallback = (parseResult.headers ?? []).map((name, index) => ({
    id: `col-${index}`,
    name
  }));
  parseResult.columns = fallback;
  parseResult.column_order = fallback.map(col => col.id);
  return fallback;
}

function buildColumnRoles(columns: ColumnMeta[], assignments: Record<string, ColumnRole>): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};
  for (const [columnId, role] of Object.entries(assignments)) {
    if (!isColumnRole(role)) continue;
    if (!columns.some(column => column.id === columnId)) continue;
    if (!mapping[role]) {
      mapping[role] = [];
    }
    if (!mapping[role].includes(columnId)) {
      mapping[role].push(columnId);
    }
  }
  return mapping;
}

function resetSelectState(select: HTMLSelectElement): void {
  select.classList.remove('column-select--multiple');
  select.removeAttribute('data-multiple-columns');
  select.removeAttribute('title');
}

async function applyColumnRoles(dataset: DatasetKey, updatedRoles: Record<string, ColumnRole>): Promise<void> {
  const previousRoles = { ...datasetState[dataset].columnRoles };
  datasetState[dataset].columnRoles = updatedRoles;

  try {
    await recomputeNormalizedDataForDataset(dataset);
    populateColumnSettings(dataset);
    refreshDropzonePreview(dataset);
    updatePreviewCard(dataset);
    syncPreviewEmptyState();

    if (editModalState && editModalState.dataset === dataset) {
      editModalState.headerRoles = { ...datasetState[dataset].columnRoles };
      renderHeaderRoleControls(editModalState);
      renderEditTable(editModalState);
      const parseResult = datasetState[dataset].parseResult;
      if (parseResult) {
        renderEditWarnings(parseResult);
      }
    }
  } catch (error) {
    datasetState[dataset].columnRoles = previousRoles;
    populateColumnSettings(dataset);
    if (editModalState && editModalState.dataset === dataset) {
      editModalState.headerRoles = { ...previousRoles };
      renderHeaderRoleControls(editModalState);
      renderEditTable(editModalState);
    }
    throw error;
  }
}

export function getValueForColumnRole(parseResult: ParseResult, rowIndex: number, role: ColumnRole): string {
  const indices = getColumnIndices(parseResult, role);
  if (indices.length === 0) return '';
  const row = parseResult.rows[rowIndex];
  if (!row) return '';
  return row[indices[0]] ?? '';
}

export function setValueForColumnRole(parseResult: ParseResult, rowIndex: number, role: ColumnRole, value: string): void {
  const indices = getColumnIndices(parseResult, role);
  if (indices.length === 0) return;
  indices.forEach(index => {
    setCellValue(parseResult, rowIndex, index, value.trim());
  });
}

export function resolveColumnsFromParseResult(result: ParseResult): ColumnMeta[] {
  return ensureColumns(result);
}

export function deriveInitialColumnRoles(result: ParseResult): Record<string, ColumnRole> {
  const columns = resolveColumnsFromParseResult(result);
  const assignments: Record<string, ColumnRole> = {};
  const availableIds = new Set(columns.map(column => column.id));

  Object.entries(result.column_roles ?? {}).forEach(([role, columnIds]) => {
    if (!isColumnRole(role)) return;
    if (!Array.isArray(columnIds)) return;
    columnIds.forEach(columnId => {
      if (availableIds.has(columnId)) {
        assignments[columnId] = role;
      }
    });
  });

  Object.entries(result.guessed_roles ?? {}).forEach(([columnId, role]) => {
    if (!isColumnRole(role)) return;
    if (!availableIds.has(columnId)) return;
    if (!assignments[columnId]) {
      assignments[columnId] = role;
    }
  });

  Object.entries(result.guessed_columns ?? {}).forEach(([role, index]) => {
    if (!isColumnRole(role)) return;
    const column = columns[index as number];
    if (column && !assignments[column.id]) {
      assignments[column.id] = role;
    }
  });

  columns.forEach(column => {
    if (!assignments[column.id]) {
      assignments[column.id] = guessRoleFromColumnName(column.name);
    }
  });

  return assignments;
}

export async function recomputeNormalizedDataForDataset(dataset: DatasetKey): Promise<void> {
  const state = datasetState[dataset];
  const parseResult = state.parseResult;
  if (!parseResult) {
    throw new Error('BOMデータが読み込まれていません。');
  }

  const columns = resolveColumnsFromParseResult(parseResult);
  parseResult.column_order = columns.map(column => column.id);
  parseResult.column_roles = buildColumnRoles(columns, state.columnRoles);

  const guessedRoles: Record<string, string> = {};
  const guessedColumns: Record<string, number> = {};
  columns.forEach((column, index) => {
    const role = state.columnRoles[column.id];
    if (role) {
      guessedRoles[column.id] = role;
      if (guessedColumns[role] === undefined) {
        guessedColumns[role] = index;
      }
    }
  });

  parseResult.guessed_roles = guessedRoles;
  parseResult.guessed_columns = guessedColumns;
  state.lastUpdated = new Date().toISOString();
}

export function populateColumnSettings(dataset: DatasetKey): void {
  const panel = document.querySelector<HTMLElement>(`[data-column-settings="${dataset}"]`);
  const selects = panel?.querySelectorAll<HTMLSelectElement>('.column-select') ?? [];
  const state = datasetState[dataset];
  const parseResult = state.parseResult;

  if (!panel || selects.length === 0) {
    return;
  }

  if (!parseResult) {
    selects.forEach(select => {
      select.innerHTML = '<option value="">--</option>';
      select.disabled = true;
      resetSelectState(select);
    });
    return;
  }

  const columns = resolveColumnsFromParseResult(parseResult);
  const currentRoles = state.columnRoles;

  selects.forEach(select => {
    const roleAttr = select.dataset.columnRole;
    if (!roleAttr || !isColumnRole(roleAttr)) {
      select.disabled = true;
      resetSelectState(select);
      return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">--</option>';
    resetSelectState(select);

    columns.forEach(column => {
      const option = document.createElement('option');
      option.value = column.id;
      option.textContent = column.name;
      select.appendChild(option);
    });

    const assignedColumns = Object.entries(currentRoles)
      .filter(([, assignedRole]) => assignedRole === roleAttr)
      .map(([columnId]) => columnId);

    let selectedValue = '';

    if (assignedColumns.length > 1) {
      const multiOption = document.createElement('option');
      multiOption.value = MULTIPLE_SELECTION_VALUE;
      multiOption.textContent = '複数列';
      select.insertBefore(multiOption, select.options[1] ?? null);
      select.dataset.multipleColumns = assignedColumns.join(',');
      select.classList.add('column-select--multiple');
      select.title = assignedColumns
        .map(columnId => columns.find(column => column.id === columnId)?.name ?? columnId)
        .join(', ');
      selectedValue = MULTIPLE_SELECTION_VALUE;
    } else if (assignedColumns.length === 1) {
      selectedValue = assignedColumns[0];
    } else {
      const guessedIds = parseResult.column_roles?.[roleAttr] ?? [];
      const guessedId = guessedIds.find(id => columns.some(column => column.id === id));
      if (guessedId) {
        selectedValue = guessedId;
      } else if (parseResult.guessed_columns && parseResult.guessed_columns[roleAttr] !== undefined) {
        const guessedIndex = parseResult.guessed_columns[roleAttr];
        const column = columns[guessedIndex];
        if (column) {
          selectedValue = column.id;
        }
      }
    }

    select.value = selectedValue;
    select.onchange = event => {
      void handleColumnRoleChange(event);
    };
  });
}

export function setEditDatasetToggle(dataset: DatasetKey): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-edit-dataset]');
  buttons.forEach(button => {
    const targetDataset = button.dataset.editDataset as DatasetKey | undefined;
    button.classList.toggle('is-active', targetDataset === dataset);
  });
}

export async function handleColumnRoleChange(event: Event): Promise<void> {
  const select = event.currentTarget as HTMLSelectElement | null;
  if (!select) return;

  const datasetAttr = select.dataset.dataset as DatasetKey | undefined;
  const roleAttr = select.dataset.columnRole as ColumnRole | undefined;
  if (!datasetAttr || !roleAttr || !isColumnRole(roleAttr)) {
    return;
  }

  const selectedColumnId = select.value;
  if (selectedColumnId === MULTIPLE_SELECTION_VALUE) {
    select.value = MULTIPLE_SELECTION_VALUE;
    return;
  }

  const currentRoles = { ...datasetState[datasetAttr].columnRoles };

  for (const [columnId, assignedRole] of Object.entries(currentRoles)) {
    if (assignedRole === roleAttr) {
      delete currentRoles[columnId];
    }
  }

  if (selectedColumnId) {
    delete currentRoles[selectedColumnId];
    currentRoles[selectedColumnId] = roleAttr;
  }

  try {
    await applyColumnRoles(datasetAttr, currentRoles);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert(`列の役割を更新できませんでした: ${message}`);
    populateColumnSettings(datasetAttr);
  }
}

export function renderHeaderRoleControls(state: EditModalState | null = editModalState): void {
  if (!state) return;

  const container = document.getElementById('header-role-controls');
  if (!container) return;
  container.innerHTML = '';

  const roleOptions: Array<{ value: ColumnRole; label: string }> = [
    { value: 'ref', label: 'Ref (部品番号)' },
    { value: 'part_no', label: 'Part No (部品型番)' },
    { value: 'manufacturer', label: 'Manufacturer (メーカー)' },
    { value: 'ignore', label: 'Ignore (指定しない)' }
  ];

  state.columns.forEach((column, index) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'header-role';

    const name = document.createElement('span');
    name.textContent = `${index + 1}. ${column.name}`;
    wrapper.appendChild(name);

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
      const nextRole = select.value as ColumnRole;
      const updatedRoles = { ...state.headerRoles };
      if (nextRole === 'ignore') {
        delete updatedRoles[column.id];
      } else {
        updatedRoles[column.id] = nextRole;
      }

      try {
        await applyColumnRoles(state.dataset, updatedRoles);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`列の役割変更に失敗しました: ${message}`);
        select.value = state.headerRoles[column.id] ?? 'ignore';
      }
    });

    wrapper.appendChild(select);
    container.appendChild(wrapper);
  });
}

export function renderEditTable(state: EditModalState | null = editModalState): void {
  if (!state) return;

  const head = document.getElementById('edit-table-head');
  const body = document.getElementById('edit-table-body');
  if (!head || !body) return;

  head.innerHTML = '';
  body.innerHTML = '';

  const parseResult = datasetState[state.dataset].parseResult;
  const errorMap = buildErrorMap(parseResult?.structured_errors);

  const headerRow = document.createElement('tr');
  state.columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.name;
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);

  state.workingRows.slice(0, MAX_EDIT_ROWS).forEach((row, rowIndex) => {
    const tr = document.createElement('tr');

    state.columns.forEach((_, columnIndex) => {
      const td = document.createElement('td');
      td.contentEditable = 'true';
      td.dataset.rowIndex = String(rowIndex);
      td.dataset.columnIndex = String(columnIndex);
      td.textContent = row[columnIndex] ?? '';

      const error = errorMap.get(`${rowIndex},${columnIndex}`);
      if (error) {
        td.classList.add(error.severity === 'error' ? 'cell-error' : 'cell-warning');
        td.title = error.message;
      }

      td.addEventListener('blur', event => {
        const target = event.currentTarget as HTMLTableCellElement;
        const rIdx = Number(target.dataset.rowIndex ?? '0');
        const cIdx = Number(target.dataset.columnIndex ?? '0');
        const newValue = target.textContent ?? '';
        if (!state.workingRows[rIdx]) return;
        state.workingRows[rIdx][cIdx] = newValue;
      });

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });

  if (state.workingRows.length > MAX_EDIT_ROWS) {
    const noticeRow = document.createElement('tr');
    const noticeCell = document.createElement('td');
    noticeCell.colSpan = state.columns.length;
    noticeCell.textContent = `表示は先頭 ${MAX_EDIT_ROWS} 行までです。`;
    noticeCell.classList.add('edit-table-notice');
    noticeRow.appendChild(noticeCell);
    body.appendChild(noticeRow);
  }
}

export function openEditModalForDataset(dataset: DatasetKey): void {
  const state = datasetState[dataset];
  const parseResult = state.parseResult;
  const editModal = document.getElementById('edit-modal') as HTMLDialogElement | null;

  if (!editModal || !parseResult) {
    alert(`${datasetLabel(dataset)} のデータが読み込まれていません。`);
    return;
  }

  if (parseResult.rows.length === 0) {
    alert('表示できるデータがありません。');
    return;
  }

  const columns = resolveColumnsFromParseResult(parseResult);

  const existingRoles = { ...state.columnRoles };
  const headerRoles =
    Object.keys(existingRoles).length > 0 ? existingRoles : deriveInitialColumnRoles(parseResult);

  const modalState: EditModalState = {
    dataset,
    columns,
    workingRows: cloneRows(parseResult.rows),
    headerRoles
  };

  setEditModalState(modalState);

  const subtitle = document.getElementById('edit-modal-subtitle');
  if (subtitle) {
    subtitle.textContent = [
      `${datasetLabel(dataset)} / 行数 ${parseResult.rows.length.toLocaleString()}`,
      state.fileName ? `ファイル ${state.fileName}` : null
    ]
      .filter(Boolean)
      .join(' / ');
  }

  setEditDatasetToggle(dataset);
  renderHeaderRoleControls(modalState);
  renderEditTable(modalState);
  renderEditWarnings(parseResult);
  populateColumnSettings(dataset);

  if (!editModal.open) {
    editModal.showModal();
  }
}

export function highlightCell(rowIndex: number, columnIndex: number, context: 'edit' | 'preview'): void {
  let targetCell: HTMLElement | null = null;

  if (context === 'edit') {
    const editTable = document.getElementById('edit-table');
    const rows = editTable?.querySelectorAll('tbody tr');
    const row = rows?.[rowIndex];
    if (row) {
      const cells = row.querySelectorAll('td');
      targetCell = cells[columnIndex] as HTMLElement | undefined ?? null;
    }
  } else {
    const dataset = editModalState?.dataset ?? 'a';
    const previewRow = document
      .querySelector(`[data-preview-table="${dataset}"] table tbody`)
      ?.querySelectorAll('tr')[rowIndex];
    targetCell = previewRow?.querySelectorAll('td')[columnIndex] ?? null;
  }

  if (!targetCell) return;

  document.querySelectorAll('.cell-highlight').forEach(element => {
    element.classList.remove('cell-highlight');
  });

  targetCell.classList.add('cell-highlight');
  targetCell.scrollIntoView({ behavior: 'smooth', block: 'center' });

  window.setTimeout(() => {
    targetCell?.classList.remove('cell-highlight');
  }, 2000);
}

export function renderEditWarnings(parseResult: ParseResult): void {
  const warningsPanel = document.getElementById('edit-warnings');
  const warningsList = document.getElementById('edit-warnings-list');

  if (!warningsPanel || !warningsList) return;

  const errors = parseResult.structured_errors ?? [];
  if (errors.length === 0) {
    warningsPanel.hidden = true;
    warningsList.innerHTML = '';
    return;
  }

  warningsPanel.hidden = false;
  warningsList.innerHTML = '';

  errors.forEach(error => {
    const li = document.createElement('li');
    li.className = error.severity;
    li.textContent = error.message;

    if (typeof error.row === 'number' && typeof error.column === 'number') {
      li.style.cursor = 'pointer';
      li.title = 'クリックして該当セルへ移動';
      li.addEventListener('click', () => {
        highlightCell(error.row!, error.column!, 'edit');
      });
    }

    warningsList.appendChild(li);
  });
}
