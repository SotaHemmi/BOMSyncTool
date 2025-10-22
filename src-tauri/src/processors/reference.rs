use crate::models::{AppError, BomRow};

pub fn expand_reference(rows: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    let mut expanded = Vec::new();

    for row in rows {
        let base_row = row;
        let normalized = base_row.r#ref.replace(' ', "");

        if let Some((prefix, start, end)) = parse_reference_range(&normalized) {
            if end < start {
                return Err(AppError::new(format!(
                    "Refの範囲指定が不正です: {}",
                    base_row.r#ref
                )));
            }

            for index in start..=end {
                let mut new_row = base_row.clone();
                new_row.r#ref = format!("{}{}", prefix, index);
                expanded.push(new_row);
            }
        } else {
            expanded.push(base_row);
        }
    }

    Ok(expanded)
}

pub fn split_reference_rows(rows: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    let mut result = Vec::new();

    for row in rows {
        let references: Vec<String> = row
            .r#ref
            .split(',')
            .map(|part| part.trim())
            .filter(|part| !part.is_empty())
            .map(|part| part.to_string())
            .collect();

        if references.len() <= 1 {
            result.push(row);
            continue;
        }

        for reference in references.iter() {
            let mut new_row = row.clone();
            new_row.r#ref = reference.to_string();
            result.push(new_row);
        }
    }

    Ok(result)
}

fn parse_reference_range(reference: &str) -> Option<(String, u32, u32)> {
    let parts: Vec<&str> = reference.split('-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start_raw = parts[0];
    let end_raw = parts[1];

    if start_raw.is_empty() || end_raw.is_empty() {
        return None;
    }

    let (start_prefix, start_digits) = split_prefix_digits(start_raw);
    if start_digits.is_empty() {
        return None;
    }

    let (end_prefix, end_digits) = split_prefix_digits(end_raw);
    if end_digits.is_empty() {
        return None;
    }

    let prefix = if !start_prefix.is_empty() {
        start_prefix.clone()
    } else if !end_prefix.is_empty() {
        end_prefix.clone()
    } else {
        return None;
    };

    if !end_prefix.is_empty() && end_prefix != prefix {
        return None;
    }

    let start = start_digits.parse::<u32>().ok()?;
    let end = end_digits.parse::<u32>().ok()?;

    Some((prefix, start, end))
}

fn split_prefix_digits(value: &str) -> (String, String) {
    let prefix: String = value
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    let digits = value.get(prefix.len()..).unwrap_or("").to_string();
    (prefix, digits)
}
