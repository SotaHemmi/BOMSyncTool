use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

#[derive(Clone, Serialize, Deserialize)]
pub struct BomRow {
    pub r#ref: String,
    pub part_no: String,
    pub attributes: HashMap<String, String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ColumnMeta {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DiffRow {
    pub status: String,
    pub a: Option<BomRow>,
    pub b: Option<BomRow>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub message: String,
    pub row: Option<usize>,
    pub column: Option<usize>,
    pub severity: String, // "error", "warning", "info"
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub bom_data: Vec<BomRow>,
    pub rows: Vec<Vec<String>>,
    pub guessed_columns: HashMap<String, usize>,
    pub guessed_roles: HashMap<String, String>,
    pub errors: Vec<String>,
    pub headers: Vec<String>,
    pub columns: Vec<ColumnMeta>,
    pub row_numbers: Vec<usize>,
    pub structured_errors: Option<Vec<ParseError>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterCondition {
    pub field: String,
    pub match_type: String,
    pub value: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcMasterRule {
    pub rule_name: String,
    pub conditions: Vec<MasterCondition>,
    pub output_name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionMasterEntry {
    pub part_no: String,
    pub output_name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub format: String,
    pub include_diff_comments: bool,
    pub filter: Option<String>,
    pub headers: Vec<String>,
    pub diffs: Option<Vec<DiffRow>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub message: String,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatOptions {
    pub use_strikethrough: bool,
    pub use_cell_color: bool,
}
