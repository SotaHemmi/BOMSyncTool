use crate::models::{BomRow, MasterCondition};

pub fn condition_matches(row: &BomRow, condition: &MasterCondition) -> bool {
    let target_value = match get_field_value(row, &condition.field) {
        Some(value) => value,
        None => return false,
    };

    value_matches(&target_value, &condition.value, &condition.match_type)
}

fn get_field_value(row: &BomRow, field: &str) -> Option<String> {
    let normalized = field.trim().to_lowercase();
    match normalized.as_str() {
        "ref" | "reference" => Some(row.r#ref.clone()),
        "part_no" | "partno" | "partnumber" | "部品型番" => Some(row.part_no.clone()),
        other => {
            for (key, value) in &row.attributes {
                if key.to_lowercase() == other {
                    return Some(value.clone());
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
