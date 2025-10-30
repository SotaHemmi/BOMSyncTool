/**
 * ProjectTabs - Radix UI Tabsを使用したブラウザライクなタブ実装
 *
 * 機能:
 * - タブの作成・切り替え・削除
 * - お気に入り機能（星アイコン）
 * - ドラッグ&ドロップでの並び替え
 * - 中クリックで閉じる
 * - Chrome風のビジュアルデザイン
 */

import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { ProjectRecord } from '../types';

interface ProjectTabsProps {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  favoriteProjects: Set<string>;
  onTabChange: (projectId: string) => void;
  onTabClose: (projectId: string) => void;
  onNewTab: () => void;
  onToggleFavorite: (projectId: string) => void;
  onTabReorder: (projectId: string, newIndex: number) => void;
  onRename: (projectId: string, name: string) => boolean | void;
  onOpenInNewWindow?: (projectId: string) => void;
}

export function ProjectTabs({
  projects,
  activeProjectId,
  favoriteProjects,
  onTabChange,
  onTabClose,
  onNewTab,
  onToggleFavorite,
  onTabReorder,
  onRename,
  onOpenInNewWindow
}: ProjectTabsProps) {
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [contextMenuProjectId, setContextMenuProjectId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editingTabId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTabId]);

  // コンテキストメニューを閉じる処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setContextMenuProjectId(null);
        setContextMenuPosition(null);
      }
    };

    if (contextMenuProjectId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenuProjectId]);

  const startRename = (project: ProjectRecord) => {
    setEditingTabId(project.id);
    setEditingValue(project.name ?? '');
  };

  const commitRename = () => {
    if (!editingTabId) return;
    const nextName = editingValue.trim();
    const result = onRename(editingTabId, nextName);
    if (result === false) {
      return;
    }
    setEditingTabId(null);
    setEditingValue('');
    inputRef.current = null;
  };

  const cancelRename = () => {
    setEditingTabId(null);
    setEditingValue('');
    inputRef.current = null;
  };

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    if (editingTabId) {
      e.preventDefault();
      return;
    }
    setDraggedTab(projectId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-bomsynctool-project', projectId);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // ウィンドウの境界外にドロップされた場合、新しいウィンドウを開く
    const { clientX, clientY } = e;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // ドロップ位置がウィンドウ外（またはウィンドウの端から50px以内）の場合
    const isOutsideWindow =
      clientX < 50 ||
      clientX > windowWidth - 50 ||
      clientY < 0 ||
      clientY > windowHeight;

    if (isOutsideWindow && draggedTab && onOpenInNewWindow) {
      // 新しいウィンドウで開く
      onOpenInNewWindow(draggedTab);
    }

    setDraggedTab(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetProjectId: string) => {
    e.preventDefault();
    const draggedProjectId = e.dataTransfer.getData('application/x-bomsynctool-project');

    if (draggedProjectId && draggedProjectId !== targetProjectId) {
      const targetIndex = projects.findIndex(p => p.id === targetProjectId);
      if (targetIndex !== -1) {
        onTabReorder(draggedProjectId, targetIndex);
      }
    }
    setDraggedTab(null);
  };

  const handleMiddleClick = (e: React.MouseEvent, projectId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(projectId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuProjectId(projectId);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const handleOpenInNewWindow = () => {
    if (contextMenuProjectId && onOpenInNewWindow) {
      onOpenInNewWindow(contextMenuProjectId);
      setContextMenuProjectId(null);
      setContextMenuPosition(null);
    }
  };

  const handleCloseContextMenu = () => {
    setContextMenuProjectId(null);
    setContextMenuPosition(null);
  };

  return (
    <div className="tab-bar">
      <Tabs.Root
        value={activeProjectId || undefined}
        onValueChange={onTabChange}
        className="tab-bar-scroll"
      >
        <Tabs.List className="tabs-list">
          {projects.map((project) => {
            const isFavorite = favoriteProjects.has(project.id);
            const isActive = project.id === activeProjectId;
            const isDragging = draggedTab === project.id;
            const isEditing = editingTabId === project.id;

            return (
              <Tabs.Trigger key={project.id} value={project.id} asChild>
                <div
                  className={`header-tab ${isActive ? 'is-active' : ''} ${isDragging ? 'dragging' : ''}`}
                  draggable={!isEditing}
                  onDragStart={(e) => handleDragStart(e, project.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, project.id)}
                  onAuxClick={(e) => handleMiddleClick(e, project.id)}
                  onContextMenu={(e) => handleContextMenu(e, project.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startRename(project);
                  }}
                >
                  <span className="header-tab-highlight" />

                  <div className="header-tab-button">
                    {/* お気に入りアイコン */}
                    <span
                    className={`header-tab-star ${isFavorite ? 'is-favorite' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
                    aria-pressed={isFavorite}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(project.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFavorite(project.id);
                      }
                    }}
                  >
                    {isFavorite ? '★' : '☆'}
                  </span>

                  {/* タブタイトル */}
                  {isEditing ? (
                    <input
                      ref={node => {
                        if (isEditing) {
                          inputRef.current = node;
                        }
                      }}
                      className="session-tab-rename-input"
                      value={editingValue}
                      placeholder="未命名タブ"
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEditingValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={() => commitRename()}
                      aria-label="タブ名を変更"
                    />
                  ) : (
                    <span className="header-tab-title">
                      {project.name || '未命名タブ'}
                    </span>
                  )}
                </div>

                {/* 閉じるボタン */}
                <button
                  className="header-tab-close"
                  type="button"
                  aria-label="タブを閉じる"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(project.id);
                  }}
                >
                  ×
                </button>
              </div>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
      </Tabs.Root>

      {/* 新規タブボタン */}
      <button
        className="tab-bar-new-tab"
        type="button"
        aria-label="新しいタブを作成"
        title="新しいタブを作成"
        onClick={onNewTab}
      >
        ＋
      </button>

      {/* コンテキストメニュー */}
      {contextMenuProjectId && contextMenuPosition && (
        <div
          ref={contextMenuRef}
          className="dropdown-menu"
          style={{
            position: 'fixed',
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            zIndex: 10000
          }}
        >
          {onOpenInNewWindow && (
            <button
              type="button"
              className="dropdown-item"
              onClick={handleOpenInNewWindow}
            >
              新しいウィンドウで開く
            </button>
          )}
          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              const project = projects.find(p => p.id === contextMenuProjectId);
              if (project) {
                startRename(project);
              }
              handleCloseContextMenu();
            }}
          >
            名前を変更
          </button>
          <hr className="dropdown-divider" />
          <button
            type="button"
            className="dropdown-item"
            style={{ color: '#dc2626' }}
            onClick={() => {
              if (contextMenuProjectId) {
                onTabClose(contextMenuProjectId);
              }
              handleCloseContextMenu();
            }}
          >
            タブを閉じる
          </button>
        </div>
      )}
    </div>
  );
}
