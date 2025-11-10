use super::diff_comment;
use crate::models::{AppError, ParseResult};
use csv::WriterBuilder;
use std::collections::HashMap;

/// CSVエクスポート
pub fn export_csv(
    parse: &ParseResult,
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut writer = WriterBuilder::new()
        .has_headers(false)
        .from_writer(Vec::new());

    // ヘッダー行
    let mut header_row = parse.headers.clone();
    if include_comments {
        header_row.push("差分コメント".to_string());
    }
    writer
        .write_record(&header_row)
        .map_err(|e| AppError::new(format!("CSV書き込みエラー: {}", e)))?;

    // データ行
    for (idx, row) in parse.rows.iter().enumerate() {
        let mut output_row = row.clone();
        if include_comments {
            let ref_value = parse.get_ref(idx);
            output_row.push(diff_comment(&ref_value, diff_map));
        }
        writer
            .write_record(&output_row)
            .map_err(|e| AppError::new(format!("CSV書き込みエラー: {}", e)))?;
    }

    let data = writer
        .into_inner()
        .map_err(|e| AppError::new(format!("CSVバッファ取得エラー: {}", e)))?;

    let csv_string =
        String::from_utf8(data).map_err(|e| AppError::new(format!("UTF-8変換エラー: {}", e)))?;

    // UTF-8 BOMを先頭に追加
    Ok(format!("\u{FEFF}{}", csv_string))
}
