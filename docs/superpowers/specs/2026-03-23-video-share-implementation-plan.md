# Video Share - 実装計画

設計書: `docs/superpowers/specs/2026-03-23-video-share-design.md`

---

## Phase 0: ドキュメント調査結果（Allowed APIs）

### FastAPI

| API | インポート | 用途 |
|-----|----------|------|
| `StreamingResponse` | `from fastapi.responses import StreamingResponse` | 動画ストリーミング（206 Partial Content） |
| `FileResponse` | `from fastapi.responses import FileResponse` | サムネイル画像配信 |
| `BackgroundTasks` | `from fastapi import BackgroundTasks` | サムネイル生成のバックグラウンド処理 |
| `Depends` | `from fastapi import Depends` | DBセッション依存性注入 |
| `HTTPException` | `from fastapi import HTTPException` | エラーレスポンス |
| `APIRouter` | `from fastapi import APIRouter` | ルーター分割 |
| `Request` | `from fastapi import Request` | Rangeヘッダー取得 |

### SQLAlchemy + SQLite

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker, DeclarativeBase

engine = create_engine(
    "sqlite:///./data/videos.db",
    connect_args={"check_same_thread": False}  # SQLite必須
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Next.js App Router

| API | パターン |
|-----|---------|
| 動的ルート params | `async function Page({ params }: { params: Promise<{ id: string }> })` → `const { id } = await params` |
| クライアントコンポーネント | ファイル先頭に `'use client'` |
| useParams | `import { useParams } from 'next/navigation'` （クライアント側） |
| next.config.ts | `output: 'standalone'` + `rewrites()` で `/api/*` → backend転送 |
| manifest | `public/manifest.json` に配置、`layout.tsx` で `<link rel="manifest">` |

### ffmpeg / ffprobe

```bash
# サムネイル抽出（5秒目、320x180、パディング付き）
ffmpeg -ss 00:00:05 -i input.mp4 -frames:v 1 \
  -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2" \
  -q:v 2 output.jpg

# 動画時間取得（JSON）
ffprobe -v quiet -show_format -print_format json input.mp4
# → format.duration（秒、文字列）
```

### アンチパターン（やってはいけないこと）

- `NEXT_PUBLIC_API_URL` でDocker内部DNS名を使わない（rewrites構成で解決済み）
- SQLAlchemy で `check_same_thread=False` を忘れない
- Range Request で `Content-Range` ヘッダーのフォーマット `bytes start-end/total` を間違えない
- Next.js standalone + custom server.js は併用不可（standalone が自動生成する server.js を使う）
- `100vh` を使わない（`min-h-dvh` を使う）

---

## Phase 1: プロジェクト基盤セットアップ

### 目的
Docker Compose で backend + frontend が起動し、ヘルスチェックが通る状態を作る。

### タスク

#### 1-1. プロジェクトルート設定

- `.gitignore` 作成（`videos/`, `data/`, `node_modules/`, `.next/`, `__pycache__/`, `.env`）
- `docker-compose.yml` 作成（設計書のDocker構成セクション準拠）

#### 1-2. Backend 基盤

- `backend/requirements.txt` 作成
  ```
  fastapi==0.115.*
  uvicorn[standard]==0.34.*
  sqlalchemy==2.0.*
  pydantic==2.*
  ```
- `backend/Dockerfile` 作成（設計書準拠: python:3.12-slim + ffmpeg + curl）
- `backend/app/config.py` — 環境変数から `VIDEOS_DIR`, `DATA_DIR` を読み取り
- `backend/app/database.py` — SQLAlchemy エンジン + セッション + テーブル作成
- `backend/app/models.py` — `Video` モデル（設計書のスキーマ準拠）
- `backend/app/schemas.py` — Pydantic スキーマ（VideoResponse, VideoUpdate, PaginatedResponse）
- `backend/app/main.py` — FastAPI app + `GET /api/health` エンドポイント + 起動時DB初期化

#### 1-3. Frontend 基盤

- `frontend/` を `pnpm create next-app` で生成（TypeScript, Tailwind CSS, App Router）
- `frontend/next.config.ts` — `output: 'standalone'` + rewrites 設定
- `frontend/Dockerfile` 作成（設計書準拠: マルチステージビルド）
- `frontend/src/app/layout.tsx` — ダークテーマ基盤 + Inter フォント + PWA meta タグ
- `frontend/public/manifest.json` — PWA マニフェスト

#### 1-4. Docker 動作確認

- `docker compose up --build` で両コンテナ起動
- `curl http://localhost:3000` → Next.js ページ表示
- `curl http://localhost:3000/api/health` → rewrites 経由で backend の health レスポンス

### 検証チェックリスト

- [ ] `docker compose up --build` がエラーなく完了
- [ ] `GET /api/health` が `200 OK` を返す
- [ ] frontend コンテナが backend のヘルスチェック完了後に起動する
- [ ] `videos/` と `data/` ディレクトリがマウントされている

---

## Phase 2: Backend コア機能

### 目的
動画スキャン、メタデータ管理、サムネイル生成の基盤を実装する。

### タスク

#### 2-1. ディレクトリスキャナー（`backend/app/services/scanner.py`）

- `videos/` 以下を再帰的に走査、`.mp4` ファイルを検出
- カテゴリ判定: トップレベルフォルダ名、直下は「未分類」
- タイトル自動生成（ファイル名 → タイトル変換ルール）
- 新規ファイル → DB登録 + サムネイル生成を BackgroundTasks に追加
- 削除済みファイル → DBレコード削除
- 既存ファイル → スキップ
- 排他ロック（`asyncio.Lock`）で同時実行防止

#### 2-2. サムネイル生成（`backend/app/services/thumbnail.py`）

- `subprocess.run` で ffprobe → duration 取得
- `subprocess.run` で ffmpeg → サムネイル抽出（5秒目 or 0秒目）
- 出力先: `data/thumbnails/{category}/{filename}.jpg`
- エラー時はログ出力して続行（サムネイルなしとして扱う）

#### 2-3. 起動時スキャン

- `main.py` の `@app.on_event("startup")` で初回スキャン実行（BackgroundTasks 代わりに `asyncio.create_task`）

### 検証チェックリスト

- [ ] `videos/` にテスト用MP4を配置 → 起動時にDBレコードが作成される
- [ ] `data/thumbnails/` にサムネイルJPEGが生成される
- [ ] カテゴリが正しく判定される（サブフォルダ名 or 未分類）
- [ ] タイトルが正しく変換される（`my_video.mp4` → `My Video`）
- [ ] 同一ファイルの重複登録がない
- [ ] ファイル削除後の再スキャンでDBレコードが削除される

---

## Phase 3: Backend API エンドポイント

### 目的
設計書の全APIエンドポイントを実装する。

### タスク

#### 3-1. 動画一覧（`backend/app/routers/videos.py`）

- `GET /api/videos` — ページネーション、カテゴリ絞り込み、検索、ソート
- `GET /api/videos/{id}` — 動画詳細
- `PUT /api/videos/{id}` — タイトル・説明の編集（`updated_at` 更新）
- レスポンスは設計書の `{ data, meta }` 形式

#### 3-2. 動画ストリーミング（`backend/app/routers/videos.py`）

- `GET /api/videos/{id}/stream` — Range Request 対応
- `Range` ヘッダー解析 → `206 Partial Content` + `Content-Range` ヘッダー
- Range なしの場合は `200 OK` で全体配信
- パストラバーサル防止: ID → DB → file_path → `realpath()` 検証
- チャンクサイズ: 1MB (1024 * 1024)

#### 3-3. サムネイル配信（`backend/app/routers/videos.py`）

- `GET /api/videos/{id}/thumbnail` — `FileResponse` でJPEG返却
- サムネイル未生成の場合はプレースホルダー画像を返す

#### 3-4. カテゴリ一覧（`backend/app/routers/categories.py`）

- `GET /api/categories` — カテゴリ名 + 動画数のリスト
- SQLAlchemy `group_by` + `func.count`

#### 3-5. スキャン API

- `POST /api/scan` — 手動スキャン（排他ロック、スキャン中は 409）

### 検証チェックリスト

- [ ] `GET /api/videos` がページネーション付きで動画一覧を返す
- [ ] `GET /api/videos?category=旅行` でフィルタが動作する
- [ ] `GET /api/videos?search=xxx` で検索が動作する
- [ ] `GET /api/videos/{id}/stream` で動画が再生可能（curl で Range Request テスト）
- [ ] `GET /api/videos/{id}/thumbnail` でサムネイルが表示される
- [ ] `PUT /api/videos/{id}` でタイトル・説明が更新される
- [ ] `GET /api/categories` がカテゴリと動画数を返す
- [ ] `POST /api/scan` が正常動作し、同時実行時に 409 を返す
- [ ] パストラバーサル攻撃（`../` 含むパス）が 403 で拒否される

---

## Phase 4: Backend テスト

### 目的
pytest でユニットテスト + インテグレーションテストを書き、80%カバレッジを達成する。

### タスク

#### 4-1. テスト基盤

- `backend/tests/conftest.py` — テスト用DBセッション、テスト用FastAPI TestClient、テスト用動画ファイル fixture
- テスト用の小さなMP4ファイルを `backend/tests/fixtures/` に配置

#### 4-2. ユニットテスト

- `backend/tests/test_scanner.py` — タイトル変換、カテゴリ判定、スキャンロジック
- `backend/tests/test_thumbnail.py` — ffmpeg コマンド構築、duration取得

#### 4-3. インテグレーションテスト

- `backend/tests/test_api_videos.py` — 一覧、詳細、編集、ページネーション、検索、ソート
- `backend/tests/test_api_stream.py` — Range Request（206応答、Content-Rangeヘッダー）
- `backend/tests/test_api_categories.py` — カテゴリ一覧
- `backend/tests/test_api_scan.py` — スキャン実行、排他制御（409）
- `backend/tests/test_security.py` — パストラバーサル防止テスト

### 検証チェックリスト

- [ ] `pytest` が全テスト通過
- [ ] `pytest --cov` でカバレッジ 80%以上

---

## Phase 5: Frontend 画面実装

### 目的
設計書の全画面・コンポーネントを実装する。

### タスク

#### 5-1. 共通基盤

- `frontend/src/types/index.ts` — Video, Category, PaginatedResponse 型定義
- `frontend/src/lib/api.ts` — fetch ラッパー（`/api/videos`, `/api/categories` 等）
- `frontend/src/app/globals.css` — CSS変数（デザインシステムのカラートークン）、`touch-action`, `overscroll-behavior`
- Tailwind 設定 — ダークテーマカラー拡張、Inter フォント

#### 5-2. 共通コンポーネント

- `ViewToggle.tsx` — グリッド/リスト切り替え（localStorage保持）、'use client'
- `CategoryNav.tsx` — カテゴリ一覧サイドバー/トップナビ、アクティブ状態ハイライト
- `VideoCard.tsx` — サムネイル + タイトル + 再生時間バッジ + ホバーエフェクト
- `VideoGrid.tsx` — レスポンシブグリッド（1列/2列/3-4列）
- `VideoList.tsx` — リスト表示行

#### 5-3. トップページ（`/`）

- `frontend/src/app/page.tsx` — カテゴリカード一覧 + 全動画表示ボタン
- サーバーコンポーネントで `GET /api/categories` を fetch

#### 5-4. カテゴリ別一覧（`/category/[slug]`）

- `frontend/src/app/category/[slug]/page.tsx`
- 検索バー + ソート + ViewToggle + 動画一覧
- ページネーション（無限スクロール or ページボタン）
- 'use client' で状態管理

#### 5-5. 動画再生ページ（`/videos/[id]`）

- `frontend/src/app/videos/[id]/page.tsx`
- `VideoPlayer.tsx` — `<video>` タグ、`playsInline`, `preload="metadata"`, レスポンシブ
- タイトル・説明表示 + 編集モード（PUT API呼び出し）
- カテゴリへの戻りリンク

#### 5-6. 空状態

- 動画なし、検索結果なし、初回スキャン未実行の各パターン
- Lucide React アイコン + メッセージ + アクションボタン

#### 5-7. PWA アイコン

- `public/icon-192.png`, `public/icon-512.png` — プレースホルダーアイコン生成

### 検証チェックリスト

- [ ] トップページにカテゴリカードが表示される
- [ ] カテゴリクリックで動画一覧に遷移する
- [ ] グリッド/リスト切り替えが動作し、リロード後も保持される
- [ ] 検索・ソートが動作する
- [ ] 動画カードクリックで再生ページに遷移する
- [ ] 動画が再生できる（シーク含む）
- [ ] スマホ幅でレスポンシブ表示される（DevTools で確認）
- [ ] タイトル・説明の編集が保存される
- [ ] 空状態が適切に表示される

---

## Phase 6: Frontend テスト

### 目的
Vitest + React Testing Library でコンポーネントテスト、Playwright でE2Eテストを実装する。

### タスク

#### 6-1. テスト基盤

- Vitest + React Testing Library + jsdom セットアップ
- Playwright セットアップ

#### 6-2. コンポーネントテスト

- `VideoCard` — 描画、サムネイル表示、再生時間フォーマット
- `ViewToggle` — 切り替え動作、localStorage保持
- `VideoPlayer` — video タグの属性（playsInline, preload）

#### 6-3. E2E テスト

- 基本フロー: トップ → カテゴリ選択 → 動画一覧 → 動画再生
- グリッド/リスト切り替え
- 検索
- メタデータ編集

### 検証チェックリスト

- [ ] `pnpm test` が全テスト通過
- [ ] `pnpm test:e2e` が基本フローを通過
- [ ] カバレッジ 80%以上

---

## Phase 7: Docker統合 & デプロイ

### 目的
docker compose で本番構成を完成させ、git push → 自動デプロイを設定する。

### タスク

#### 7-1. Docker 本番確認

- `docker compose up --build` で全機能が動作することを確認
- ヘルスチェックが正常動作することを確認
- コンテナ再起動後もデータが永続化されていることを確認

#### 7-2. デプロイスクリプト

- `deploy/post-receive` 作成（設計書準拠: build → down → up）
- セットアップ手順を `README.md` に記載

#### 7-3. README.md

- プロジェクト概要
- 開発環境セットアップ手順
- Mac mini デプロイ手順（bare git リポジトリ + post-receive hook）
- videos/ ディレクトリの配置方法

### 検証チェックリスト

- [ ] `docker compose up --build` → 全画面・全APIが動作
- [ ] コンテナ停止 → 再起動 → データ永続化を確認
- [ ] `deploy/post-receive` の内容が設計書と一致
- [ ] README の手順に従って初期セットアップが完了できる

---

## Phase 8: 最終検証

### 目的
全体を通しての動作確認とセキュリティチェック。

### タスク

#### 8-1. 機能テスト

- [ ] videos/ に500本程度のMP4を配置して動作確認
- [ ] スマホ実機（Safari/Chrome）で PWA として動作確認
- [ ] ホーム画面追加 → スタンドアロン起動を確認

#### 8-2. セキュリティチェック

- [ ] パストラバーサル攻撃テスト（`../etc/passwd` 等）
- [ ] 大量スキャンリクエストの排他制御確認

#### 8-3. パフォーマンス確認

- [ ] 動画一覧の表示速度（30件/ページ）
- [ ] 動画シーク操作のレスポンス
- [ ] サムネイル表示速度

---

## フェーズ依存関係

```
Phase 1 (基盤) → Phase 2 (Backend コア) → Phase 3 (Backend API) → Phase 4 (Backend テスト)
                                                                         ↓
Phase 1 (基盤) ──────────────────────────→ Phase 5 (Frontend) ──→ Phase 6 (Frontend テスト)
                                                                         ↓
                                                            Phase 7 (Docker & デプロイ) → Phase 8 (最終検証)
```

- Phase 2-3（Backend）と Phase 5（Frontend）は Phase 1 完了後に**並行実行可能**
- Phase 4 は Phase 3 完了後
- Phase 6 は Phase 5 完了後
- Phase 7 は Phase 4 + Phase 6 完了後
- Phase 8 は Phase 7 完了後
