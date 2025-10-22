use std::collections::HashMap;

use crate::models::{AppError, BomRow};

use super::diff_comment;

pub fn export_eco(
    rows: &[BomRow],
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut lines = Vec::new();
    for row in rows {
        let value = row.attributes.get("value").cloned().unwrap_or_default();
        let mut line = format!("ADD {} {} {}", row.r#ref, row.part_no, value);
        if include_comments {
            let comment = diff_comment(row, diff_map);
            if !comment.is_empty() {
                line.push(' ');
                line.push_str(&comment);
            }
        }
        lines.push(line);
    }

    Ok(lines.join("\n"))
}

pub fn export_ccf(
    rows: &[BomRow],
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut lines = Vec::new();
    for row in rows {
        let value = row.attributes.get("value").cloned().unwrap_or_default();
        let comment = row.attributes.get("comment").cloned().unwrap_or_default();
        let mut line = format!(
            "REF={},PART={},VALUE={},COMMENT={}",
            row.r#ref, row.part_no, value, comment
        );
        if include_comments {
            let diff_cmt = diff_comment(row, diff_map);
            if !diff_cmt.is_empty() {
                line.push(' ');
                line.push_str(&diff_cmt);
            }
        }
        lines.push(line);
    }

    Ok(lines.join("\r\n"))
}

pub fn export_msf(
    rows: &[BomRow],
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let mut lines = Vec::new();
    for row in rows {
        let value = row.attributes.get("value").cloned().unwrap_or_default();
        let comment = row.attributes.get("comment").cloned().unwrap_or_default();
        let mut parts = vec![row.r#ref.clone(), row.part_no.clone(), value];
        let manufacturer = row
            .attributes
            .get("メーカー")
            .or_else(|| row.attributes.get("Manufacturer"))
            .cloned()
            .unwrap_or_default();
        parts.push(manufacturer);
        parts.push(comment);
        let mut line = parts.join("|");
        if include_comments {
            let diff_cmt = diff_comment(row, diff_map);
            if !diff_cmt.is_empty() {
                line.push('|');
                line.push_str(&diff_cmt);
            }
        }
        lines.push(line);
    }

    Ok(lines.join("\n"))
}
