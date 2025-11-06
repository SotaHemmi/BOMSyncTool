import { useMemo, type ChangeEvent, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import type { ProjectSettings } from '../types';
import type { ThemeColors } from '../utils/storage';
import { DictionaryTab, type DictionaryTabProps } from './DictionaryTab';
import { CloseIcon } from './icons';

export type SettingsTabKey = 'projects' | 'theme' | 'dictionary';

type DefaultPreprocessOptions = Required<NonNullable<ProjectSettings['defaultPreprocess']>>;

const DEFAULT_PREPROCESS_OPTIONS: DefaultPreprocessOptions = {
  expandReference: true,
  splitReferenceRows: false,
  fillBlankCells: true,
  cleanseTextData: true,
  applyFormatRules: false
};

export interface SettingsModalProps {
  open: boolean;
  activeTab: SettingsTabKey;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: SettingsTabKey) => void;
  projectSettings: ProjectSettings;
  onDefaultPreprocessChange: (option: keyof DefaultPreprocessOptions, value: boolean) => void;
  themeColors: ThemeColors;
  onThemeColorChange: (color: keyof ThemeColors, value: string) => void;
  onResetTheme: () => void;
  onSave: () => void;
  onCancel: () => void;
  dictionaryProps: DictionaryTabProps;
  isSaving?: boolean;
}

export function SettingsModal({
  open,
  activeTab,
  onOpenChange,
  onTabChange,
  projectSettings,
  onDefaultPreprocessChange,
  themeColors,
  onThemeColorChange,
  onResetTheme,
  onSave,
  onCancel,
  dictionaryProps,
  isSaving = false
}: SettingsModalProps) {
  const preprocess = useMemo<DefaultPreprocessOptions>(
    () => ({
      expandReference:
        projectSettings.defaultPreprocess?.expandReference ?? DEFAULT_PREPROCESS_OPTIONS.expandReference,
      splitReferenceRows:
        projectSettings.defaultPreprocess?.splitReferenceRows ?? DEFAULT_PREPROCESS_OPTIONS.splitReferenceRows,
      fillBlankCells:
        projectSettings.defaultPreprocess?.fillBlankCells ?? DEFAULT_PREPROCESS_OPTIONS.fillBlankCells,
      cleanseTextData:
        projectSettings.defaultPreprocess?.cleanseTextData ?? DEFAULT_PREPROCESS_OPTIONS.cleanseTextData,
      applyFormatRules:
        projectSettings.defaultPreprocess?.applyFormatRules ?? DEFAULT_PREPROCESS_OPTIONS.applyFormatRules
    }),
    [projectSettings.defaultPreprocess]
  );

  const handleThemeChange =
    (color: keyof ThemeColors) => (event: ChangeEvent<HTMLInputElement>) => {
      onThemeColorChange(color, event.target.value);
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal" id="settings-modal">
          <form className="modal-inner" onSubmit={handleSubmit}>
            <header className="modal-header">
              <div>
                <Dialog.Title>設定</Dialog.Title>
                <Dialog.Description className="modal-subtitle">
                  アプリケーションの基本設定とテーマ、辞書を管理します
                </Dialog.Description>
              </div>
              <Tabs.Root value={activeTab} onValueChange={value => onTabChange(value as SettingsTabKey)}>
                <Tabs.List className="modal-tabs">
                  <Tabs.Trigger
                    value="projects"
                    className={`tab${activeTab === 'projects' ? ' is-active' : ''}`}
                  >
                    プロジェクト
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="theme"
                    className={`tab${activeTab === 'theme' ? ' is-active' : ''}`}
                  >
                    テーマ
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="dictionary"
                    className={`tab${activeTab === 'dictionary' ? ' is-active' : ''}`}
                  >
                    辞書
                  </Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="閉じる"
                  data-tooltip="設定を閉じる"
                  onClick={onCancel}
                >
                  <CloseIcon className="icon-button-close-icon" />
                </button>
              </Dialog.Close>
            </header>

            <Tabs.Root value={activeTab} onValueChange={value => onTabChange(value as SettingsTabKey)}>
              <Tabs.Content value="projects">
                <div className="modal-body settings-body">
                  <section className="settings-panel" id="settings-panel-projects">
                    <div className="settings-group">
                      <h3>デフォルト前処理</h3>
                      <p className="settings-description">
                        プレビュー画面の「デフォルト前処理」ボタンで実行される処理を選択します
                      </p>
                      <div className="settings-checkboxes">
                        <label>
                          <input
                            type="checkbox"
                            checked={preprocess.expandReference}
                            onChange={event =>
                              onDefaultPreprocessChange('expandReference', event.target.checked)
                            }
                          />
                          Referenceの展開
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={preprocess.splitReferenceRows}
                            onChange={event =>
                              onDefaultPreprocessChange('splitReferenceRows', event.target.checked)
                            }
                          />
                          Referenceを行分割（1つのRefに複数Part_Noがある場合）
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={preprocess.fillBlankCells}
                            onChange={event =>
                              onDefaultPreprocessChange('fillBlankCells', event.target.checked)
                            }
                          />
                          空欄セルの補完
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={preprocess.cleanseTextData}
                            onChange={event =>
                              onDefaultPreprocessChange('cleanseTextData', event.target.checked)
                            }
                          />
                          テキストデータのクレンジング
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={preprocess.applyFormatRules}
                            onChange={event =>
                              onDefaultPreprocessChange('applyFormatRules', event.target.checked)
                            }
                          />
                          書式ルールの適用
                        </label>
                      </div>
                    </div>
                  </section>
                </div>
              </Tabs.Content>

              <Tabs.Content value="theme">
                <div className="modal-body settings-body">
                  <section className="settings-panel" id="settings-panel-theme">
                    <div className="settings-group">
                      <h3>テーマカラー</h3>
                      <p className="settings-description">
                        メインカラーを1色選択すると、全体のテーマカラーが自動生成されます
                      </p>
                      <div className="settings-inline-inputs">
                        <label>
                          メインカラー
                          <input
                            type="color"
                            value={themeColors.primary}
                            onChange={handleThemeChange('primary')}
                          />
                        </label>
                      </div>
                      <div className="theme-preview-palette">
                        <div className="theme-preview-swatch">
                          <div
                            className="theme-preview-color"
                            style={{ backgroundColor: themeColors.primary }}
                            data-tooltip="プライマリカラー"
                          />
                          <span>プライマリ</span>
                        </div>
                        <div className="theme-preview-swatch">
                          <div
                            className="theme-preview-color"
                            style={{ backgroundColor: themeColors.secondary }}
                            data-tooltip="セカンダリカラー（自動生成）"
                          />
                          <span>セカンダリ</span>
                        </div>
                        <div className="theme-preview-swatch">
                          <div
                            className="theme-preview-color"
                            style={{ backgroundColor: themeColors.danger }}
                            data-tooltip="アラートカラー（自動生成）"
                          />
                          <span>アラート</span>
                        </div>
                      </div>
                    </div>

                    <div className="settings-group theme-advanced">
                      <details className="theme-advanced-details">
                        <summary className="theme-advanced-summary">
                          詳細設定（個別調整）
                        </summary>
                        <div className="theme-advanced-content">
                          <p className="settings-description">
                            自動生成された色が気に入らない場合、個別に調整できます
                          </p>
                          <div className="theme-advanced-controls">
                            <label>
                              <span className="theme-label">セカンダリカラー</span>
                              <input
                                type="color"
                                value={themeColors.secondary}
                                onChange={handleThemeChange('secondary')}
                              />
                            </label>
                            <label>
                              <span className="theme-label">アラートカラー</span>
                              <input
                                type="color"
                                value={themeColors.danger}
                                onChange={handleThemeChange('danger')}
                              />
                            </label>
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className="settings-group">
                      <button
                        type="button"
                        className="ghost-button"
                        id="reset-theme-button"
                        onClick={onResetTheme}
                        data-tooltip="テーマカラーをデフォルトに戻します"
                      >
                        ⟳ テーマを初期化
                      </button>
                    </div>
                  </section>
                </div>
              </Tabs.Content>

              <Tabs.Content value="dictionary">
                <div className="modal-body settings-body">
                  <DictionaryTab {...dictionaryProps} />
                </div>
              </Tabs.Content>
            </Tabs.Root>

            <footer className="modal-footer">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onCancel}
                  data-tooltip="変更を破棄して設定を閉じる"
                >
                  キャンセル
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="primary-button"
                id="save-settings"
                disabled={isSaving}
                data-tooltip="設定を保存して閉じる"
              >
                設定を保存
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
