use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

// ============================================================================
// 列メタデータ
// ============================================================================

/// 列の識別情報
///
/// # フィールド
/// * `id` - 列ID（例: "col-0", "col-1"）
/// * `name` - 元の列名（ヘッダーテキスト）
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ColumnMeta {
    pub id: String,
    pub name: String,
}

// ============================================================================
// パース結果
// ============================================================================

/// BOMファイルの解析結果を保持する構造体
///
/// # 設計方針
/// - **元データを完全保存**: `rows`フィールドに全セルデータを保持
/// - **データ改変なし**: 空セル、列順序を含め元ファイルを完全に復元可能
/// - **柔軟な列役割管理**: `column_roles`で複数列を同じ役割に割り当て可能
/// - **BomRow型は使用しない**: 必要な時だけヘルパーメソッドで値を取得
///
/// # メモリ効率
/// - 従来のbom_data（構造化データ）を削除することで、メモリ使用量を約50%削減
/// - データの二重保持を回避
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ParseResult {
    /// 元データ（CSV/Excelの全セル）
    ///
    /// 各行は列の配列。空セルも含めて全て保存される。
    /// 例: [["C1", "GRM155...", "0.1uF", "Murata"], ["R1", "RC0402...", "10kΩ", "Yageo"]]
    pub rows: Vec<Vec<String>>,

    /// 列の役割マッピング（複数列対応）
    ///
    /// キー: 役割名（"ref", "part_no", "manufacturer" など）
    /// 値: その役割を持つ列IDの配列
    ///
    /// # 例
    /// ```json
    /// {
    ///   "ref": ["col-0", "col-1"],      // Ref1とRef2の両方
    ///   "part_no": ["col-2"],           // 3列目が部品型番
    ///   "manufacturer": ["col-3"],      // 4列目がメーカー
    /// }
    /// ```
    pub column_roles: HashMap<String, Vec<String>>,

    /// 列の表示順序
    ///
    /// UIでの表示順を制御。通常は以下の順序：
    /// 1. Reference列（複数の場合は全て）
    /// 2. Part_No列
    /// 3. Manufacturer列
    /// 4. その他の列（元の順序を維持）
    ///
    /// 例: ["col-0", "col-2", "col-3", "col-4", "col-1"]
    pub column_order: Vec<String>,

    /// 自動推測された列インデックス（後方互換性のため保持）
    ///
    /// キー: 役割名（"ref", "part_no" など）
    /// 値: 最初にマッチした列のインデックス
    ///
    /// **非推奨**: `column_roles`を使用してください
    #[deprecated(note = "Use column_roles instead")]
    pub guessed_columns: HashMap<String, usize>,

    /// 自動推測された列役割（後方互換性のため保持）
    ///
    /// キー: 列ID（"col-0" など）
    /// 値: 役割名（"ref", "part_no" など）
    ///
    /// **非推奨**: `column_roles`を使用してください
    #[deprecated(note = "Use column_roles instead")]
    pub guessed_roles: HashMap<String, String>,

    /// エラーメッセージのリスト
    pub errors: Vec<String>,

    /// 元のヘッダー行（列名）
    pub headers: Vec<String>,

    /// 列メタデータ
    pub columns: Vec<ColumnMeta>,

    /// 元ファイルでの行番号（1始まり）
    pub row_numbers: Vec<usize>,

    /// 構造化エラー情報
    pub structured_errors: Option<Vec<ParseError>>,
}

impl ParseResult {
    // ========================================================================
    // 値取得ヘルパー
    // ========================================================================

    /// 指定した行の、指定した役割を持つ列の値を全て取得
    ///
    /// # 引数
    /// * `row_index` - 行インデックス（0始まり）
    /// * `role` - 列の役割（"ref", "part_no", "manufacturer" など）
    ///
    /// # 戻り値
    /// その役割を持つ全ての列の値（空文字は除外、トリム済み）
    ///
    /// # 例
    /// ```rust
    /// let refs = parse_result.get_values(0, "ref");
    /// // → ["C1", "C2", "C3"] （3つのReference列がある場合）
    /// ```
    pub fn get_values(&self, row_index: usize, role: &str) -> Vec<String> {
        // 行を取得
        let row = match self.rows.get(row_index) {
            Some(r) => r,
            None => return vec![],
        };

        // その役割を持つ列IDを取得
        let col_ids = match self.column_roles.get(role) {
            Some(ids) => ids,
            None => return vec![],
        };

        // 各列から値を取得
        col_ids
            .iter()
            .filter_map(|col_id| {
                // "col-0" → 0 に変換
                let idx = col_id.strip_prefix("col-")?.parse::<usize>().ok()?;
                row.get(idx)
            })
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()) // 空文字は除外
            .collect()
    }

    /// Reference値を取得（複数列の場合はカンマ区切りで結合）
    ///
    /// # 引数
    /// * `row_index` - 行インデックス
    ///
    /// # 戻り値
    /// Reference値の文字列（複数ある場合は ", " で結合）
    ///
    /// # 例
    /// ```rust
    /// let ref_value = parse_result.get_ref(0);
    /// // → "C1, C2, C3" または "C1" （単一の場合）
    /// ```
    pub fn get_ref(&self, row_index: usize) -> String {
        self.get_values(row_index, "ref").join(", ")
    }

    /// Part_No値を取得（複数列の場合は最初のもの）
    ///
    /// # 引数
    /// * `row_index` - 行インデックス
    ///
    /// # 戻り値
    /// Part_No値の文字列（見つからない場合は空文字）
    pub fn get_part_no(&self, row_index: usize) -> String {
        self.get_values(row_index, "part_no")
            .first()
            .cloned()
            .unwrap_or_default()
    }

    /// Manufacturer値を取得（複数列の場合は最初のもの）
    pub fn get_manufacturer(&self, row_index: usize) -> String {
        self.get_values(row_index, "manufacturer")
            .first()
            .cloned()
            .unwrap_or_default()
    }

    /// Value値を取得（複数列の場合は最初のもの）
    pub fn get_value(&self, row_index: usize) -> String {
        self.get_values(row_index, "value")
            .first()
            .cloned()
            .unwrap_or_default()
    }

    // ========================================================================
    // 列情報ヘルパー
    // ========================================================================

    /// 指定した役割を持つ列のインデックスリストを取得
    ///
    /// # 引数
    /// * `role` - 列の役割
    ///
    /// # 戻り値
    /// 列インデックスの配列（"col-0" → 0 に変換済み）
    pub fn get_column_indices(&self, role: &str) -> Vec<usize> {
        self.column_roles
            .get(role)
            .map(|col_ids| {
                col_ids
                    .iter()
                    .filter_map(|col_id| {
                        col_id
                            .strip_prefix("col-")
                            .and_then(|num| num.parse::<usize>().ok())
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 指定した列IDが指定した役割を持つかチェック
    pub fn has_role(&self, col_id: &str, role: &str) -> bool {
        self.column_roles
            .get(role)
            .map(|ids| ids.contains(&col_id.to_string()))
            .unwrap_or(false)
    }
}

// ============================================================================
// 差分行
// ============================================================================

/// BOM比較の差分結果を表す構造体
///
/// # 設計方針
/// - BomRowを使わず、行インデックスで元データを参照
/// - 変更された列を明示的に記録
///
/// # ステータス
/// - "added": BOM Bにのみ存在
/// - "removed": BOM Aにのみ存在
/// - "modified": 両方に存在するが内容が異なる
/// - "unchanged": 両方に存在し内容が同一
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DiffRow {
    /// 差分ステータス
    pub status: String,

    /// データセットAの行インデックス（存在する場合）
    pub a_index: Option<usize>,

    /// データセットBの行インデックス（存在する場合）
    pub b_index: Option<usize>,

    /// Reference値（比較キー）
    pub ref_value: String,

    /// 変更された列IDのリスト
    ///
    /// status が "modified" の場合のみ使用
    /// 例: ["col-2", "col-3"] （Part_NoとManufacturerが変更された）
    pub changed_columns: Vec<String>,
}

// ============================================================================
// パースエラー
// ============================================================================

/// パース時のエラー・警告情報
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ParseError {
    pub message: String,
    pub row: Option<usize>,
    pub column: Option<usize>,
    /// "error", "warning", "info"
    pub severity: String,
}

// ============================================================================
// IPC Master関連
// ============================================================================

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterCondition {
    pub field: String,
    pub match_type: String,
    pub value: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcMasterRule {
    pub rule_name: String,
    pub conditions: Vec<MasterCondition>,
    pub output_name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionMasterEntry {
    pub part_no: String,
    pub output_name: String,
}

// ============================================================================
// エクスポートオプション
// ============================================================================

/// ファイルエクスポート時のオプション
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    /// 出力フォーマット（"csv", "eco", "ccf", "msf"）
    pub format: String,

    /// 差分コメントを含めるか
    pub include_diff_comments: bool,

    /// フィルタ（"all", "added", "removed", "modified"）
    pub filter: Option<String>,

    /// 出力する列名のリスト
    pub headers: Vec<String>,

    /// 差分情報（差分コメント用）
    pub diffs: Option<Vec<DiffRow>>,
}

// ============================================================================
// フォーマットオプション
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatOptions {
    pub use_strikethrough: bool,
    pub use_cell_color: bool,
}

// ============================================================================
// エラー型
// ============================================================================

/// アプリケーションエラー
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub message: String,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}
