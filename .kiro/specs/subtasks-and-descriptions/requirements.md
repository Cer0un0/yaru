# Requirements Document

## Introduction
本仕様は、yaruタスク管理CLIにサブタスク機能とタスク説明機能を追加するためのものです。これにより、ユーザーは複雑なタスクを細分化して管理し、各タスクに詳細な説明を付与できるようになります。

## Requirements

### Requirement 1: サブタスクの作成
**Objective:** As a ユーザー, I want 任意のタスクに対してサブタスクを作成したい, so that 複雑なタスクを小さな作業単位に分割して管理できる

#### Acceptance Criteria
1. When ユーザーが親タスクIDを指定してサブタスク追加コマンドを実行した場合, the Task Service shall 指定された親タスクの子として新しいサブタスクを作成する
2. When サブタスクが作成された場合, the Task Service shall サブタスクに一意のIDを割り当て、親タスクへの参照を保持する
3. If 指定された親タスクIDが存在しない場合, then the Task Service shall エラーメッセージを表示し、サブタスクを作成しない
4. The Task Service shall サブタスクに対してもタイトル、説明、優先度、ステータスのプロパティをサポートする

### Requirement 2: サブタスクの一覧表示
**Objective:** As a ユーザー, I want 親タスクのサブタスクを一覧で確認したい, so that タスクの階層構造と進捗を把握できる

#### Acceptance Criteria
1. When ユーザーがタスク詳細表示コマンドを実行した場合, the CLI shall 親タスクの情報と共にそのサブタスク一覧を表示する
2. When タスク一覧表示時にサブタスクを持つタスクがある場合, the CLI shall サブタスク数を表示する
3. The Task Service shall サブタスクの完了状況に基づいて親タスクの進捗率を計算して表示する

### Requirement 3: サブタスクの編集
**Objective:** As a ユーザー, I want サブタスクの内容を編集したい, so that 作業内容の変更に対応できる

#### Acceptance Criteria
1. When ユーザーがサブタスクIDを指定して更新コマンドを実行した場合, the Task Service shall サブタスクのタイトル、説明、優先度を更新する
2. When サブタスクが更新された場合, the Task Service shall 更新日時を記録する
3. If 指定されたサブタスクIDが存在しない場合, then the Task Service shall エラーメッセージを表示する

### Requirement 4: サブタスクの完了
**Objective:** As a ユーザー, I want サブタスクを完了状態にしたい, so that 細分化した作業の進捗を追跡できる

#### Acceptance Criteria
1. When ユーザーがサブタスク完了コマンドを実行した場合, the Task Service shall サブタスクのステータスを完了に更新する
2. When 全てのサブタスクが完了した場合, the CLI shall 親タスクの完了を提案するメッセージを表示する
3. While 親タスクが完了状態の場合, the Task Service shall サブタスクのステータス変更を許可しない

### Requirement 5: サブタスクの削除
**Objective:** As a ユーザー, I want 不要なサブタスクを削除したい, so that タスクリストを整理できる

#### Acceptance Criteria
1. When ユーザーがサブタスク削除コマンドを実行した場合, the Task Service shall 指定されたサブタスクを削除する
2. When 親タスクが削除された場合, the Task Service shall その親タスクに属する全てのサブタスクも削除する

### Requirement 6: タスク説明の編集
**Objective:** As a ユーザー, I want タスクに任意で説明を追加・編集したい, so that タスクの詳細情報を記録できる

#### Acceptance Criteria
1. When ユーザーがタスク作成時に説明オプションを指定した場合, the Task Service shall タスクに説明を設定する
2. When ユーザーがタスク更新コマンドで説明を指定した場合, the Task Service shall タスクの説明を更新する
3. The Task Service shall 説明フィールドを空にすることを許可する（説明は任意）
4. When タスク詳細表示時に説明が設定されている場合, the CLI shall 説明を表示する

### Requirement 7: 短縮IDによるサブタスク操作
**Objective:** As a ユーザー, I want サブタスクを短縮IDで操作したい, so that コマンド入力を効率化できる

#### Acceptance Criteria
1. The Task Service shall サブタスクに対しても親タスクと同様の短縮ID検索をサポートする
2. If 短縮IDが複数のサブタスクに一致する場合, then the Task Service shall 一意に識別できるようより長いIDの使用を促すエラーメッセージを表示する
