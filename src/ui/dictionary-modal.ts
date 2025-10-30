/**
 * 辞書管理モーダルUI
 *
 * IPC登録名と例外マスタの管理（簡略版）
 */

import type { DictionaryTab, RegistrationEntry, ExceptionEntry } from '../types';
import { dictionaryState } from '../state/app-state';
import {
  loadRegistrationData,
  saveRegistrationData,
  loadExceptionData,
  saveExceptionData
} from '../utils';

/**
 * 辞書モーダルを開く
 */
export function openDictionaryModal(): void {
  const modal = document.getElementById('dictionary-modal') as HTMLDialogElement | null;
  if (!modal) return;

  loadDictionaryData();
  renderDictionaryContent();
  modal.showModal();
}

/**
 * 辞書データを読み込み
 */
export function loadDictionaryData(): void {
  const registrations = loadRegistrationData();
  const exceptions = loadExceptionData();

  dictionaryState.registrations = registrations;
  dictionaryState.exceptions = exceptions;
}

/**
 * 辞書内容をレンダリング
 */
export function renderDictionaryContent(): void {
  const editor = document.getElementById('dictionary-editor') as HTMLTextAreaElement | null;
  if (!editor) return;

  if (dictionaryState.currentTab === 'registration') {
    const json = JSON.stringify(dictionaryState.registrations, null, 2);
    editor.value = json;
  } else {
    const json = JSON.stringify(dictionaryState.exceptions, null, 2);
    editor.value = json;
  }
}

/**
 * 辞書タブを切り替え
 *
 * @param tab - タブ名
 */
export function switchDictionaryTab(tab: DictionaryTab): void {
  dictionaryState.currentTab = tab;

  // タブボタンの状態を更新
  const buttons = document.querySelectorAll('[data-dictionary-tab]');
  buttons.forEach(btn => {
    const isActive = (btn as HTMLElement).dataset.dictionaryTab === tab;
    btn.classList.toggle('is-active', isActive);
  });

  renderDictionaryContent();
}

/**
 * 辞書を保存
 */
export async function saveDictionaryData(): Promise<void> {
  const editor = document.getElementById('dictionary-editor') as HTMLTextAreaElement | null;
  if (!editor) return;

  try {
    const json = editor.value;
    const data = JSON.parse(json);

    if (dictionaryState.currentTab === 'registration') {
      dictionaryState.registrations = data as RegistrationEntry[];
      saveRegistrationData(dictionaryState.registrations);
      alert('IPC登録名マスタを保存しました。');
    } else {
      dictionaryState.exceptions = data as ExceptionEntry[];
      saveExceptionData(dictionaryState.exceptions);
      alert('例外マスタを保存しました。');
    }
  } catch (error) {
    alert(`JSONのパースに失敗しました: ${error}`);
  }
}

/**
 * 辞書モーダルを閉じる
 */
export function closeDictionaryModal(): void {
  const modal = document.getElementById('dictionary-modal') as HTMLDialogElement | null;
  if (modal) {
    modal.close();
  }
}
