use crate::models::{MasterCondition, ParseResult};

/// 条件が行にマッチするかチェック
///
/// # 引数
/// * `parse` - BOMデータ
/// * `row_idx` - 行インデックス
/// * `condition` - マッチング条件
///
/// # 戻り値
/// マッチする場合true
pub fn condition_matches(parse: &ParseResult, row_idx: usize, condition: &MasterCondition) -> bool {
    let target_value = match get_field_value(parse, row_idx, &condition.field) {
        Some(value) => value,
        None => return false,
    };

    value_matches(&target_value, &condition.value, &condition.match_type)
}

/// 指定したフィールドの値を取得
///
/// # 引数
/// * `parse` - BOMデータ
/// * `row_idx` - 行インデックス
/// * `field` - フィールド名（"ref", "part_no", または列名）
///
/// # 戻り値
/// フィールドの値（見つからない場合はNone）
fn get_field_value(parse: &ParseResult, row_idx: usize, field: &str) -> Option<String> {
    let normalized = field.trim().to_lowercase();

    // 標準的な役割名でチェック
    match normalized.as_str() {
        "ref" | "reference" => {
            let ref_value = parse.get_ref(row_idx);
            if ref_value.is_empty() {
                None
            } else {
                Some(ref_value)
            }
        }
        "part_no" | "partno" | "partnumber" | "部品型番" => {
            let part_no = parse.get_part_no(row_idx);
            if part_no.is_empty() {
                None
            } else {
                Some(part_no)
            }
        }
        "manufacturer" | "メーカー" => {
            let mfr = parse.get_manufacturer(row_idx);
            if mfr.is_empty() {
                None
            } else {
                Some(mfr)
            }
        }
        "value" | "値" => {
            let value = parse.get_value(row_idx);
            if value.is_empty() {
                None
            } else {
                Some(value)
            }
        }
        _ => {
            // その他のフィールド名は列名として扱う
            // ヘッダーから該当する列を探す
            let row = parse.rows.get(row_idx)?;
            for (col_idx, header) in parse.headers.iter().enumerate() {
                if header.to_lowercase() == normalized {
                    if let Some(value) = row.get(col_idx) {
                        if !value.trim().is_empty() {
                            return Some(value.clone());
                        }
                    }
                }
            }
            None
        }
    }
}

pub fn value_matches(target: &str, pattern: &str, match_type: &str) -> bool {
    let target_lower = target.to_lowercase();
    let pattern_lower = pattern.to_lowercase();
    match match_type.trim().to_lowercase().as_str() {
        "equals" => target_lower == pattern_lower,
        "contains" => target_lower.contains(&pattern_lower),
        "starts_with" => target_lower.starts_with(&pattern_lower),
        "ends_with" => target_lower.ends_with(&pattern_lower),
        "wildcard" => wildcard_match(&target_lower, &pattern_lower),
        _ => {
            if pattern.contains('*') {
                wildcard_match(&target_lower, &pattern_lower)
            } else {
                target_lower == pattern_lower
            }
        }
    }
}

pub fn wildcard_match(target: &str, pattern: &str) -> bool {
    if pattern == "*" {
        return true;
    }

    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 1 {
        return target == pattern;
    }

    let mut current_index = 0usize;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }

        if i == 0 {
            if !target.starts_with(part) {
                return false;
            }
            current_index = part.len();
            continue;
        }

        if i == parts.len() - 1 {
            return target.ends_with(part);
        }

        if let Some(found) = target[current_index..].find(part) {
            current_index += found + part.len();
        } else {
            return false;
        }
    }

    true
}
