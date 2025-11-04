/**
 * テーマカラー生成ユーティリティ
 *
 * 単一のキーカラーから全体のカラーパレットを自動生成
 */

import { lch, formatHex, type Lch } from 'culori';

export interface ThemeColors {
  primary: string;
  secondary: string;
  danger: string;
}

export interface ExtendedThemePalette extends ThemeColors {
  // グレー系（キーカラーの色相、低彩度）
  neutral50: string;
  neutral100: string;
  neutral200: string;
  neutral300: string;
  neutral400: string;
  neutral500: string;
  neutral600: string;
  neutral700: string;
  neutral800: string;
  neutral900: string;

  // 背景色（極低彩度）
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
}

export interface HSLComponents {
  h: number;
  s: number;
  l: number;
}

/**
 * 16進数カラーコードをHSLコンポーネントに分解
 */
export function hexToHsl(hex: string): HSLComponents {
  // culoriのLCH経由でHSLを計算
  const color = lch(hex);
  if (!color) {
    return { h: 0, s: 0, l: 0 };
  }

  // LCH → HSL変換
  // H (色相): LCHのHをそのまま使用
  // S (彩度): LCHのC (chroma) を0-100%にマッピング
  // L (明度): LCHのL を0-100%にマッピング
  const h = color.h ?? 0;
  const s = Math.min(100, (color.c ?? 0) * 1.5); // Chromaを彩度に変換（経験的係数）
  const l = color.l ?? 0;

  return {
    h: Math.round(h),
    s: Math.round(s),
    l: Math.round(l)
  };
}

/**
 * 単一のキーカラーから全体のテーマパレットを生成
 *
 * @param keyColor - ユーザーが選択したキーカラー（16進数）
 * @returns 自動生成されたテーマカラーパレット
 */
export function generateThemeFromKey(keyColor: string): ThemeColors {
  const primaryLch = lch(keyColor);

  if (!primaryLch) {
    // フォールバック: 解析失敗時はデフォルト色を返す
    return {
      primary: '#3f8fc0',
      secondary: '#e6eef7',
      danger: '#d95d5d'
    };
  }

  // Primary: ユーザー選択色をそのまま使用
  const primary = keyColor;

  // Secondary: 彩度を30%に抑え、明度を90%に（淡く穏やかな色）
  const secondaryLch: Lch = {
    mode: 'lch',
    l: 90,
    c: (primaryLch.c ?? 0) * 0.3,
    h: primaryLch.h
  };
  const secondary = formatHex(secondaryLch);

  // Danger: 赤系統（色相15°）に固定、彩度はprimaryの80%を継承
  const dangerLch: Lch = {
    mode: 'lch',
    l: 55,
    c: (primaryLch.c ?? 0) * 0.8,
    h: 15 // 赤
  };
  const danger = formatHex(dangerLch);

  return {
    primary,
    secondary,
    danger
  };
}

/**
 * 拡張パレット生成（グレー系・背景色も含む）
 *
 * @param keyColor - ユーザーが選択したキーカラー（16進数）
 * @returns 拡張パレット（グレー系、背景色を含む）
 */
export function generateExtendedPalette(keyColor: string): ExtendedThemePalette {
  const base = generateThemeFromKey(keyColor);
  const primaryLch = lch(keyColor);

  if (!primaryLch) {
    // フォールバック
    return {
      ...base,
      neutral50: '#f8fafc',
      neutral100: '#f1f5f9',
      neutral200: '#e2e8f0',
      neutral300: '#cbd5e1',
      neutral400: '#94a3b8',
      neutral500: '#64748b',
      neutral600: '#475569',
      neutral700: '#334155',
      neutral800: '#1e293b',
      neutral900: '#0f172a',
      bgPrimary: '#ffffff',
      bgSecondary: '#f8fafc',
      bgTertiary: '#f1f5f9'
    };
  }

  const hue = primaryLch.h ?? 210;

  // グレー系：キーカラーの色相を使い、彩度5-10%で統一感を出す
  const neutral50 = formatHex({ mode: 'lch', l: 98, c: 3, h: hue });
  const neutral100 = formatHex({ mode: 'lch', l: 96, c: 5, h: hue });
  const neutral200 = formatHex({ mode: 'lch', l: 92, c: 7, h: hue });
  const neutral300 = formatHex({ mode: 'lch', l: 82, c: 10, h: hue });
  const neutral400 = formatHex({ mode: 'lch', l: 65, c: 12, h: hue });
  const neutral500 = formatHex({ mode: 'lch', l: 50, c: 10, h: hue });
  const neutral600 = formatHex({ mode: 'lch', l: 40, c: 8, h: hue });
  const neutral700 = formatHex({ mode: 'lch', l: 30, c: 8, h: hue });
  const neutral800 = formatHex({ mode: 'lch', l: 20, c: 6, h: hue });
  const neutral900 = formatHex({ mode: 'lch', l: 12, c: 5, h: hue });

  // 背景色：極低彩度でキーカラーのトーンを感じさせる
  const bgPrimary = '#ffffff';
  const bgSecondary = formatHex({ mode: 'lch', l: 98, c: 2, h: hue });
  const bgTertiary = formatHex({ mode: 'lch', l: 95, c: 4, h: hue });

  return {
    ...base,
    neutral50,
    neutral100,
    neutral200,
    neutral300,
    neutral400,
    neutral500,
    neutral600,
    neutral700,
    neutral800,
    neutral900,
    bgPrimary,
    bgSecondary,
    bgTertiary
  };
}

/**
 * CSS変数としてテーマを適用
 *
 * @param colors - テーマカラー
 */
export function applyThemeVariables(colors: ThemeColors): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Primary色のHSL分解
  const primaryHsl = hexToHsl(colors.primary);
  root.style.setProperty('--color-primary-h', String(primaryHsl.h));
  root.style.setProperty('--color-primary-s', `${primaryHsl.s}%`);
  root.style.setProperty('--color-primary-l', `${primaryHsl.l}%`);

  // Secondary, Dangerは直接設定
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-danger', colors.danger);

  // 拡張パレット（グレー・背景色）を生成して適用
  const extended = generateExtendedPalette(colors.primary);

  // グレー系
  root.style.setProperty('--color-neutral-50', extended.neutral50);
  root.style.setProperty('--color-neutral-100', extended.neutral100);
  root.style.setProperty('--color-neutral-200', extended.neutral200);
  root.style.setProperty('--color-neutral-300', extended.neutral300);
  root.style.setProperty('--color-neutral-400', extended.neutral400);
  root.style.setProperty('--color-neutral-500', extended.neutral500);
  root.style.setProperty('--color-neutral-600', extended.neutral600);
  root.style.setProperty('--color-neutral-700', extended.neutral700);
  root.style.setProperty('--color-neutral-800', extended.neutral800);
  root.style.setProperty('--color-neutral-900', extended.neutral900);

  // 背景色
  root.style.setProperty('--color-bg-primary', extended.bgPrimary);
  root.style.setProperty('--color-bg-secondary', extended.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', extended.bgTertiary);
}
