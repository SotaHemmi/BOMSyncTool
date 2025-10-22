/// ヘッダー文字列を正規化（空白除去、小文字化）
pub fn normalize_header(raw: &str) -> String {
    raw.chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
}

/// Referenceを示すヘッダーかどうか判定
/// 複数のRef列パターンに対応（Ref, Ref1, RefDesignator, 部品番号など）
pub fn matches_ref_header(normalized: &str) -> bool {
    // 完全一致パターン（最優先）
    if normalized == "ref"
        || normalized == "reference"
        || normalized == "refdesignator"
        || normalized == "designator"
        || normalized == "部品番号"
        || normalized == "部番"
    {
        return true;
    }

    // 前方一致パターン（Ref1, Ref2など）
    if normalized.starts_with("ref") && normalized.len() <= 5 {
        // Ref, Ref1, Ref2, RefA などを許可
        return true;
    }

    // 部分一致パターン（より厳密に）
    if normalized.contains("refdesignator") || normalized.contains("designator") {
        return true;
    }

    // 日本語パターン
    if normalized.contains("部品番号") || normalized.contains("部番") || normalized.contains("参照") {
        return true;
    }

    false
}

/// 部品型番を示すヘッダーかどうか判定
pub fn matches_part_no_header(normalized: &str) -> bool {
    // 完全一致パターン（最優先）
    if normalized == "partno"
        || normalized == "partnumber"
        || normalized == "partnr"
        || normalized == "part"
        || normalized == "name"
        || normalized == "mpn"
        || normalized == "型番"
        || normalized == "品番"
        || normalized == "部品型番"
        || normalized == "部品名"
    {
        return true;
    }

    // 部分一致パターン（より厳密に）
    // "name" は誤判定が多いので、より厳密にチェック
    if (normalized.contains("partno") || normalized.contains("partnumber") || normalized.contains("part"))
        && !normalized.contains("manufacturer")
        && !normalized.contains("メーカー")
    {
        return true;
    }

    // 日本語パターン
    if normalized.contains("型番") || normalized.contains("品番") {
        return true;
    }

    false
}

/// Valueを示すヘッダーかどうか判定
pub fn matches_value_header(normalized: &str) -> bool {
    // 完全一致パターン
    if normalized == "value"
        || normalized == "val"
        || normalized == "値"
        || normalized == "定数"
        || normalized == "仕様"
        || normalized == "数値"
    {
        return true;
    }

    // 部分一致パターン
    if normalized.contains("value") && !normalized.contains("partno") {
        return true;
    }

    // 日本語パターン
    if normalized.contains("仕様") || normalized.contains("定数") {
        return true;
    }

    false
}

/// コメントを示すヘッダーかどうか判定
pub fn matches_comment_header(normalized: &str) -> bool {
    // 完全一致パターン
    if normalized == "comment"
        || normalized == "comments"
        || normalized == "note"
        || normalized == "notes"
        || normalized == "memo"
        || normalized == "remark"
        || normalized == "remarks"
        || normalized == "description"
        || normalized == "desc"
        || normalized == "コメント"
        || normalized == "備考"
        || normalized == "注記"
        || normalized == "説明"
    {
        return true;
    }

    // 部分一致パターン
    if normalized.contains("comment") || normalized.contains("remark") || normalized.contains("note") {
        return true;
    }

    // 日本語パターン
    if normalized.contains("コメント") || normalized.contains("備考") || normalized.contains("注記") {
        return true;
    }

    false
}

/// メーカーを示すヘッダーかどうか判定
pub fn matches_manufacturer_header(normalized: &str) -> bool {
    // 完全一致パターン
    if normalized == "manufacturer"
        || normalized == "mfr"
        || normalized == "mfg"
        || normalized == "maker"
        || normalized == "vendor"
        || normalized == "supplier"
        || normalized == "メーカー"
        || normalized == "製造元"
        || normalized == "供給元"
    {
        return true;
    }

    // 部分一致パターン
    if normalized.contains("manufacturer") || normalized.contains("maker") || normalized.contains("vendor") {
        return true;
    }

    // 日本語パターン
    if normalized.contains("メーカー") || normalized.contains("製造") || normalized.contains("供給") {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_header() {
        assert_eq!(normalize_header("Part No"), "partno");
        assert_eq!(normalize_header("  REF  "), "ref");
    }

    #[test]
    fn test_matches_ref_header() {
        assert!(matches_ref_header("ref"));
        assert!(matches_ref_header("reference"));
        assert!(!matches_ref_header("value"));
    }
}
