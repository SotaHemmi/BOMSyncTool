/**
 * プロジェクト管理
 *
 * プロジェクトの保存・読み込み・管理機能（BomRow不使用）
 */

import { logger } from '../utils/logger';
import type { ProjectRecord, ProjectPayload, ColumnRole, ProjectSettings } from '../types';
import { datasetState, resetAllState } from '../state/app-state';
import {
  getStoredProjects,
  saveStoredProjects,
  saveActiveProjectId,
  loadActiveProjectId,
  getFavoriteProjects,
  saveFavoriteProjects,
  getOpenTabs,
  saveOpenTabs,
  loadProjectSettings,
  saveProjectSettings as saveProjectSettingsToStorage,
  logActivity
} from '../utils';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, Window } from '@tauri-apps/api/window';

export const PROJECT_ID_PREFIX = 'project-';
export const AUTO_SAVE_MAX_LIMIT = 100;

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autoIntervalMinutes: 5,
  autoMaxEntries: 50,
  defaultPreprocess: {
    expandReference: true,
    splitReferenceRows: false,
    fillBlankCells: true,
    cleanseTextData: true,
    applyFormatRules: false
  }
};

/**
 * アクティブプロジェクトID
 */
export let activeProjectId: string | null = loadActiveProjectId();

/**
 * プロジェクト設定
 */
export let projectSettings: ProjectSettings = loadProjectSettingsFromStorage();

/**
 * 自動保存タイマー
 */
let autoSaveTimer: number | null = null;

const PROJECT_WINDOW_MAP_KEY = 'project_window_map';
const PROJECT_FOCUS_EVENT_KEY = 'project_focus_request';

let currentWindowLabel: string | null = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

function createCloseIcon(className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) {
    svg.classList.add(className);
  }

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M19 5 5 19M5 5l14 14');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(path);
  return svg;
}

/**
 * ウィンドウラベルを遅延取得する
 * Tauriランタイムが初期化されるまで待つ
 */
function getCurrentWindowLabel(): string {
  if (currentWindowLabel !== null) {
    return currentWindowLabel;
  }

  try {
    const win = getCurrentWindow();
    currentWindowLabel = win.label;
    return currentWindowLabel;
  } catch (error) {
    logger.warn('ウィンドウラベルの取得に失敗しました:', error);
    currentWindowLabel = 'main';
    return currentWindowLabel;
  }
}

let dropHandledExternally = false;

type ProjectWindowMap = Record<string, string>;

function readProjectWindowMap(): ProjectWindowMap {
  const stored = localStorage.getItem(PROJECT_WINDOW_MAP_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as ProjectWindowMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logger.warn('プロジェクトウィンドウマップの解析に失敗しました:', error);
    return {};
  }
}

function writeProjectWindowMap(map: ProjectWindowMap, before: string): void {
  const serialized = JSON.stringify(map);
  if (serialized !== before) {
    localStorage.setItem(PROJECT_WINDOW_MAP_KEY, serialized);
  }
}

function updateProjectWindowMap(mutator: (map: ProjectWindowMap) => void): void {
  const map = readProjectWindowMap();
  const before = JSON.stringify(map);
  mutator(map);
  writeProjectWindowMap(map, before);
}

function setProjectOwner(projectId: string, windowLabel: string): void {
  updateProjectWindowMap(map => {
    map[projectId] = windowLabel;
  });
}

function clearProjectOwner(projectId: string): void {
  updateProjectWindowMap(map => {
    if (projectId in map) {
      delete map[projectId];
    }
  });
}

function getProjectOwner(projectId: string): string | null {
  const map = readProjectWindowMap();
  return map[projectId] ?? null;
}

function emitProjectFocusRequest(projectId: string, targetWindow: string): void {
  const payload = {
    timestamp: Date.now(),
    projectId,
    targetWindow
  };
  localStorage.setItem(PROJECT_FOCUS_EVENT_KEY, JSON.stringify(payload));
}

async function focusWindowByLabel(label: string): Promise<boolean> {
  try {
    const currentLabel = getCurrentWindowLabel();
    if (label === currentLabel) {
      const win = getCurrentWindow();
      await win.setFocus();
      return true;
    }
    const target = await Window.getByLabel(label);
    if (!target) return false;
    await target.show();
    await target.setFocus();
    return true;
  } catch (error) {
    logger.warn('ウィンドウのフォーカスに失敗しました:', error);
    return false;
  }
}

async function focusExistingProjectWindow(projectId: string): Promise<boolean> {
  const owner = getProjectOwner(projectId);
  if (!owner || owner === getCurrentWindowLabel()) {
    return false;
  }

  const focused = await focusWindowByLabel(owner);
  if (focused) {
    emitProjectFocusRequest(projectId, owner);
    return true;
  }

  clearProjectOwner(projectId);
  return false;
}

function cleanupWindowOwnership(): void {
  const map = readProjectWindowMap();
  const before = JSON.stringify(map);
  let changed = false;
  const currentLabel = getCurrentWindowLabel();
  Object.keys(map).forEach(projectId => {
    if (map[projectId] === currentLabel) {
      delete map[projectId];
      changed = true;
    }
  });
  if (changed) {
    writeProjectWindowMap(map, before);
  }
}

if (typeof window !== 'undefined') {
  cleanupWindowOwnership();
  window.addEventListener('beforeunload', () => {
    cleanupWindowOwnership();
  });
}

function detachProjectFromCurrentWindow(projectId: string): void {
  const openTabIds = getOpenTabs();
  const newOpenTabs = openTabIds.filter(id => id !== projectId);

  if (newOpenTabs.length === openTabIds.length) {
    clearProjectOwner(projectId);
    return;
  }

  saveOpenTabs(newOpenTabs);
  clearProjectOwner(projectId);

  if (projectId === activeProjectId) {
    const allProjects = getStoredProjects();
    for (let index = newOpenTabs.length - 1; index >= 0; index -= 1) {
      const candidateId = newOpenTabs[index];
      const candidate = allProjects.find(p => p.id === candidateId);
      if (candidate) {
        loadProject(candidate);
        return;
      }
    }

    activeProjectId = null;
    saveActiveProjectId(null);
    resetAllState();
  }

  renderHeaderTabs();
  renderProjectTabs();
  updateCurrentTabDisplay();
  updateProjectControlStates();
}

/**
 * プロジェクトスナップショットを作成
 *
 * @returns プロジェクトペイロード
 */
export function createProjectSnapshot(): ProjectPayload {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    bomA: datasetState.a.parseResult,
    bomB: datasetState.b.parseResult,
    columnRolesA: { ...datasetState.a.columnRoles },
    columnRolesB: { ...datasetState.b.columnRoles }
  };
}

/**
 * 空のプロジェクトスナップショットを作成
 *
 * @returns 空のプロジェクトペイロード
 */
export function createEmptyProjectSnapshot(): ProjectPayload {
  const savedAt = new Date().toISOString();
  return {
    version: 1,
    savedAt,
    bomA: null,
    bomB: null,
    columnRolesA: {},
    columnRolesB: {}
  };
}

/**
 * プロジェクト名を生成
 *
 * @returns デフォルトのプロジェクト名
 */
export function generateDefaultProjectName(): string {
  const bomAName = datasetState.a.fileName;
  const timestamp = new Date().toLocaleString('ja-JP');
  if (bomAName) {
    return `${bomAName} ${timestamp}`;
  }
  return `タブ ${timestamp}`;
}

/**
 * プロジェクトを保存
 *
 * @param name - プロジェクト名（未指定の場合はプロンプト表示）
 * @returns 成功したかどうか
 */
export async function saveProject(name?: string): Promise<boolean> {
  const hasData = datasetState.a.parseResult !== null || datasetState.b.parseResult !== null;
  if (!hasData) {
    alert('保存できる内容がありません。');
    return false;
  }

  const providedName = typeof name === 'string' ? name.trim() : '';
  const projectName =
    providedName.length > 0
      ? providedName
      : prompt('タブ名を入力してください:', generateDefaultProjectName())?.trim();

  if (!projectName) {
    return false;
  }

  const snapshot = createProjectSnapshot();
  const now = snapshot.savedAt;
  const projects = getStoredProjects();

  let projectId = activeProjectId;
  let index = projectId ? projects.findIndex(p => p.id === projectId) : -1;

  if (index < 0) {
    // 新規プロジェクト
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
    // 既存プロジェクトを更新
    projects[index] = {
      ...projects[index],
      name: projectName,
      updatedAt: now,
      data: snapshot
    };
  }

  // プロジェクト数制限を適用
  const limited = applyProjectLimit(projects);
  if (!saveStoredProjects(limited)) {
    return false;
  }

  if (projectId) {
    setActiveProject(projectId);
  }

  return true;
}

/**
 * プロジェクトを読み込み
 *
 * @param record - プロジェクトレコード
 */
export function loadProject(record: ProjectRecord): void {
  const payload = record.data;

  // BOM A
  datasetState.a.parseResult = payload.bomA ? { ...payload.bomA } : null;
  datasetState.a.fileName = payload.bomA ? record.name ?? null : null;
  datasetState.a.filePath = null;
  datasetState.a.lastUpdated = payload.bomA ? new Date().toISOString() : null;
  datasetState.a.columnRoles = normalizeStoredColumnRoles(payload.columnRolesA);

  // BOM B
  datasetState.b.parseResult = payload.bomB ? { ...payload.bomB } : null;
  datasetState.b.fileName = payload.bomB ? record.name ?? null : null;
  datasetState.b.filePath = null;
  datasetState.b.lastUpdated = payload.bomB ? new Date().toISOString() : null;
  datasetState.b.columnRoles = normalizeStoredColumnRoles(payload.columnRolesB);

  setActiveProject(record.id);

  // UIを更新（カスタムイベントで通知）
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('project-loaded', {
      detail: { projectId: record.id, projectName: record.name }
    }));
  }

  openTab(record.id);
  renderProjectTabs();
  renderHeaderTabs();
  updateCurrentTabDisplay();
  updateProjectControlStates();

  logActivity(`プロジェクト「${record.name ?? '未命名タブ'}」を読み込みました。`);
}

/**
 * ワークスペースをリセット
 */
export function resetWorkspace(): void {
  resetAllState();
}

/**
 * アクティブプロジェクトを設定
 *
 * @param projectId - プロジェクトID
 */
export function setActiveProject(projectId: string): void {
  activeProjectId = projectId;
  saveActiveProjectId(projectId);
  setProjectOwner(projectId, getCurrentWindowLabel());
}

/**
 * プロジェクト数制限を適用
 *
 * @param projects - プロジェクトリスト
 * @param limit - 最大数（デフォルト: 50）
 * @returns 制限適用後のプロジェクトリスト
 */
function applyProjectLimit(projects: ProjectRecord[], limit: number = 50): ProjectRecord[] {
  if (limit <= 0 || projects.length <= limit) {
    return projects;
  }
  return [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

/**
 * 保存された列役割を正規化
 *
 * @param storedRoles - 保存された列役割
 * @returns 正規化された列役割
 */
function normalizeStoredColumnRoles(storedRoles?: Record<string, ColumnRole>): Record<string, ColumnRole> {
  if (!storedRoles) return {};

  const result: Record<string, ColumnRole> = {};
  for (const [key, value] of Object.entries(storedRoles)) {
    if (isColumnRole(value)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 列役割の型ガード
 */
function isColumnRole(value: string): value is ColumnRole {
  return ['ref', 'part_no', 'manufacturer', 'value', 'package', 'quantity', 'remarks', 'ignore'].includes(value);
}

/**
 * プロジェクト制御ボタンの状態を更新
 */
export function updateProjectControlStates(): void {
  const openWindowButton = document.getElementById('open-tab-window') as HTMLButtonElement | null;
  if (openWindowButton) {
    openWindowButton.disabled = !activeProjectId;
  }
}

/**
 * プロジェクトURLを更新
 */
export function updateProjectUrl(projectId: string | null): void {
  const url = new URL(window.location.href);
  if (projectId) {
    url.searchParams.set('project', projectId);
  } else {
    url.searchParams.delete('project');
  }
  window.history.replaceState(null, '', url.toString());
}

/**
 * 現在のタブ表示を更新
 */
export function updateCurrentTabDisplay(): void {
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

/**
 * プロジェクトタブをレンダリング
 */
export function renderProjectTabs(): void {
  const sessionTabBar = document.getElementById('session-tab-bar');
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

/**
 * ヘッダータブバーをレンダリング（開いているタブのみ）
 */
export function renderHeaderTabs(): void {
  const tabBarScroll = document.getElementById('tab-bar-scroll');
  if (!tabBarScroll) return;

  const openTabIds = getOpenTabs();
  const allProjects = getStoredProjects();
  const favoriteProjects = getFavoriteProjects();

  tabBarScroll.innerHTML = '';

  // 開いているタブのみ表示
  openTabIds.forEach(tabId => {
    const project = allProjects.find(p => p.id === tabId);
    if (project) {
      tabBarScroll.appendChild(createHeaderTabElement(project, favoriteProjects));
    }
  });
}

/**
 * ヘッダータブ要素を作成
 */
function createHeaderTabElement(project: ProjectRecord, favoriteProjects: Set<string>): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'header-tab';
  if (project.id === activeProjectId) {
    tab.classList.add('is-active');
  }

  // ドラッグ可能に設定
  tab.draggable = true;
  tab.setAttribute('data-project-id', project.id);

  const highlight = document.createElement('span');
  highlight.className = 'header-tab-highlight';
  tab.appendChild(highlight);

  const tabInner = document.createElement('button');
  tabInner.className = 'header-tab-button';
  tabInner.type = 'button';

  const isFavorite = favoriteProjects.has(project.id);
  const starIcon = document.createElement('span');
  starIcon.className = 'header-tab-star';
  if (isFavorite) {
    starIcon.classList.add('is-favorite');
  }
  starIcon.textContent = isFavorite ? '★' : '☆';
  starIcon.setAttribute('role', 'button');
  starIcon.setAttribute('tabindex', '0');
  starIcon.setAttribute('aria-label', isFavorite ? 'お気に入りから削除' : 'お気に入りに追加');
  starIcon.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');

  const handleFavoriteToggle = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
    toggleProjectFavorite(project.id);
  };

  starIcon.addEventListener('click', handleFavoriteToggle);
  starIcon.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleFavoriteToggle(event);
    }
  });

  tabInner.appendChild(starIcon);

  const tabTitle = document.createElement('span');
  tabTitle.className = 'header-tab-title';
  tabTitle.textContent = project.name || '未命名タブ';
  tabInner.appendChild(tabTitle);

  // 左クリック: タブ切り替え
  tabInner.addEventListener('click', () => {
    if (project.id !== activeProjectId) {
      loadProject(project);
    }
  });

  // 中クリック: タブを閉じる
  tabInner.addEventListener('auxclick', (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault();
      closeTab(project.id);
    }
  });

  const closeButton = document.createElement('button');
  closeButton.className = 'header-tab-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'タブを閉じる');
  closeButton.appendChild(createCloseIcon('header-tab-close-icon'));
  closeButton.addEventListener('click', (event: MouseEvent) => {
    event.stopPropagation();
    closeTab(project.id);
  });

  // ドラッグ開始
  tab.addEventListener('dragstart', (event: DragEvent) => {
    if (event.dataTransfer) {
      dropHandledExternally = false;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-bomsynctool-project', project.id);
      event.dataTransfer.setData('application/x-bomsynctool-origin', getCurrentWindowLabel());

      try {
        const projectData = JSON.stringify(project);
        event.dataTransfer.setData('application/json', projectData);
      } catch (error) {
        logger.error('Failed to serialize project data for drag:', error);
      }

      // カスタムドラッグプレビュー: 角丸四角＋タブ名
      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-1000px';
      dragPreview.style.left = '-1000px';
      dragPreview.style.padding = '10px 20px';
      dragPreview.style.backgroundColor = 'white';
      dragPreview.style.border = '1px solid #adb5bd';
      dragPreview.style.borderRadius = '8px';
      dragPreview.style.fontSize = '13px';
      dragPreview.style.fontWeight = '500';
      dragPreview.style.color = '#202124';
      dragPreview.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      dragPreview.style.whiteSpace = 'nowrap';
      dragPreview.style.minWidth = '100px';
      dragPreview.style.textAlign = 'center';
      dragPreview.textContent = project.name || '未命名タブ';

      document.body.appendChild(dragPreview);
      event.dataTransfer.setDragImage(dragPreview, dragPreview.offsetWidth / 2, dragPreview.offsetHeight / 2);

      // ドラッグ開始後にプレビュー要素を削除
      setTimeout(() => {
        if (dragPreview.parentNode) {
          document.body.removeChild(dragPreview);
        }
      }, 0);

      tab.classList.add('dragging');
    }
  });

  // ドラッグ終了
  tab.addEventListener('dragend', (event: DragEvent) => {
    tab.classList.remove('dragging');
    if (dropHandledExternally) {
      dropHandledExternally = false;
      return;
    }

    const windowBounds = {
      left: window.screenX,
      top: window.screenY,
      right: window.screenX + window.outerWidth,
      bottom: window.screenY + window.outerHeight
    };

    const dropX = event.screenX;
    const dropY = event.screenY;
    const outsideWindow =
      dropX < windowBounds.left ||
      dropX > windowBounds.right ||
      dropY < windowBounds.top ||
      dropY > windowBounds.bottom;

    if (outsideWindow) {
      void openProjectInNewWindow(project.id, {
        position: { x: dropX, y: dropY },
        detach: true
      });
    }
  });

  tab.appendChild(tabInner);
  tab.appendChild(closeButton);

  return tab;
}

/**
 * タブを閉じる
 */
function closeTab(projectId: string): void {
  const openTabIds = getOpenTabs();
  const newOpenTabs = openTabIds.filter(id => id !== projectId);

  saveOpenTabs(newOpenTabs);
  clearProjectOwner(projectId);

  // 閉じたタブがアクティブだった場合、別のタブに切り替え
  if (projectId === activeProjectId) {
    if (newOpenTabs.length > 0) {
      const allProjects = getStoredProjects();
      const nextProject = allProjects.find(p => p.id === newOpenTabs[newOpenTabs.length - 1]);
      if (nextProject) {
        loadProject(nextProject);
      }
    } else {
      // タブが1つもない場合、新しいタブを作成
      void createNewProjectTab();
    }
  }

  renderHeaderTabs();
  renderProjectTabs();
}

/**
 * タブを開く（開いているタブリストに追加）
 */
export function openTab(projectId: string): void {
  const openTabIds = getOpenTabs();
  if (!openTabIds.includes(projectId)) {
    openTabIds.push(projectId);
    saveOpenTabs(openTabIds);
    renderHeaderTabs();
  }
}

async function activateOrFocusProject(project: ProjectRecord, options?: { force?: boolean }): Promise<void> {
  const force = Boolean(options?.force);
  if (!force) {
    const handled = await focusExistingProjectWindow(project.id);
    if (handled) {
      return;
    }
  }

  openTab(project.id);
  if (force || project.id !== activeProjectId) {
    loadProject(project);
  }
}

/**
 * プロジェクトタブ要素を作成
 */
export function createProjectTabElement(project: ProjectRecord, favoriteProjects: Set<string>): HTMLElement {
  const tab = document.createElement('div');
  tab.className = 'session-tab';
  if (project.id === activeProjectId) {
    tab.classList.add('is-active');
  }

  // ドラッグ可能に設定
  tab.draggable = true;
  tab.setAttribute('data-project-id', project.id);

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

  // 左クリック: タブを開く＆切り替え
  button.addEventListener('click', () => {
    void activateOrFocusProject(project);
  });

  // 中クリック（ホイールクリック）: タブを閉じる
  button.addEventListener('auxclick', (event: MouseEvent) => {
    if (event.button === 1) { // 中クリック
      event.preventDefault();
      const displayName = project.name ?? '未命名タブ';
      if (confirm(`「${displayName}」を閉じますか？`)) {
        deleteStoredProject(project.id);
      }
    }
  });

  // ドラッグ開始
  tab.addEventListener('dragstart', (event: DragEvent) => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-bomsynctool-project', project.id);
      event.dataTransfer.setData('application/x-bomsynctool-origin', getCurrentWindowLabel());

      // プロジェクトの全データを埋め込む（ウィンドウ統合用）
      try {
        const projectData = JSON.stringify(project);
        event.dataTransfer.setData('application/json', projectData);
      } catch (error) {
        logger.error('Failed to serialize project data for drag:', error);
      }

      tab.classList.add('dragging');
    }
  });

  // ドラッグ終了
  tab.addEventListener('dragend', () => {
    tab.classList.remove('dragging');
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
    void openProjectInNewWindow(project.id, { detach: true });
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
  close.appendChild(createCloseIcon('session-tab-close-icon'));
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

/**
 * 「新しいタブ」ボタン要素を作成
 */
export function createProjectTabAddElement(): HTMLElement {
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

/**
 * お気に入りをトグル
 */
export function toggleProjectFavorite(projectId: string): void {
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
  renderHeaderTabs();
}

/**
 * プロジェクト名を変更
 */
export function renameProject(projectId: string, rawName: string): boolean {
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

/**
 * インラインでタブ名を変更
 */
export function startInlineTabRename(
  projectId: string,
  button: HTMLButtonElement,
  labelSpan: HTMLSpanElement
): void {
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

/**
 * デフォルト前処理設定を正規化
 */
function normalizeDefaultPreprocessSettings(preprocess?: {
  expandReference?: boolean;
  splitReferenceRows?: boolean;
  fillBlankCells?: boolean;
  cleanseTextData?: boolean;
  applyFormatRules?: boolean;
}): {
  expandReference: boolean;
  splitReferenceRows: boolean;
  fillBlankCells: boolean;
  cleanseTextData: boolean;
  applyFormatRules: boolean;
} {
  if (!preprocess) {
    return {
      expandReference: true,
      splitReferenceRows: false,
      fillBlankCells: true,
      cleanseTextData: true,
      applyFormatRules: false
    };
  }
  return {
    expandReference: preprocess.expandReference ?? true,
    splitReferenceRows: preprocess.splitReferenceRows ?? false,
    fillBlankCells: preprocess.fillBlankCells ?? true,
    cleanseTextData: preprocess.cleanseTextData ?? true,
    applyFormatRules: preprocess.applyFormatRules ?? false
  };
}

/**
 * ストレージからプロジェクト設定を読み込み
 */
export function loadProjectSettingsFromStorage(): ProjectSettings {
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

/**
 * 自動保存間隔をサニタイズ
 */
export function sanitizeAutoInterval(value: unknown): number {
  const numeric = Number(value);
  const minutes = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_PROJECT_SETTINGS.autoIntervalMinutes;
  const clamped = Math.max(1, Math.min(180, minutes));
  return clamped;
}

/**
 * 自動保存数をサニタイズ
 */
export function sanitizeAutoCount(value: unknown): number {
  const numeric = Number(value);
  const count = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_PROJECT_SETTINGS.autoMaxEntries;
  const clamped = Math.max(1, Math.min(AUTO_SAVE_MAX_LIMIT, count));
  return clamped;
}

/**
 * プロジェクト設定をフォームに適用
 */
export function applyProjectSettingsToForm(settings: ProjectSettings): void {
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

/**
 * フォームからプロジェクト設定を読み取り
 */
export function readProjectSettingsFromForm(): ProjectSettings {
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

/**
 * プロジェクト設定を保存
 */
export function saveProjectSettings(settings: ProjectSettings): void {
  projectSettings = {
    autoIntervalMinutes: sanitizeAutoInterval(settings.autoIntervalMinutes),
    autoMaxEntries: sanitizeAutoCount(settings.autoMaxEntries),
    defaultPreprocess: normalizeDefaultPreprocessSettings(settings.defaultPreprocess)
  };

  // ストレージに保存
  saveProjectSettingsToStorage(projectSettings);

  startAutoSaveTimer();
  applyProjectSettingsToForm(projectSettings);
}

/**
 * 自動保存タイマーを開始
 */
export function startAutoSaveTimer(): void {
  stopAutoSaveTimer();
  const intervalMinutes = sanitizeAutoInterval(projectSettings.autoIntervalMinutes);
  const intervalMs = intervalMinutes * 60_000;
  autoSaveTimer = window.setInterval(() => {
    void triggerScheduledAutoSave();
  }, intervalMs);
}

/**
 * 自動保存タイマーを停止
 */
export function stopAutoSaveTimer(): void {
  if (autoSaveTimer !== null) {
    window.clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * スケジュールされた自動保存を実行
 */
export async function triggerScheduledAutoSave(): Promise<void> {
  if (!hasAnyDatasetLoaded()) {
    return;
  }
  await autoSaveActiveProject();
}

/**
 * データセットが読み込まれているかチェック
 */
export function hasAnyDatasetLoaded(): boolean {
  return Boolean(datasetState.a.parseResult || datasetState.b.parseResult);
}

/**
 * 自動保存の最大数を取得
 */
export function getAutoSaveLimit(): number {
  return sanitizeAutoCount(projectSettings.autoMaxEntries);
}

/**
 * タイムスタンプラベルを生成
 */
export function generateTimestampLabel(): string {
  return new Date().toLocaleString('ja-JP');
}

/**
 * 新しいプロジェクトタブを作成
 */
export async function createNewProjectTab(): Promise<void> {
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

/**
 * アクティブプロジェクトを別ウィンドウで開く
 */
export function openActiveProjectInNewWindow(): void {
  if (!activeProjectId) {
    alert('開けるタブがありません。');
    return;
  }
  void openProjectInNewWindow(activeProjectId, { detach: true });
}

/**
 * プロジェクトを別ウィンドウで開く
 */
async function openProjectInNewWindow(
  projectId: string,
  options?: { position?: { x: number; y: number }; detach?: boolean }
): Promise<void> {
  try {
    await invoke('open_project_window', {
      projectId,
      position: options?.position ?? null
    });
    if (options?.detach) {
      detachProjectFromCurrentWindow(projectId);
    }
    logActivity('プロジェクトを新しいウィンドウで開きました。');
  } catch (error) {
    logger.error('Failed to open project in new window:', error);
    alert(`ウィンドウを開けませんでした: ${error}`);
  }
}

/**
 * アクティブプロジェクトを自動保存
 */
export async function autoSaveActiveProject(nameHint?: string): Promise<void> {
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

/**
 * プロジェクトを削除
 */
export function deleteStoredProject(projectId: string): void {
  const projects = getStoredProjects();
  const filtered = projects.filter(project => project.id !== projectId);
  if (!saveStoredProjects(filtered)) {
    return;
  }
  clearProjectOwner(projectId);
  if (projectId === activeProjectId) {
    activeProjectId = null;
    saveActiveProjectId(null);
    resetAllState();
  }
  renderProjectTabs();
}

/**
 * プロジェクトを初期化
 */
export function initializeProjects(): void {
  let projects = getStoredProjects();

  if (projects.length === 0) {
    const snapshot = createEmptyProjectSnapshot();
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
    activeProjectId = target.id;
    saveActiveProjectId(target.id);
    loadProject(target);
  } else {
    renderProjectTabs();
  }
}

/**
 * 初期プロジェクトロードイベントを監視
 */
export function registerInitialProjectListener(): void {
  window.addEventListener(
    'initial-project-ready',
    () => {
      const scriptProjectId = (window as typeof window & { __INITIAL_PROJECT_ID__?: unknown }).__INITIAL_PROJECT_ID__;
      if (typeof scriptProjectId !== 'string' || scriptProjectId.length === 0) {
        return;
      }

      const projects = getStoredProjects();
      const target = projects.find(project => project.id === scriptProjectId);
      if (target) {
        loadProject(target);
      }
    },
    { once: true }
  );
}

/**
 * プロジェクト関連ボタンのイベントを登録
 */
export function registerProjectButtons(): void {
  const newTabBtn = document.getElementById('new-project-tab');
  const openWindowBtn = document.getElementById('open-tab-window');

  newTabBtn?.addEventListener('click', () => {
    void createNewProjectTab();
  });

  openWindowBtn?.addEventListener('click', () => {
    openActiveProjectInNewWindow();
  });

  updateProjectControlStates();
  registerTabDragAndDrop();
}

/**
 * タブのドラッグ&ドロップ機能を登録
 */
function registerTabDragAndDrop(): void {
  // ウィンドウ全体をドロップゾーンとして設定
  let dragCounter = 0;
  const overlay = createDragOverlay();

  document.body.addEventListener('dragenter', (event: DragEvent) => {
    if (event.dataTransfer?.types.includes('application/x-bomsynctool-project')) {
      dragCounter++;
      if (dragCounter === 1) {
        document.body.appendChild(overlay);
        overlay.style.display = 'flex';
      }
    }
  });

  document.body.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) {
      overlay.style.display = 'none';
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  });

  document.body.addEventListener('dragover', (event: DragEvent) => {
    if (event.dataTransfer?.types.includes('application/x-bomsynctool-project')) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    }
  });

  document.body.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    dragCounter = 0;
    overlay.style.display = 'none';
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    dropHandledExternally = true;

    const projectId = event.dataTransfer?.getData('application/x-bomsynctool-project');
    const projectDataJson = event.dataTransfer?.getData('application/json');
    const originLabel = event.dataTransfer?.getData('application/x-bomsynctool-origin');

    if (projectId) {
      if (originLabel && originLabel === getCurrentWindowLabel()) {
        void openProjectInNewWindow(projectId, {
          position: { x: event.screenX, y: event.screenY },
          detach: true
        });
      } else if (projectDataJson) {
        // 別ウィンドウからのタブ → このウィンドウに統合
        mergeProjectFromDataTransfer(projectDataJson);
      } else {
        logger.error('Cannot merge project: no project data in DataTransfer');
      }
    }
  });
}

/**
 * DataTransferからプロジェクトデータを読み取って統合
 *
 * @param projectDataJson - プロジェクトデータのJSON文字列
 */
function mergeProjectFromDataTransfer(projectDataJson: string): void {
  try {
    const projectRecord = JSON.parse(projectDataJson) as ProjectRecord;

    // 現在のウィンドウにプロジェクトを追加
    const projects = getStoredProjects();

    // 同じIDのプロジェクトが既に存在するかチェック
    const existingIndex = projects.findIndex(p => p.id === projectRecord.id);
    if (existingIndex >= 0) {
      // 既存のプロジェクトを上書き
      projects[existingIndex] = projectRecord;
    } else {
      // 新しいプロジェクトとして追加
      projects.push(projectRecord);
    }

    saveStoredProjects(projects);

    // 統合完了を localStorage に記録（他のウィンドウに通知）
    const mergeEvent = {
      timestamp: Date.now(),
      projectId: projectRecord.id,
      targetWindow: 'current'
    };
    localStorage.setItem('project_merge_event', JSON.stringify(mergeEvent));

    renderProjectTabs();
    void activateOrFocusProject(projectRecord, { force: true });

    logActivity(`プロジェクト「${projectRecord.name ?? '未命名タブ'}」を統合しました。`);
  } catch (error) {
    logger.error('Failed to merge project from DataTransfer:', error);
    alert(`プロジェクトの統合に失敗しました: ${error}`);
  }
}

/**
 * プロジェクト統合イベントを監視
 *
 * 他のウィンドウでプロジェクトが統合されたら、元のウィンドウから削除
 */
export function registerProjectMergeListener(): void {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === 'project_merge_event' && event.newValue) {
      try {
        const mergeEvent = JSON.parse(event.newValue) as {
          timestamp: number;
          projectId: string;
          targetWindow: string;
        };

        // このウィンドウが統合先でない場合、プロジェクトを削除
        const projects = getStoredProjects();
        const hasProject = projects.some(p => p.id === mergeEvent.projectId);

        if (hasProject) {
          // 他のウィンドウに統合されたので、このウィンドウからは削除
          deleteStoredProject(mergeEvent.projectId);
          logActivity(`プロジェクトが他のウィンドウに移動しました。`);
        }
      } catch (error) {
        logger.error('Failed to process project merge event:', error);
      }
    } else if (event.key === PROJECT_FOCUS_EVENT_KEY && event.newValue) {
      try {
        const focusEvent = JSON.parse(event.newValue) as {
          timestamp: number;
          projectId: string;
          targetWindow: string;
        };
        if (focusEvent.targetWindow === getCurrentWindowLabel()) {
          const projects = getStoredProjects();
          const target = projects.find(project => project.id === focusEvent.projectId);
          if (target) {
            loadProject(target);
            const win = getCurrentWindow();
            void win.setFocus();
          }
        }
      } catch (error) {
        logger.error('Failed to process project focus event:', error);
      }
    }
  });
}

/**
 * ドラッグオーバーレイを作成
 */
function createDragOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 123, 255, 0.1);
    border: 3px dashed #007bff;
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    pointer-events: none;
  `;

  const message = document.createElement('div');
  message.style.cssText = `
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 1.5rem;
    color: #007bff;
    font-weight: bold;
  `;
  message.textContent = '↗︎ 新しいウィンドウで開く';

  overlay.appendChild(message);
  return overlay;
}
