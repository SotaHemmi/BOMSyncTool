mod builder;
mod cad;
mod csv;
mod excel;

use std::path::PathBuf;

use crate::models::{AppError, ParseResult};

pub use builder::build_bom_rows;

pub fn parse_bom_file(path: String) -> Result<ParseResult, AppError> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err(AppError::new(format!(
            "ファイルが見つかりません: {}",
            path.display()
        )));
    }

    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .ok_or_else(|| AppError::new("ファイル拡張子を判定できませんでした。"))?;

    match ext.as_str() {
        "csv" => csv::parse_csv_file(&path),
        "xlsx" => excel::parse_excel_file(&path),
        // CADネットリスト形式（ECO/CCF/MSF）
        "eco" | "ccf" | "msf" | "net" => cad::parse_cad_file(&path),
        other => Err(AppError::new(format!(
            "サポートされていないファイル形式です: {}",
            other
        ))),
    }
}
