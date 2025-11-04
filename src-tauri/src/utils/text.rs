/// 括弧を削除し、全角文字を半角に変換する
pub fn cleanse_string(input: &str) -> String {
    let without_parentheses = input.replace(['(', ')', '（', '）'], "");
    without_parentheses
        .chars()
        .map(fullwidth_to_halfwidth)
        .collect()
}

/// 全角文字を半角に変換
fn fullwidth_to_halfwidth(c: char) -> char {
    match c {
        '\u{3000}' => ' ',
        '\u{FF01}'..='\u{FF5E}' => char::from_u32((c as u32) - 0xFEE0).unwrap_or(c),
        _ => c,
    }
}

/// 文字列が真偽値として「真」かどうか判定
pub fn is_truthy(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    matches!(
        normalized.as_str(),
        "true" | "1" | "yes" | "y" | "on" | "はい" | "有効"
    )
}

/// セルに無効な文字が含まれていないかチェック
pub fn find_invalid_char(cell: &str) -> Option<char> {
    cell.chars().find(|c| {
        let code = *c as u32;
        (code < 0x20 && *c != '\t')
            || (code >= 0x7f && !(c.is_ascii_graphic() || c.is_ascii_whitespace()))
    })
}

/// セルの色情報をステータス文字列に変換
pub fn color_to_status(value: &str) -> Option<&'static str> {
    let mut normalized = value.trim().to_lowercase();
    if normalized.len() == 6 && normalized.chars().all(|c| c.is_ascii_hexdigit()) {
        normalized = format!("#{}", normalized);
    }

    match normalized.as_str() {
        "#ff0000" | "#ff4d4f" | "red" => Some("removed"),
        "#00b894" | "#00ff00" | "green" => Some("added"),
        "#ffa500" | "#ffb347" | "orange" => Some("modified"),
        "#808080" | "#a9a9a9" | "gray" | "grey" => Some("unchanged"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cleanse_string() {
        assert_eq!(cleanse_string("test(123)"), "test123");
        assert_eq!(cleanse_string("テスト（全角）"), "テスト全角");
    }

    #[test]
    fn test_is_truthy() {
        assert!(is_truthy("true"));
        assert!(is_truthy("1"));
        assert!(is_truthy("YES"));
        assert!(!is_truthy("false"));
        assert!(!is_truthy("0"));
    }
}
