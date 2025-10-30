use std::collections::HashMap;

use crate::models::{AppError, ExceptionMasterEntry, IpcMasterRule, ParseResult};

use super::helpers::condition_matches;
use super::ASSIGNED_NAME_KEY;

/// IPC登録名をBOMに適用
///
/// # 動作
/// 1. 例外マスタで部品型番に直接マッチするものを優先適用
/// 2. ルールマスタで条件にマッチするものを適用
/// 3. 結果を"assigned_name"列に格納
///
/// # 引数
/// * `parse` - 元のBOMデータ
/// * `ipc_rules` - IPC登録名ルールのリスト
/// * `exceptions` - 例外マスタエントリのリスト
///
/// # 戻り値
/// "assigned_name"列が追加されたBOMデータ
pub fn apply_ipc_names(
    parse: &ParseResult,
    ipc_rules: Vec<IpcMasterRule>,
    exceptions: Vec<ExceptionMasterEntry>,
) -> Result<ParseResult, AppError> {
    // ------------------------------------------------------------------------
    // ステップ1: 例外マスタのマッピングを作成
    // ------------------------------------------------------------------------

    let mut exception_map: HashMap<String, String> = HashMap::new();
    for entry in exceptions {
        if entry.part_no.trim().is_empty() {
            continue;
        }
        exception_map.insert(entry.part_no.to_lowercase(), entry.output_name.clone());
    }

    // ------------------------------------------------------------------------
    // ステップ2: assigned_name列のインデックスを確認・作成
    // ------------------------------------------------------------------------

    let mut column_roles = parse.column_roles.clone();
    let mut headers = parse.headers.clone();
    let assigned_col_idx: usize;

    // 既存のassigned_name列を探す
    if let Some(existing_indices) = column_roles.get(ASSIGNED_NAME_KEY) {
        if let Some(first_idx_str) = existing_indices.first() {
            assigned_col_idx = first_idx_str
                .strip_prefix("col-")
                .and_then(|s| s.parse().ok())
                .unwrap_or(headers.len());
        } else {
            assigned_col_idx = headers.len();
        }
    } else {
        // 新しい列を追加
        assigned_col_idx = headers.len();
        headers.push(ASSIGNED_NAME_KEY.to_string());
        column_roles.insert(
            ASSIGNED_NAME_KEY.to_string(),
            vec![format!("col-{}", assigned_col_idx)],
        );
    }

    // ------------------------------------------------------------------------
    // ステップ3: 各行にIPC登録名を適用
    // ------------------------------------------------------------------------

    let mut new_rows = Vec::with_capacity(parse.rows.len());

    for (row_idx, row) in parse.rows.iter().enumerate() {
        let mut new_row = row.clone();

        // assigned_name列の値を空にしておく
        while new_row.len() <= assigned_col_idx {
            new_row.push(String::new());
        }

        // 部品型番を取得
        let part_no = parse.get_part_no(row_idx);
        if !part_no.is_empty() {
            let part_lower = part_no.to_lowercase();

            // 例外マスタでチェック
            if let Some(output_name) = exception_map.get(&part_lower) {
                new_row[assigned_col_idx] = output_name.clone();
                new_rows.push(new_row);
                continue;
            }

            // ルールマスタでチェック
            if let Some(output_name) = find_matching_ipc_name(parse, row_idx, &ipc_rules) {
                new_row[assigned_col_idx] = output_name;
            }
        }

        new_rows.push(new_row);
    }

    // ------------------------------------------------------------------------
    // ステップ4: 結果のParseResultを作成
    // ------------------------------------------------------------------------

    Ok(ParseResult {
        rows: new_rows,
        column_roles,
        column_order: parse.column_order.clone(),
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors: parse.errors.clone(),
        headers,
        columns: parse.columns.clone(),
        row_numbers: parse.row_numbers.clone(),
        structured_errors: parse.structured_errors.clone(),
    })
}

/// ルールマスタから一致するIPC登録名を検索
///
/// # 引数
/// * `parse` - BOMデータ
/// * `row_idx` - 行インデックス
/// * `rules` - ルールのリスト
///
/// # 戻り値
/// 一致したルールの登録名（見つからない場合はNone）
fn find_matching_ipc_name(
    parse: &ParseResult,
    row_idx: usize,
    rules: &[IpcMasterRule],
) -> Option<String> {
    // ルールは逆順（後ろから）でチェック（優先度の高いものを後で定義する想定）
    for rule in rules.iter().rev() {
        if rule
            .conditions
            .iter()
            .all(|condition| condition_matches(parse, row_idx, condition))
        {
            return Some(rule.output_name.clone());
        }
    }

    None
}
