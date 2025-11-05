
/**
 * 編集モーダルUI
 */

import type { DatasetKey } from '../types';
import { datasetState, editModalState, setEditModalState } from '../state/app-state';
import { openEditModalForDataset, renderEditTable as renderEditTableInternal } from './column-editor';
import { updateDropzone as refreshDropzonePreview, updatePreviewCard, syncPreviewEmptyState } from './dataset-view';
import { autoSaveActiveProject } from '../core/project-manager';
import { cloneRows } from '../utils/data-utils';

export function openEditModal(dataset: DatasetKey): void {
  openEditModalForDataset(dataset);
}

export const renderEditTable = renderEditTableInternal;

export async function saveEdit(): Promise<void> {
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

  // 自動保存を実行してプロジェクトに変更を保存
  await autoSaveActiveProject();

  alert('編集内容を保存しました。');
}

export function cancelEdit(): void {
  const editModal = document.getElementById('edit-modal') as HTMLDialogElement | null;
  if (editModal?.open) {
    editModal.close();
  }

  setEditModalState(null);
}
