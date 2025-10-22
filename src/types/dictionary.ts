/**
 * 辞書機能関連の型定義
 */

export type DictionaryTab = 'registration' | 'exception';

export interface RegistrationEntry {
  partNo: string;
  registrationName: string;
}

export interface ExceptionEntry {
  ref: string;
  partNo: string;
  registrationName: string;
}
