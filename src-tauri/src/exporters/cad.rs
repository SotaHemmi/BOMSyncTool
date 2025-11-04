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
    let grouped = group_by_part_no(parse, diff_map, include_comments);
    let mut content = String::from("$CCF{\n     DEFINITION{\n");

    // 品番でソート
    let mut sorted_part_nos: Vec<_> = grouped.keys().collect();
    sorted_part_nos.sort();

    for part_no in sorted_part_nos {
        let refs = grouped.get(part_no).unwrap();
        content.push_str(&format!("                {}:{}", part_no, refs[0]));
        for i in 1..refs.len() {
            content.push_str(&format!(",\n                         {}", refs[i]));
        }
        content.push_str(";\n");
    }

    content.push_str("               }\n     NET{\n        }\n    }\n");
    Ok(content)
}

/// MSF形式でエクスポート
pub fn export_msf(
    parse: &ParseResult,
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> Result<String, AppError> {
    let grouped = group_by_part_no(parse, diff_map, include_comments);
    let mut content = String::from("$MSF {\n     SHAPE {\n");

    // 品番でソート
    let mut sorted_part_nos: Vec<_> = grouped.keys().collect();
    sorted_part_nos.sort();

    for part_no in sorted_part_nos {
        let refs = grouped.get(part_no).unwrap();
        content.push_str(&format!("                {}:{}", part_no, refs[0]));
        for i in 1..refs.len() {
            content.push_str(&format!(",\n                         {}", refs[i]));
        }
        content.push_str(";\n");
    }

    content.push_str("           }\n      }\n");
    Ok(content)
}

/// 品番でグルーピング
fn group_by_part_no(
    parse: &ParseResult,
    diff_map: &HashMap<String, String>,
    include_comments: bool,
) -> HashMap<String, Vec<String>> {
    let mut grouped: HashMap<String, Vec<String>> = HashMap::new();

    for (idx, _) in parse.rows.iter().enumerate() {
        let ref_value = parse.get_ref(idx);
        let mut part_no = parse.get_part_no(idx);

        // 空の場合は "(未指定)" とする
        if part_no.is_empty() {
            part_no = "(未指定)".to_string();
        }

        let mut ref_with_comment = ref_value.clone();
        if include_comments {
            let comment = diff_comment(&ref_value, diff_map);
            if !comment.is_empty() {
                ref_with_comment.push_str(&format!(" {}", comment));
            }
        }

        grouped
            .entry(part_no)
            .or_insert_with(Vec::new)
            .push(ref_with_comment);
    }

    grouped
}
