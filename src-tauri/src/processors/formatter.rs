use crate::models::{FormatOptions, ParseResult};

/// フォーマットルールを適用（現在は元データをそのまま返す）
///
/// 将来的に以下のような処理を追加可能:
/// - 取り消し線フラグによる行フィルタ
/// - セル色によるステータス設定
pub fn apply_format_rules(parse: &ParseResult, _options: &FormatOptions) -> ParseResult {
    // 現在はオプションを無視して元データを返す
    // 将来的にフォーマット処理を追加可能
    parse.clone()
}
