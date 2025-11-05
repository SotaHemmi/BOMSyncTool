/**
 * BOMSyncTool - メインエントリポイント
 *
 * 完全にモジュール化されたアーキテクチャ（BomRow完全削除済み）
 */

import './styles.css';
import { logger } from './utils/logger';

// UIモジュール
import { initTooltipSystem } from './ui/tooltip';
import { initDynamicLayoutSystem } from './ui/layout';
import { registerDropzoneEvents, registerNativeDropBridge } from './ui/dropzone';
import { registerFilePickerButtons, registerEditButtons, registerEditDatasetToggle } from './ui/file-picker';
import { registerModalCloseButtons } from './ui/modal';
import { openEditModal } from './ui/edit-modal';
import { runCompare, runReplace } from './ui/compare-actions';

// コア機能
import {
  initializeProjects,
  updateCurrentTabDisplay,
  updateProjectControlStates,
  startAutoSaveTimer,
  registerInitialProjectListener,
  registerProjectButtons,
  registerProjectMergeListener,
  renderHeaderTabs,
  createNewProjectTab
} from './core/project-manager';
import {
  registerDictionaryTabs,
  addRegistrationRow,
  addExceptionRow,
  extractFromBOM,
  importRegistrationCSV,
  exportRegistrationCSV,
  importExceptionCSV,
  exportExceptionCSV,
  applyRegistrationToBOM
} from './core/dictionary-manager';
import {
  registerSettingsButtons,
  loadAndApplyThemeSettings
} from './core/settings-manager';
import { updateAllDatasetCards, syncPreviewEmptyState } from './ui/dataset-view';

// 型
import type { DatasetKey } from './types';

/**
 * ファイル選択時のコールバック
 */
function onFileSelected(dataset: DatasetKey, path: string, fileName: string) {
  logger.log('File selected:', dataset, path, fileName);
  // dropzone.ts内のloadBomFileが呼ばれる
}

/**
 * 編集ボタンクリック時のコールバック
 */
function onEditClicked(dataset: DatasetKey) {
  openEditModal(dataset);
}

/**
 * 比較ボタンのイベントハンドラ登録
 */
function registerCompareButtons() {
  const compareBtn = document.getElementById('run-compare');
  const replaceBtn = document.getElementById('run-replace');

  compareBtn?.addEventListener('click', () => {
    void runCompare();
  });

  replaceBtn?.addEventListener('click', () => {
    void runReplace();
  });
}

/**
 * 辞書ボタンのイベントハンドラ登録
 */
function registerDictionaryButtons() {
  const addRegBtn = document.getElementById('add-registration-row');
  const addExcBtn = document.getElementById('add-exception-row');
  const extractBtn = document.getElementById('extract-from-bom');
  const importRegBtn = document.getElementById('import-registration-csv');
  const exportRegBtn = document.getElementById('export-registration-csv');
  const importExcBtn = document.getElementById('import-exception-csv');
  const exportExcBtn = document.getElementById('export-exception-csv');
  const applyBtn = document.getElementById('apply-registration-to-bom');

  addRegBtn?.addEventListener('click', () => addRegistrationRow());
  addExcBtn?.addEventListener('click', () => addExceptionRow());
  extractBtn?.addEventListener('click', () => extractFromBOM());
  importRegBtn?.addEventListener('click', () => void importRegistrationCSV());
  exportRegBtn?.addEventListener('click', () => void exportRegistrationCSV());
  importExcBtn?.addEventListener('click', () => void importExceptionCSV());
  exportExcBtn?.addEventListener('click', () => void exportExceptionCSV());
  applyBtn?.addEventListener('click', () => {
    applyRegistrationToBOM();
    updateAllDatasetCards();
  });
}

/**
 * プロジェクト読み込みイベントをリッスン
 */
function registerProjectLoadedListener() {
  window.addEventListener('project-loaded', () => {
    // プロジェクトが読み込まれたらUIを更新
    updateAllDatasetCards();
    syncPreviewEmptyState();
  });
}

/**
 * 初期化関数
 */
function init() {
  logger.log('BOMSyncTool initializing...');

  // システム初期化
  initTooltipSystem();
  initDynamicLayoutSystem();

  // テーマ読み込み
  loadAndApplyThemeSettings();

  // プロジェクト初期化
  registerInitialProjectListener();
  registerProjectLoadedListener();
  registerProjectMergeListener();
  initializeProjects();
  startAutoSaveTimer();

  // イベントハンドラ登録
  registerDropzoneEvents();
  registerNativeDropBridge();
  registerFilePickerButtons(onFileSelected);
  registerEditButtons(onEditClicked);
  registerEditDatasetToggle(onEditClicked);
  registerModalCloseButtons();
  registerCompareButtons();
  registerProjectButtons();
  registerDictionaryTabs();
  registerDictionaryButtons();
  registerSettingsButtons();

  // 初期UI状態
  syncPreviewEmptyState();
  updateCurrentTabDisplay();
  updateProjectControlStates();
  renderHeaderTabs();

  // ヘッダータブバーの「+」ボタン
  const headerNewTabBtn = document.getElementById('header-new-tab');
  if (headerNewTabBtn) {
    headerNewTabBtn.addEventListener('click', () => {
      void createNewProjectTab();
    });
  }

  logger.log('BOMSyncTool ready.');
}

// アプリケーション起動
init();
