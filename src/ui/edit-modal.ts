
/**
 * 編集モーダルUI
 */

import type { DatasetKey } from '../types';
import { datasetState, editModalState, setEditModalState } from '../state/app-state';
import { openEditModalForDataset, renderEditTable as renderEditTableInternal } from './column-editor';
import { updateDropzone as refreshDropzonePreview, updatePreviewCard, syncPreviewEmptyState } from './dataset-view';

function cloneRows(rows: string[][]): string[][] {
  return rows.map(row => [...row]);
}

export function openEditModal(dataset: DatasetKey): void {
  openEditModalForDataset(dataset);
}

export const renderEditTable = renderEditTableInternal;

export function saveEdit(): void {
  if (!editModalState) return;

  const dataset = editModalState.dataset;
  const parseResult = datasetState[dataset].parseResult;
  if (!parseResult) return;

  parseResult.rows = cloneRows(editModalState.workingRows);
  datasetState[dataset].lastUpdated = new Date().toISOString();

  const editModal = document.getElementById('edit-modal') as HTMLDialogElement | null;
  if (editModal?.open) {
    editModal.close();
  }

  setEditModalState(null);

  refreshDropzonePreview(dataset);
  updatePreviewCard(dataset);
  syncPreviewEmptyState();
  alert('編集内容を保存しました。');
}

export function cancelEdit(): void {
  const editModal = document.getElementById('edit-modal') as HTMLDialogElement | null;
  if (editModal?.open) {
    editModal.close();
  }

  setEditModalState(null);
}
