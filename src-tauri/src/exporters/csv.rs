use std::collections::HashMap;

use csv::WriterBuilder;

use crate::models::{AppError, BomRow};

use super::{collect_row_values, diff_comment};

pub fn export_csv(
    rows: &[BomRow],
    headers: &[String],
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut header_fields = headers.to_vec();
    if include_comments {
        header_fields.push("差分コメント".to_string());
    }

    let mut writer = WriterBuilder::new().has_headers(false).from_writer(Vec::new());

    writer
        .write_record(header_fields.iter())
        .map_err(|err| AppError::new(format!("CSVの書き込みに失敗しました: {err}")))?;

    for row in rows {
        let mut values = collect_row_values(row, headers);
        if include_comments {
            values.push(diff_comment(row, diff_map));
        }
        writer
            .write_record(values)
            .map_err(|err| AppError::new(format!("CSVの書き込みに失敗しました: {err}")))?;
    }

    let data = writer
        .into_inner()
        .map_err(|err| AppError::new(format!("CSVバッファの取得に失敗しました: {err}")))?;

    String::from_utf8(data)
        .map_err(|err| AppError::new(format!("CSVエンコードの変換に失敗しました: {err}")))
}
