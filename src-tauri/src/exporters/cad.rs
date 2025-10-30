use super::diff_comment;
use crate::models::{AppError, ParseResult};
use std::collections::HashMap;

/// PADS-ECO形式でエクスポート
pub fn export_eco(
    parse: &ParseResult,
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut lines = vec!["*PADS-ECO*".to_string(), "*PART*".to_string()];

    for (idx, _) in parse.rows.iter().enumerate() {
        let ref_value = parse.get_ref(idx);
        let part_no = parse.get_part_no(idx);

        let mut line = format!("{} {}", ref_value, part_no);
        if include_comments {
            let comment = diff_comment(&ref_value, diff_map);
            if !comment.is_empty() {
                line.push_str(&format!(" {}", comment));
            }
        }
        lines.push(line);
    }

    lines.push("*END*".to_string());
    Ok(lines.join("\n"))
}

/// CCF形式でエクスポート
pub fn export_ccf(
    parse: &ParseResult,
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut lines = Vec::new();

    for (idx, _) in parse.rows.iter().enumerate() {
        let ref_value = parse.get_ref(idx);
        let part_no = parse.get_part_no(idx);

        let mut line = format!("{}:{};", part_no, ref_value);
        if include_comments {
            let comment = diff_comment(&ref_value, diff_map);
            if !comment.is_empty() {
                line.push_str(&format!(" {}", comment));
            }
        }
        lines.push(line);
    }

    Ok(lines.join("\n"))
}

/// MSF形式でエクスポート
pub fn export_msf(
    parse: &ParseResult,
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    // MSF形式はCCFと同じ構造
    export_ccf(parse, diff_map, include_comments)
}
