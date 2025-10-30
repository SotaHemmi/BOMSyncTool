/**
 * ファイル選択UI
 *
 * ファイル選択ボタンのイベントハンドラ
 */

import { open } from '@tauri-apps/plugin-dialog';
import type { DatasetKey } from '../types';

export function registerFilePickerButtons(onFileSelected: (dataset: DatasetKey, path: string, fileName: string) => void) {
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
      onFileSelected(dataset, file, file.split(/[\\/]/).pop() ?? '選択ファイル');
    });
  });
}

export function registerEditButtons(onEditClicked: (dataset: DatasetKey) => void) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-open-edit]')
  );
  buttons.forEach(button => {
    const dataset = button.dataset.openEdit as DatasetKey | undefined;
    if (!dataset) return;
    button.addEventListener('click', () => {
      onEditClicked(dataset);
    });
  });
}

export function registerEditDatasetToggle(onEditClicked: (dataset: DatasetKey) => void) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-edit-dataset]')
  );
  buttons.forEach(button => {
    const dataset = button.dataset.editDataset as DatasetKey | undefined;
    if (!dataset) return;
    button.addEventListener('click', () => {
      onEditClicked(dataset);
    });
  });
}
