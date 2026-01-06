# Research & Design Decisions

## Summary
- **Feature**: `cli-task-manager`
- **Discovery Scope**: New Feature（グリーンフィールド開発）
- **Key Findings**:
  - Commander.jsが最も軽量で柔軟、サブコマンド形式に適している
  - Unix Domain Socket / Named PipeによるIPC通信が最速かつ堅牢
  - better-sqlite3が同期APIと高速性を両立、小規模データに最適

## Research Log

### CLIフレームワーク選定
- **Context**: タスク管理CLIツールのコマンドインターフェース実装
- **Sources Consulted**:
  - [npm-compare: commander vs yargs vs oclif](https://npm-compare.com/commander,oclif,vorpal,yargs)
  - [npm trends: commander vs oclif vs yargs](https://npmtrends.com/commander-vs-oclif-vs-yargs)
  - [Building CLI Applications Made Easy](https://ibrahim-haouari.medium.com/building-cli-applications-made-easy-with-these-nodejs-frameworks-2c06d1ff7a51)
- **Findings**:
  - Commander.js: 週間238M DL、最軽量、サブコマンドネイティブサポート
  - yargs: 週間138M DL、宣言的構文、バリデーション内蔵、やや冗長
  - oclif: 週間173K DL、TypeScript対応、プラグイン機構、オーバーヘッド大
- **Implications**: 小〜中規模CLIにはCommander.jsが最適。シンプルなAPIで学習コストが低い

### IPC通信方式
- **Context**: 常駐プロセス（サーバー）とCLIクライアント間の通信
- **Sources Consulted**:
  - [node-ipc GitHub](https://github.com/node-ipc/node-ipc)
  - [NodeDaemon GitHub](https://github.com/NodeDaemon/NodeDaemon)
  - [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html)
- **Findings**:
  - Unix Domain Socket: Linux/macOS最速、ネットワークカードをバイパス
  - Named Pipe: Windows互換、Unix Domain Socketと同等のパフォーマンス
  - node-ipc: クロスプラットフォーム対応、自動変換機能あり
  - 代替案: TCP localhost（オーバーヘッド大、ファイアウォール問題）
- **Implications**: Unix Domain Socket + Named Pipe（Windows）のハイブリッド方式を採用

### データ永続化方式
- **Context**: タスクデータのローカル保存
- **Sources Consulted**:
  - [Node.js SQLite Documentation](https://nodejs.org/api/sqlite.html)
  - [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)
  - [lowdb GitHub](https://github.com/typicode/lowdb)
  - [Better Stack: Native SQLite in Node.js](https://betterstack.com/community/guides/scaling-nodejs/nodejs-sqlite/)
- **Findings**:
  - Node.js native SQLite: 実験的、`--experimental-sqlite`フラグ必要
  - better-sqlite3: 最速の同期API、2000+ queries/sec可能
  - lowdb: JSON形式、メモリ上で動作、小規模向け
- **Implications**: 信頼性とシンプルさからJSON形式（lowdb相当の自前実装）を選択。将来的にSQLiteへの移行パスを確保

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Client-Server (IPC) | クライアントCLI + 常駐サーバー | 状態管理が容易、排他制御可能 | プロセス管理の複雑さ | 要件7に適合 |
| Direct File Access | CLIが直接ファイル操作 | シンプル、常駐不要 | 同時アクセス時のデータ破損リスク | 常駐要件を満たさない |
| SQLite WAL Mode | Write-Ahead Loggingで同時アクセス | 並行性改善 | 追加依存、オーバーヘッド | 将来の拡張オプション |

## Design Decisions

### Decision: CLIフレームワーク選定
- **Context**: サブコマンド形式のCLIインターフェース実装
- **Alternatives Considered**:
  1. Commander.js — 軽量、サブコマンドネイティブ、最も人気
  2. yargs — 強力なバリデーション、多言語対応、やや冗長
  3. oclif — TypeScript対応、プラグイン機構、オーバーヘッド大
- **Selected Approach**: Commander.js + TypeScript
- **Rationale**: 小〜中規模CLIに最適、学習コスト最小、十分な機能
- **Trade-offs**: プラグイン機構なし（本プロジェクトでは不要）
- **Follow-up**: TypeScript型定義の設定確認

### Decision: IPC通信方式
- **Context**: クライアント-サーバー間の高速通信
- **Alternatives Considered**:
  1. Unix Domain Socket + Named Pipe — 最速、クロスプラットフォーム
  2. TCP localhost — 汎用、ファイアウォール問題あり
  3. HTTP REST — オーバーヘッド大、不要な複雑さ
- **Selected Approach**: Unix Domain Socket（macOS/Linux）+ Named Pipe（Windows）
- **Rationale**: ネットワークスタックをバイパスし最速、ローカル専用で十分
- **Trade-offs**: プラットフォーム固有コードが必要
- **Follow-up**: Windows環境でのテスト

### Decision: データ永続化方式
- **Context**: タスクデータの保存と読み込み
- **Alternatives Considered**:
  1. JSON file — シンプル、依存なし、小規模向け
  2. better-sqlite3 — 高速、クエリ可能、依存追加
  3. lowdb — JSON + Lodash、追加依存
- **Selected Approach**: JSON file（自前実装）
- **Rationale**: 依存最小化、データ量が小さい、可読性重視
- **Trade-offs**: 複雑なクエリは非効率（将来SQLite移行で対応可能）
- **Follow-up**: アトミック書き込み（一時ファイル + rename）の実装

### Decision: プロセス管理方式
- **Context**: 常駐プロセスの起動・停止・監視
- **Alternatives Considered**:
  1. 自前実装（child_process.fork + detach） — 依存なし、完全制御
  2. pm2 — 高機能、過剰な依存
  3. forever — レガシー、メンテナンス懸念
- **Selected Approach**: 自前実装（Node.js child_process）
- **Rationale**: シンプルな要件に対して外部依存は過剰
- **Trade-offs**: 自動再起動などの高度機能は手動実装が必要
- **Follow-up**: PIDファイルによるプロセス追跡の実装

## Risks & Mitigations
- **データ破損リスク** — アトミック書き込み（tmp + rename）で対応
- **プロセスゾンビ化** — PIDファイルによる状態追跡、起動時のクリーンアップ
- **クロスプラットフォーム互換性** — IPC抽象化レイヤーで差分吸収
- **大量データ時の性能劣化** — 将来SQLite移行パスを確保

## References
- [Commander.js GitHub](https://github.com/tj/commander.js) — CLIフレームワーク
- [node-ipc GitHub](https://github.com/node-ipc/node-ipc) — IPC通信参考
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — 将来の移行先候補
- [Node.js Child Process API](https://nodejs.org/api/child_process.html) — プロセス管理
