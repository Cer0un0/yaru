# Implementation Plan

## Overview
yaruタスク管理CLIにサブタスク機能と説明表示オプションを追加する実装タスク。

## Tasks

### Phase 1: Domain Layer

- [x] 1. Task型とエラー型の拡張
- [x] 1.1 Task型にparentIdフィールドを追加
  - `src/domain/types.ts`の`Task`インターフェースに`parentId?: TaskId`を追加
  - _Requirements: 1.2, 1.4_
- [x] 1.2 TaskError型にPARENT_COMPLETEDエラーを追加 (P)
  - `type TaskError`に`{ type: 'PARENT_COMPLETED'; parentId: TaskId }`を追加
  - _Requirements: 4.3_

- [x] 2. TaskServiceのサブタスク関連メソッド追加
- [x] 2.1 CreateSubtaskInput型とSubtaskProgress型を定義
  - `src/domain/task-service.ts`に新規インターフェースを追加
  - _Requirements: 1.1, 2.3_
- [x] 2.2 createSubtaskメソッドを実装
  - 親タスク存在確認、ネスト禁止バリデーション、サブタスク生成
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
- [x] 2.3 listSubtasksメソッドを実装
  - 指定された親タスクのサブタスク一覧を返す
  - _Requirements: 2.1_
- [x] 2.4 getProgressメソッドを実装
  - サブタスクの完了率を計算して返す
  - _Requirements: 2.3_

- [x] 3. 既存メソッドの拡張
- [x] 3.1 deleteメソッドにカスケード削除を追加
  - 親タスク削除時に関連サブタスクも削除
  - _Requirements: 5.2_
- [x] 3.2 updateStatusメソッドに親タスク完了チェックを追加
  - サブタスクのステータス変更時に親タスクが完了済みならエラー
  - 全サブタスク完了時のフラグを返す
  - _Requirements: 4.1, 4.2, 4.3_

### Phase 2: IPC Layer

- [x] 4. IPCプロトコルの拡張
- [x] 4.1 新規IPCメソッドを追加
  - `src/infrastructure/ipc-protocol.ts`の`IPCMethod`型に`subtask.create`, `subtask.list`, `subtask.progress`を追加
  - _Requirements: 1.1, 2.1, 2.3_
- [x] 4.2 デーモンのリクエストハンドラを拡張
  - `src/infrastructure/daemon.ts`または`daemon-process.ts`に新規メソッドのハンドラを追加
  - _Requirements: 1.1, 2.1, 2.3_

### Phase 3: CLI Layer

- [x] 5. subtaskサブコマンド群の実装
- [x] 5.1 subtask addコマンドを実装
  - `yaru subtask add <parent-id> <title> [-d description] [-p priority]`
  - _Requirements: 1.1_
- [x] 5.2 subtask doneコマンドを実装 (P)
  - `yaru subtask done <subtask-id>`、全完了時の親タスク完了提案メッセージ
  - _Requirements: 4.1, 4.2_
- [x] 5.3 subtask deleteコマンドを実装 (P)
  - `yaru subtask delete <subtask-id>`
  - _Requirements: 5.1_

- [x] 6. 既存コマンドの拡張
- [x] 6.1 listコマンドをツリー表示に変更
  - 親タスクの下にサブタスクをインデント表示、進捗率[n/m]表示
  - ツリー罫線文字（├, └, │）を使用
  - _Requirements: 2.1, 2.2_
- [x] 6.2 showコマンドにサブタスク一覧と進捗率を追加
  - タスク詳細表示時にサブタスク情報を表示
  - _Requirements: 2.1, 2.3_
- [x] 6.3 -D/--descオプションを実装
  - list, show, searchコマンドに説明表示オプションを追加
  - 説明が空の場合は説明行を省略
  - _Requirements: 6.4_

### Phase 4: Testing

- [x] 7. ユニットテストの実装
- [x] 7.1 Task型とエラー型のテスト (P)
  - `src/domain/types.test.ts`にparentId関連のテストを追加
  - _Requirements: 1.2, 1.4_
- [x] 7.2 TaskServiceサブタスクメソッドのテスト
  - createSubtask: 正常作成、親不存在エラー、ネスト禁止エラー
  - listSubtasks: 正常取得、親不存在エラー
  - getProgress: 0件、一部完了、全完了
  - _Requirements: 1.1-1.4, 2.1, 2.3_
- [x] 7.3 カスケード削除と親完了チェックのテスト (P)
  - delete: 親タスク削除時のサブタスク削除確認
  - updateStatus: 親完了時のエラー、全サブタスク完了時のフラグ
  - _Requirements: 4.1-4.3, 5.2_

- [ ] 8. 統合テストの実装
- [ ] 8.1 CLI→IPC→Domain→Storageのフロー確認
  - サブタスク作成→一覧→完了→削除の一連のワークフロー
  - _Requirements: 1-5_
- [ ] 8.2 後方互換性テスト (P)
  - 既存データファイル（parentIdなし）での動作確認
  - _Requirements: 1.4_

## Dependency Graph

```
1.1 ──┬──> 2.1 ──> 2.2 ──┬──> 4.1 ──> 4.2 ──> 5.1
1.2 ──┘         ├──> 2.3 ──┘              ├──> 5.2
                ├──> 2.4 ──────────────────┤
                ├──> 3.1 ─────────────────> 5.3
                └──> 3.2 ─────────────────> 5.2

6.1, 6.2, 6.3 は Phase 2 完了後に並列実行可能

7.x, 8.x は対応するPhase完了後に実行
```

## Notes

- Phase 1-2は順序依存、Phase 3は一部並列実行可能
- テストは各Phaseの実装完了後に並列実行可能
- 既存の短縮ID検索ロジック（findTaskByIdPrefix）はそのまま利用可能
