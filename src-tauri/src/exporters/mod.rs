pub mod cad;
pub mod csv;

use std::collections::HashMap;

use crate::models::{AppError, DiffRow, ParseResult};

/// BOMファイルをエクスポート
///
/// ParseResultから指定されたフォーマットで出力します
pub fn export_bom_file(
    parse: &ParseResult,
    format: &str,
    diffs: Option<&[DiffRow]>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut diff_map: HashMap<String, String> = HashMap::new();
    if let Some(diffs) = diffs {
        for diff in diffs {
            diff_map.insert(diff.ref_value.clone(), diff.status.clone());
        }
    }

    match format.to_uppercase().as_str() {
        "CSV" => csv::export_csv(parse, &diff_map, include_comments),
        "ECO" => cad::export_eco(parse, &diff_map, include_comments),
        "CCF" => cad::export_ccf(parse, &diff_map, include_comments),
        "MSF" => cad::export_msf(parse, &diff_map, include_comments),
        other => Err(AppError::new(format!(
            "未対応のエクスポート形式です: {}",
            other
        ))),
    }
}

/// 差分コメントを生成
pub fn diff_comment(ref_value: &str, diff_map: &HashMap<String, String>) -> String {
    if let Some(status) = diff_map.get(ref_value) {
        match status.as_str() {
            "added" | "追加" => "←追加".to_string(),
            "removed" | "削除" => "←削除".to_string(),
            "modified" | "変更" => "←変更".to_string(),
            "unchanged" | "同一" => String::new(),
            other => format!("←{}", other),
        }
    } else {
        String::new()
    }
}
