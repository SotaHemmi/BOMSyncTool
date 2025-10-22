/**
 * 前処理パイプライン関連の型定義
 */

export interface PreprocessBlock {
  id: string;
  type: string;
  enabled: boolean;
  name: string;
  icon: string;
}

export interface FormatOptions {
  use_strikethrough: boolean;
  use_cell_color: boolean;
}
