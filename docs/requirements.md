# sahai 要件定義

## 概要

sahai は AI Coding Agent のオーケストレーションツール。
Claude Code と Codex を統合的に管理・実行するための Web ベースのタスク管理システム。

---

## 技術スタック

### Backend
- **Runtime**: Bun
- **Framework**: Hono
- **Language**: TypeScript
- **Database**: SQLite

### Frontend
- **Framework**: React
- **Bundler**: Vite
- **State Management**: Jotai
- **Language**: TypeScript

### 配布
- Bun workspace によるモノレポ構成

---

## 対応エージェント

| エージェント | 優先度 | 備考 |
|-------------|--------|------|
| Claude Code | 初期対応 | Anthropic |
| Codex | 初期対応 | OpenAI |
| (将来拡張) | - | Gemini, Cursor 等 |

各エージェントは共通インターフェースで抽象化し、プラガブルに切り替え可能とする。

---

## データモデル

### 概念図

```
Project (N) ─── (N) Repository (1) ─── (N) Task
                │
        ProjectRepository (中間テーブル)
```

### Project

複数の Repository を束ねる上位概念。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string (UUID) | 主キー |
| name | string | プロジェクト名 |
| description | string? | 説明 |
| created_at | datetime | 作成日時 |
| updated_at | datetime | 更新日時 |

### Repository

GitHub の Repository に相当。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string (UUID) | 主キー |
| name | string | リポジトリ名 |
| path | string | ローカルパス |
| default_branch | string | デフォルトブランチ (main/master) |
| created_at | datetime | 作成日時 |
| updated_at | datetime | 更新日時 |

### ProjectRepository (中間テーブル)

Project と Repository の多対多関係を表現。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| project_id | string (UUID) | Project の ID |
| repository_id | string (UUID) | Repository の ID |
| created_at | datetime | 作成日時 |

※ 複合主キー: (project_id, repository_id)

### Task

エージェントによる1回の作業単位。
Task は作成から完了まで一連の流れを持ち、途中で別のエージェントに切り替えたり、最初からやり直したりすることはできない。
やり直したい場合は、既存の Task を元に新しい Task を作成する (Recreate)。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string (UUID) | 主キー |
| repository_id | string (UUID) | 所属 Repository の ID |
| title | string | タスクタイトル |
| description | string? | タスク説明 |
| status | enum | TODO / InProgress / InReview / Done |
| executor | enum | CLAUDE_CODE / CODEX |
| branch_name | string | 作業ブランチ名 |
| base_branch | string | ベースブランチ |
| worktree_path | string? | Worktree のパス |
| created_at | datetime | 作成日時 |
| updated_at | datetime | 更新日時 |
| started_at | datetime? | 実行開始日時 |
| completed_at | datetime? | 完了日時 |

### ExecutionLog

タスク実行のログ。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string (UUID) | 主キー |
| task_id | string (UUID) | 所属 Task の ID |
| content | string | ログ内容 |
| log_type | enum | stdout / stderr / system |
| created_at | datetime | 作成日時 |

---

## Task の状態遷移

```
┌──────┐    Start    ┌────────────┐   Complete   ┌──────────┐   Finish   ┌──────┐
│ TODO │ ──────────> │ InProgress │ ───────────> │ InReview │ ─────────> │ Done │
└──────┘             └────────────┘              └──────────┘            └──────┘
                           │                          │
                           │ Pause                    │ Resume
                           v                          v
                     ┌──────────┐              ┌────────────┐
                     │   TODO   │              │ InProgress │
                     └──────────┘              └────────────┘
```

### 状態一覧

| 状態 | 説明 |
|------|------|
| TODO | 作成直後。エージェント未実行 |
| InProgress | エージェント実行中 |
| InReview | エージェント完了。コードレビュー待ち |
| Done | 完了。ブランチ削除済み |

### 遷移ルール

| From | To | トリガー | 処理 |
|------|-----|---------|------|
| TODO | InProgress | Start | Worktree 作成、エージェント起動 |
| InProgress | TODO | Pause | エージェント停止 (Worktree は保持) |
| InProgress | InReview | Complete | エージェント完了 |
| InReview | InProgress | Resume | フォローアップ実行 |
| InReview | Done | Finish | Worktree 削除、ブランチ削除 |

### 重要な制約

- **Done は不可逆**: InReview → Done の遷移後、ブランチと Worktree は削除される
- **Recreate**: Done になったタスクを再実行したい場合は、新しい Task を作成する

---

## コア機能

### 1. プロジェクト管理

- Project の CRUD
- Repository の CRUD
- Repository のローカルパス指定

### 2. タスク管理 (Kanban)

- Task の CRUD
- Kanban ボードでの表示 (TODO / InProgress / InReview / Done)
- ドラッグ＆ドロップによる状態変更

### 3. エージェント実行

#### 実行フロー

1. Task を Start
2. Worktree を作成 (ベースブランチから)
3. エージェントを起動
4. リアルタイムでログをストリーミング
5. エージェント完了で InReview に遷移

#### エージェント設定

| 項目 | 説明 |
|------|------|
| executor | 使用するエージェント (CLAUDE_CODE / CODEX) |
| base_branch | ベースブランチ |

### 4. コードレビュー

- Diff 表示
- 行ごとのコメント追加
- コメントの一括送信 (フォローアップ)
- フォローアップ後、InProgress に戻りエージェントが対応

### 5. タスク完了

- InReview から Done へ遷移
- Worktree の削除
- ブランチの削除
- **不可逆操作**

### 6. Git Worktree による分離実行

各 Task は独立した Git Worktree で実行:
- メインブランチへの影響を防止
- タスク間の相互干渉を防止

### 7. リアルタイム通信

- Server-Sent Events (SSE) による実行状況のストリーミング
- stdout/stderr のキャプチャと転送

---

## API 設計 (案)

### Project

| Method | Path | 説明 |
|--------|------|------|
| GET | /v1/projects | Project 一覧取得 |
| POST | /v1/projects | Project 作成 |
| GET | /v1/projects/:id | Project 詳細取得 |
| PUT | /v1/projects/:id | Project 更新 |
| DELETE | /v1/projects/:id | Project 削除 |

### Repository

| Method | Path | 説明 |
|--------|------|------|
| GET | /v1/repositories | Repository 一覧取得 |
| POST | /v1/repositories | Repository 作成 |
| GET | /v1/repositories/:id | Repository 詳細取得 |
| PUT | /v1/repositories/:id | Repository 更新 |
| DELETE | /v1/repositories/:id | Repository 削除 |

### ProjectRepository (関連付け)

| Method | Path | 説明 |
|--------|------|------|
| GET | /v1/projects/:projectId/repositories | Project に属する Repository 一覧 |
| POST | /v1/projects/:projectId/repositories/:repositoryId | Project に Repository を関連付け |
| DELETE | /v1/projects/:projectId/repositories/:repositoryId | Project から Repository の関連を削除 |

### Task

| Method | Path | 説明 |
|--------|------|------|
| GET | /v1/repositories/:repositoryId/tasks | Task 一覧取得 |
| POST | /v1/repositories/:repositoryId/tasks | Task 作成 |
| GET | /v1/tasks/:id | Task 詳細取得 |
| PUT | /v1/tasks/:id | Task 更新 |
| DELETE | /v1/tasks/:id | Task 削除 |
| POST | /v1/tasks/:id/start | Task 開始 (TODO → InProgress) |
| POST | /v1/tasks/:id/pause | Task 一時停止 (InProgress → TODO) |
| POST | /v1/tasks/:id/complete | Task 完了 (InProgress → InReview) |
| POST | /v1/tasks/:id/resume | Task 再開 (InReview → InProgress) |
| POST | /v1/tasks/:id/finish | Task 終了 (InReview → Done) |
| POST | /v1/tasks/:id/recreate | Task 再作成 (新規 Task 作成) |

### Execution

| Method | Path | 説明 |
|--------|------|------|
| GET | /v1/tasks/:id/logs | 実行ログ取得 |
| GET | /v1/tasks/:id/logs/stream | 実行ログストリーム (SSE) |
| GET | /v1/tasks/:id/diff | Diff 取得 |
| POST | /v1/tasks/:id/followup | フォローアップ送信 |

---

## フロントエンド画面構成 (案)

### 1. プロジェクト一覧 (`/`)

- Project のカード一覧
- 新規 Project 作成ボタン

### 2. プロジェクト詳細 (`/projects/:id`)

- Project 情報
- Repository 一覧
- 新規 Repository 追加ボタン

### 3. Repository 詳細 / Kanban (`/repositories/:id`)

- Kanban ボード (TODO / InProgress / InReview / Done)
- Task カードの一覧
- 新規 Task 作成ボタン
- ドラッグ＆ドロップ

### 4. Task 詳細 (`/tasks/:id`)

- Task 情報
- 実行ログ (リアルタイム)
- Diff 表示
- コメント・フォローアップ
- 状態遷移ボタン

---

## Jotai 状態管理 (案)

```typescript
// Projects
const projectsAtom = atom<Project[]>([]);
const selectedProjectAtom = atom<Project | null>(null);

// Repositories
const repositoriesAtom = atom<Repository[]>([]);
const selectedRepositoryAtom = atom<Repository | null>(null);

// Tasks
const tasksAtom = atom<Task[]>([]);
const selectedTaskAtom = atom<Task | null>(null);
const tasksByStatusAtom = atom((get) => {
  const tasks = get(tasksAtom);
  return {
    TODO: tasks.filter(t => t.status === 'TODO'),
    InProgress: tasks.filter(t => t.status === 'InProgress'),
    InReview: tasks.filter(t => t.status === 'InReview'),
    Done: tasks.filter(t => t.status === 'Done'),
  };
});

// Execution
const executionLogsAtom = atom<ExecutionLog[]>([]);
const isExecutingAtom = atom<boolean>(false);
```

---

## ディレクトリ構成 (案)

```
sahai/
├── package.json              # ルート (workspaces)
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts          # エントリーポイント
│   │   ├── db/
│   │   │   ├── schema.ts     # SQLite スキーマ
│   │   │   └── client.ts     # DB クライアント
│   │   ├── routes/
│   │   │   ├── projects.ts
│   │   │   ├── repositories.ts
│   │   │   └── tasks.ts
│   │   ├── services/
│   │   │   ├── git.ts        # Git 操作
│   │   │   ├── worktree.ts   # Worktree 管理
│   │   │   └── executor.ts   # エージェント実行
│   │   ├── executors/
│   │   │   ├── interface.ts  # 共通インターフェース
│   │   │   ├── claude.ts     # Claude Code
│   │   │   └── codex.ts      # Codex
│   │   └── types/
│   │       └── index.ts
│   └── tsconfig.json
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskDetail.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── RepositoryDetail.tsx
│   │   │   └── TaskDetail.tsx
│   │   ├── stores/
│   │   │   └── atoms.ts      # Jotai atoms
│   │   ├── hooks/
│   │   │   └── ...
│   │   └── types/
│   │       └── index.ts
│   ├── index.html
│   └── tsconfig.json
└── shared/
    └── types/
        └── index.ts          # 共有型定義
```

