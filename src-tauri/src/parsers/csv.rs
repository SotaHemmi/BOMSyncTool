use std::path::Path;

use csv::ReaderBuilder;

use crate::models::{AppError, ParseResult};

use super::build_bom_rows;

pub fn parse_csv_file(path: &Path) -> Result<ParseResult, AppError> {
    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .from_path(path)
        .map_err(|err| AppError::new(format!("CSVの読み込みに失敗しました: {err}")))?;

    let mut rows = Vec::new();
    for record in reader
        .records()
        .map(|result| result.map(|rec| rec.iter().map(|cell| cell.to_string()).collect()))
    {
        let row: Vec<String> =
            record.map_err(|err| AppError::new(format!("CSVの解析に失敗しました: {err}")))?;
        rows.push(row);
    }

    build_bom_rows(rows)
}
