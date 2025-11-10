use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::models::{AppError, ColumnMeta, ParseError, ParseResult};

/// CADネットリスト（PADS-ECO/MSF/CCF/PWS/BD/PADSレポート形式）をパース
pub fn parse_cad_file(path: &Path) -> Result<ParseResult, AppError> {
    let content = fs::read_to_string(path)
        .map_err(|e| AppError::new(format!("ファイルの読み込みに失敗しました: {}", e)))?;

    // フォーマットを自動判定
    let format = detect_cad_format(&content)?;

    match format {
        CadFormat::PADSECO => parse_pads_eco_format(&content),
        CadFormat::MSF => parse_msf_shape_format(&content),
        CadFormat::CCF => parse_ccf_definition_format(&content),
        CadFormat::PWS => parse_pws_format(&content),
        CadFormat::BD => parse_bd_format(&content),
        CadFormat::PADSReport => parse_pads_report_format(&content),
    }
}

#[derive(Debug)]
enum CadFormat {
    PADSECO,    // *PADS-ECO*
    MSF,        // $MSF { SHAPE { ... } }
    CCF,        // $CCF{ DEFINITION{ ... } NET{ } }
    PWS,        // Part_No:Ref1,Ref2;
    BD,         // Ref Part_No (スペース区切り)
    PADSReport, // PADSレポート形式
}

fn detect_cad_format(content: &str) -> Result<CadFormat, AppError> {
    let trimmed = content.trim();

    // PADS-ECO形式: *PADS-ECO* を含む
    if trimmed.contains("*PADS-ECO*") {
        return Ok(CadFormat::PADSECO);
    }

    // MSF形式: $MSF で始まる
    if trimmed.starts_with("$MSF") {
        return Ok(CadFormat::MSF);
    }

    // CCF形式: $CCF で始まる
    if trimmed.starts_with("$CCF") {
        return Ok(CadFormat::CCF);
    }

    // PADSレポート形式: 特定のヘッダーを含む
    if trimmed.contains("部品表１レポート") || trimmed.contains("参照名") {
        return Ok(CadFormat::PADSReport);
    }

    // PWS形式: コロンとセミコロンの存在で判定
    if content.contains(':') && content.contains(';') {
        return Ok(CadFormat::PWS);
    }

    // BD形式: 単純なスペース区切り（デフォルト）
    Ok(CadFormat::BD)
}

/// PADS-ECO形式をパース
/// フォーマット例:
/// *PADS-ECO*
/// *PART*
/// C10 0603B104K500CT
/// C12 0603B104K500CT
/// IC8 74VHC08FT(BJ)
/// *END*
/// PADS-ECO形式をパース
///
/// # フォーマット例
/// ```
/// *PADS-ECO*
/// *PART*
/// C10 0603B104K500CT
/// C12 0603B104K500CT
/// IC8 74VHC08FT(BJ)
/// *END*
/// ```
fn parse_pads_eco_format(content: &str) -> Result<ParseResult, AppError> {
    let mut errors = Vec::new();
    let mut raw_rows = Vec::new();
    let mut in_part_section = false;
    let mut row_num = 0;

    for line in content.lines() {
        row_num += 1;
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        // *PART* セクション開始
        if trimmed == "*PART*" {
            in_part_section = true;
            continue;
        }

        // *END* セクション終了
        if trimmed == "*END*" {
            break;
        }

        // *PADS-ECO* ヘッダーをスキップ
        if trimmed.starts_with('*') {
            continue;
        }

        // *PART* セクション内のみパース
        if !in_part_section {
            continue;
        }

        // スペース区切りでRef Part_Noを抽出
        let parts: Vec<&str> = trimmed.split_whitespace().collect();

        if parts.len() < 2 {
            errors.push(ParseError {
                message: format!("列数が不足しています（最低2列必要）: {}", trimmed),
                row: Some(row_num),
                column: None,
                severity: "warning".to_string(),
            });
            continue;
        }

        let ref_value = parts[0].to_string();
        let part_value = parts[1].to_string();

        raw_rows.push(vec![ref_value, part_value]);
    }

    if raw_rows.is_empty() {
        return Err(AppError::new(
            "有効な*PART*セクションが見つかりませんでした。".to_string(),
        ));
    }

    // 列役割マッピングを作成
    let column_roles = HashMap::from([
        ("ref".to_string(), vec!["col-0".to_string()]),
        ("part_no".to_string(), vec!["col-1".to_string()]),
    ]);

    // 列の表示順序（ref → part_no）
    let column_order = vec!["col-0".to_string(), "col-1".to_string()];

    let row_count = raw_rows.len();

    #[allow(deprecated)]
    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        guessed_columns: HashMap::from([("ref".to_string(), 0), ("part_no".to_string(), 1)]),
        guessed_roles: HashMap::from([
            ("col-0".to_string(), "ref".to_string()),
            ("col-1".to_string(), "part_no".to_string()),
        ]),
        errors: errors
            .iter()
            .map(|e: &ParseError| e.message.clone())
            .collect(),
        headers: vec!["Ref".to_string(), "Part No".to_string()],
        columns: vec![
            ColumnMeta {
                id: "col-0".to_string(),
                name: "Ref".to_string(),
            },
            ColumnMeta {
                id: "col-1".to_string(),
                name: "Part No".to_string(),
            },
        ],
        row_numbers: (1..=row_count).collect(),
        structured_errors: Some(errors),
    })
}

/// MSF SHAPE形式をパース（逆引き構造）
/// フォーマット例:
/// $MSF {
///      SHAPE {
///                 0603B104K500CT:C10,
///                          C12;
///                 74VHC08FT(BJ):IC8,
///                          IC9,
///                          IC10;
///            }
///      }
fn parse_msf_shape_format(content: &str) -> Result<ParseResult, AppError> {
    parse_reverse_structure(content, "SHAPE")
}

/// CCF DEFINITION形式をパース（逆引き構造）
/// フォーマット例:
/// $CCF{
///      DEFINITION{
///                 0603B104K500CT:C10,
///                          C12;
///                 74VHC08FT(BJ):IC8,
///                          IC9;
///                }
///      NET{
///         }
///     }
fn parse_ccf_definition_format(content: &str) -> Result<ParseResult, AppError> {
    parse_reverse_structure(content, "DEFINITION")
}

/// 逆引き構造（Part_No:Ref1,Ref2;）をパース
///
/// # 引数
/// * `content` - ファイル内容
/// * `section_name` - セクション名（"SHAPE" または "DEFINITION"）
///
/// # 戻り値
/// パース結果
fn parse_reverse_structure(content: &str, section_name: &str) -> Result<ParseResult, AppError> {
    let mut raw_rows = Vec::new();
    let errors = Vec::new();

    // セクションを抽出
    let section_start = format!("{} {{", section_name);
    if let Some(start_idx) = content.find(&section_start) {
        let after_start = &content[start_idx + section_start.len()..];

        // 対応する閉じ括弧を見つける
        let mut brace_count = 1;
        let mut end_idx = 0;
        for (i, c) in after_start.char_indices() {
            if c == '{' {
                brace_count += 1;
            } else if c == '}' {
                brace_count -= 1;
                if brace_count == 0 {
                    end_idx = i;
                    break;
                }
            }
        }

        if end_idx == 0 {
            return Err(AppError::new(format!(
                "{}セクションの閉じ括弧が見つかりません。",
                section_name
            )));
        }

        let section_content = &after_start[..end_idx];

        // Part_No:Ref1,Ref2; のパターンをパース
        for group in section_content.split(';') {
            let group = group.trim();
            if group.is_empty() {
                continue;
            }

            // Part_No:Refs に分割
            if let Some(colon_idx) = group.find(':') {
                let part_no = group[..colon_idx].trim().to_string();
                let refs_str = group[colon_idx + 1..].trim();

                // Refをカンマ区切りで分割
                for ref_item in refs_str.split(',') {
                    let ref_item = ref_item.trim();
                    if ref_item.is_empty() {
                        continue;
                    }

                    let ref_value = ref_item.to_string();
                    let part_value = part_no.clone();

                    raw_rows.push(vec![ref_value, part_value]);
                }
            }
        }
    } else {
        return Err(AppError::new(format!(
            "{}セクションが見つかりませんでした。",
            section_name
        )));
    }

    if raw_rows.is_empty() {
        return Err(AppError::new(
            "有効なデータが見つかりませんでした。".to_string(),
        ));
    }

    // 列役割マッピングを作成
    let column_roles = HashMap::from([
        ("ref".to_string(), vec!["col-0".to_string()]),
        ("part_no".to_string(), vec!["col-1".to_string()]),
    ]);

    // 列の表示順序（ref → part_no）
    let column_order = vec!["col-0".to_string(), "col-1".to_string()];

    let row_count = raw_rows.len();

    #[allow(deprecated)]
    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        guessed_columns: HashMap::from([("ref".to_string(), 0), ("part_no".to_string(), 1)]),
        guessed_roles: HashMap::from([
            ("col-0".to_string(), "ref".to_string()),
            ("col-1".to_string(), "part_no".to_string()),
        ]),
        errors: errors
            .iter()
            .map(|e: &ParseError| e.message.clone())
            .collect(),
        headers: vec!["Ref".to_string(), "Part No".to_string()],
        columns: vec![
            ColumnMeta {
                id: "col-0".to_string(),
                name: "Ref".to_string(),
            },
            ColumnMeta {
                id: "col-1".to_string(),
                name: "Part No".to_string(),
            },
        ],
        row_numbers: (1..=row_count).collect(),
        structured_errors: Some(errors),
    })
}

/// PWS形式をパース
/// フォーマット例:
/// ```
/// /* コメント行 */
/// 0603B104K500CT:C10,C12;
/// 74VHC08FT(BJ):IC8,IC9,IC10;
/// ```
fn parse_pws_format(content: &str) -> Result<ParseResult, AppError> {
    let mut raw_rows = Vec::new();
    let errors = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // スペース削除
        let no_space = trimmed.replace(' ', "");

        // 空行、コメント行、括弧のみの行をスキップ
        if no_space.is_empty()
            || no_space.starts_with("/*")
            || no_space.contains('{')
            || no_space.contains('}')
        {
            continue;
        }

        // Part_No:Refs; のパターンをパース
        if let Some(colon_idx) = no_space.find(':') {
            let part_no = no_space[..colon_idx].trim().to_string();
            let refs_str = no_space[colon_idx + 1..].trim();

            // セミコロンを削除
            let refs_str = refs_str.trim_end_matches(';');

            // Refをカンマ区切りで分割
            for ref_item in refs_str.split(',') {
                let ref_item = ref_item.trim();
                if ref_item.is_empty() {
                    continue;
                }

                raw_rows.push(vec![ref_item.to_string(), part_no.clone()]);
            }
        }
    }

    if raw_rows.is_empty() {
        return Err(AppError::new(
            "有効なPWSデータが見つかりませんでした。".to_string(),
        ));
    }

    // 列役割マッピングを作成
    let column_roles = HashMap::from([
        ("ref".to_string(), vec!["col-0".to_string()]),
        ("part_no".to_string(), vec!["col-1".to_string()]),
    ]);

    let column_order = vec!["col-0".to_string(), "col-1".to_string()];
    let row_count = raw_rows.len();

    #[allow(deprecated)]
    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        guessed_columns: HashMap::from([("ref".to_string(), 0), ("part_no".to_string(), 1)]),
        guessed_roles: HashMap::from([
            ("col-0".to_string(), "ref".to_string()),
            ("col-1".to_string(), "part_no".to_string()),
        ]),
        errors: vec![],
        headers: vec!["Ref".to_string(), "Part No".to_string()],
        columns: vec![
            ColumnMeta {
                id: "col-0".to_string(),
                name: "Ref".to_string(),
            },
            ColumnMeta {
                id: "col-1".to_string(),
                name: "Part No".to_string(),
            },
        ],
        row_numbers: (1..=row_count).collect(),
        structured_errors: Some(errors),
    })
}

/// BD形式をパース
/// フォーマット例:
/// ```
/// C10 0603B104K500CT
/// C12 0603B104K500CT
/// IC8 74VHC08FT(BJ)
/// ```
fn parse_bd_format(content: &str) -> Result<ParseResult, AppError> {
    let mut errors = Vec::new();
    let mut raw_rows = Vec::new();
    let mut row_num = 0;

    for line in content.lines() {
        row_num += 1;
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        // スペース区切りでRef Part_Noを抽出
        let parts: Vec<&str> = trimmed.split_whitespace().collect();

        if parts.len() < 2 {
            errors.push(ParseError {
                message: format!("列数が不足しています（最低2列必要）: {}", trimmed),
                row: Some(row_num),
                column: None,
                severity: "warning".to_string(),
            });
            continue;
        }

        let ref_value = parts[0].to_string();
        let part_value = parts[1].to_string();

        raw_rows.push(vec![ref_value, part_value]);
    }

    if raw_rows.is_empty() {
        return Err(AppError::new(
            "有効なBDデータが見つかりませんでした。".to_string(),
        ));
    }

    let column_roles = HashMap::from([
        ("ref".to_string(), vec!["col-0".to_string()]),
        ("part_no".to_string(), vec!["col-1".to_string()]),
    ]);

    let column_order = vec!["col-0".to_string(), "col-1".to_string()];
    let row_count = raw_rows.len();

    #[allow(deprecated)]
    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        guessed_columns: HashMap::from([("ref".to_string(), 0), ("part_no".to_string(), 1)]),
        guessed_roles: HashMap::from([
            ("col-0".to_string(), "ref".to_string()),
            ("col-1".to_string(), "part_no".to_string()),
        ]),
        errors: errors.iter().map(|e| e.message.clone()).collect(),
        headers: vec!["Ref".to_string(), "Part No".to_string()],
        columns: vec![
            ColumnMeta {
                id: "col-0".to_string(),
                name: "Ref".to_string(),
            },
            ColumnMeta {
                id: "col-1".to_string(),
                name: "Part No".to_string(),
            },
        ],
        row_numbers: (1..=row_count).collect(),
        structured_errors: Some(errors),
    })
}

/// PADSレポート形式をパース
/// フォーマット例:
/// ```
/// 部品表１レポート
/// 参照名       型番           登録名
/// -----------------------------------------
/// C10          XXX            0603B104K500CT
/// C12          YYY            0603B104K500CT
/// ```
fn parse_pads_report_format(content: &str) -> Result<ParseResult, AppError> {
    let mut errors = Vec::new();
    let mut raw_rows = Vec::new();
    let mut row_num = 0;

    for line in content.lines() {
        row_num += 1;
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        // ヘッダー行をスキップ
        if trimmed.contains("部品表１レポート")
            || trimmed.contains("参照名")
            || trimmed.starts_with("---")
            || trimmed.starts_with("===")
        {
            continue;
        }

        // スペース区切りで分割
        let parts: Vec<&str> = trimmed.split_whitespace().collect();

        if parts.len() < 2 {
            errors.push(ParseError {
                message: format!("列数が不足しています: {}", trimmed),
                row: Some(row_num),
                column: None,
                severity: "warning".to_string(),
            });
            continue;
        }

        let ref_value = parts[0].to_string();
        let part_value = parts.last().unwrap().to_string(); // 最終列をPart_Noとする

        raw_rows.push(vec![ref_value, part_value]);
    }

    if raw_rows.is_empty() {
        return Err(AppError::new(
            "有効なPADSレポートデータが見つかりませんでした。".to_string(),
        ));
    }

    let column_roles = HashMap::from([
        ("ref".to_string(), vec!["col-0".to_string()]),
        ("part_no".to_string(), vec!["col-1".to_string()]),
    ]);

    let column_order = vec!["col-0".to_string(), "col-1".to_string()];
    let row_count = raw_rows.len();

    #[allow(deprecated)]
    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        guessed_columns: HashMap::from([("ref".to_string(), 0), ("part_no".to_string(), 1)]),
        guessed_roles: HashMap::from([
            ("col-0".to_string(), "ref".to_string()),
            ("col-1".to_string(), "part_no".to_string()),
        ]),
        errors: errors.iter().map(|e| e.message.clone()).collect(),
        headers: vec!["Ref".to_string(), "Part No".to_string()],
        columns: vec![
            ColumnMeta {
                id: "col-0".to_string(),
                name: "Ref".to_string(),
            },
            ColumnMeta {
                id: "col-1".to_string(),
                name: "Part No".to_string(),
            },
        ],
        row_numbers: (1..=row_count).collect(),
        structured_errors: Some(errors),
    })
}
