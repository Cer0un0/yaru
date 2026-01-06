# Research & Design Decisions

## Summary
- **Feature**: `subtasks-and-descriptions`
- **Discovery Scope**: Extension（既存システムへの機能追加）
- **Key Findings**:
  - 既存Taskインターフェースに`parentId`フィールドを追加することでサブタスク階層を実現可能
  - 既存の短縮ID検索ロジック（`findTaskByIdPrefix`）をサブタスクにも適用可能
  - ストレージ層の変更は不要（TaskStore.tasks配列に親子関係を持つタスクを格納）

## Research Log

### 既存アーキテクチャ分析
- **Context**: サブタスク機能追加のための拡張ポイント特定
- **Sources Consulted**: `src/domain/types.ts`, `src/domain/task-service.ts`, `src/cli/index.ts`
- **Findings**:
  - Task型は`id`, `title`, `description`, `status`, `priority`, タイムスタンプを持つ
  - TaskServiceは`create`, `list`, `get`, `update`, `updateStatus`, `delete`, `search`の7メソッド
  - 短縮ID検索は`findTaskByIdPrefix`関数で実装済み
  - IPCプロトコルでCLI⇔デーモン間通信
- **Implications**:
  - Task型への`parentId?: TaskId`追加で階層構造を表現
  - TaskServiceに`createSubtask`, `listSubtasks`, `getProgress`メソッド追加
  - 既存メソッドへの影響は最小限（delete時のカスケード削除のみ）

### データモデル設計
- **Context**: サブタスク階層をどのように表現するか
- **Sources Consulted**: 既存コードベース分析
- **Findings**:
  - フラットリスト + parentId参照方式が最もシンプル
  - ネストレベルは1階層のみ（サブタスクのサブタスクは許可しない）
  - 親タスク削除時はカスケード削除
- **Implications**:
  - ストレージスキーマ変更不要（tasks配列の構造維持）
  - 後方互換性あり（parentIdはオプショナル）

### 進捗率計算ロジック
- **Context**: 親タスクの進捗をサブタスクから算出する方法
- **Sources Consulted**: 要件定義2.3
- **Findings**:
  - 進捗率 = (完了サブタスク数 / 総サブタスク数) × 100
  - サブタスクが0件の場合は進捗率を表示しない
- **Implications**: TaskServiceに進捗率計算ヘルパー追加

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| フラットリスト + parentId | 全タスクを単一配列に格納、parentIdで親子関係を表現 | シンプル、後方互換性あり、既存ロジック再利用可能 | 深いネストには不向き | 選択：1階層制限により問題なし |
| ネスト構造 | Task型にsubtasks配列を持たせる | 階層が明示的 | ストレージスキーマ変更必要、既存データマイグレーション必要 | 不採用 |

## Design Decisions

### Decision: フラットリスト + parentId方式
- **Context**: サブタスク階層をデータモデルでどう表現するか
- **Alternatives Considered**:
  1. フラットリスト + parentId — 既存配列に親子参照を追加
  2. ネスト構造 — Task型にsubtasks配列を埋め込み
- **Selected Approach**: フラットリスト + parentId方式
- **Rationale**:
  - 既存ストレージスキーマを維持でき、後方互換性あり
  - 既存の検索・フィルタロジックをそのまま活用可能
  - 1階層制限により複雑なネスト管理が不要
- **Trade-offs**:
  - 深い階層には対応不可（現要件では不要）
  - 親子関係の取得にフィルタリングが必要（O(n)だがタスク数は通常少ない）
- **Follow-up**: 将来的に多階層が必要になった場合は再設計を検討

### Decision: サブタスクネスト禁止
- **Context**: サブタスクにさらにサブタスクを持たせるか
- **Alternatives Considered**:
  1. 無制限ネスト許可
  2. 1階層のみ許可
- **Selected Approach**: 1階層のみ許可
- **Rationale**:
  - CLI操作の複雑化を避ける
  - 進捗率計算がシンプルになる
  - 要件定義で深い階層は求められていない
- **Trade-offs**: 柔軟性は低下するが、UXと実装のシンプルさを優先

## Risks & Mitigations
- **既存データの互換性** — parentIdはオプショナルフィールドのため、既存データはそのまま動作
- **親タスク削除時のデータ整合性** — カスケード削除を実装し、孤立サブタスクを防止
- **完了済み親タスクのサブタスク操作** — ステータス変更時にバリデーションを追加

## References
- 既存コードベース: `src/domain/types.ts`, `src/domain/task-service.ts`
- 要件定義: `.kiro/specs/subtasks-and-descriptions/requirements.md`
