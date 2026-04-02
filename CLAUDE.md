# HomeVault

自宅LAN向けファイル管理＆動画ストリーミングWebアプリ。Mac mini上でDockerで動作する。

## アーキテクチャ

```
ブラウザ → :3000 (Next.js custom server)
  ├─ HTTP  /api/*  → rewrites → :8000 (FastAPI, Docker内部のみ)
  └─ WS    /api/ws → proxy   → :8000 (WebSocket, http-proxy)
```

- **Backend**: FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **インフラ**: Docker Compose (2コンテナ、backendは外部非公開)
- **認証**: オプショナルなパスワード保護（`passwords.json` によるドライブ単位のアクセス制御）

## ディレクトリ構成

```
backend/
  app/
    main.py           # FastAPIエントリーポイント、ルーター登録、startup scan
    config.py          # drives.json からドライブ設定読み取り、DATA_DIR
    database.py        # SQLAlchemy engine, SessionLocal, get_db (DI), マイグレーション
    models.py          # File, Tag, EmptyFolder, PinnedFolder, Playlist, PlaylistItem, WatchHistory モデル (SQLAlchemy ORM)
    schemas.py         # Pydantic スキーマ (リクエスト/レスポンス)
    auth.py            # JWT認証ロジック（トークン生成・検証、アクセスグループ管理）
    nanoid.py          # Nano ID生成ユーティリティ
    routers/
      files.py         # GET/PUT /api/files/{id}, stream, thumbnail, like, tags, batch操作, archive閲覧
      drives.py        # GET /api/drives, folders, files, tags, scan, pins
      playlists.py     # プレイリストCRUD + アイテム操作エンドポイント
      auth.py          # POST /api/auth/unlock, lock, GET status
      uploads.py       # チャンクアップロードエンドポイント
      progress.py      # 視聴履歴・レジューム再生（再生位置保存/取得/削除、viewer_id管理）
      ws.py            # WebSocketエンドポイント（リアルタイム通知）
    services/
      scanner.py       # ドライブ単位の再帰スキャン（全ファイル対応）、DB同期、排他ロック
      filetype.py      # ファイルタイプ分類 (classify, is_hidden)
      fileops.py       # ファイル/フォルダ CRUD 操作（リネーム、移動、削除、作成）
      upload.py        # チャンクアップロード管理（セッション、結合、クリーンアップ）
      thumbnail.py     # ffmpeg/ffprobe サムネイル生成（動画+画像対応）、duration取得
      heic.py          # HEIC→JPEG変換+キャッシュ（pillow-heif使用）
      subtitle.py      # 字幕検出（同一フォルダ内.srt/.vtt自動紐付け）+ SRT→VTT変換
      preview.py       # 動画プレビュースプライトシート生成（8フレーム、オンデマンド+キャッシュ）
      ws.py            # WebSocket接続管理（ConnectionManager、ブロードキャスト）
  tests/               # pytest (Docker内で実行: Dockerfile.test)
  static/
    placeholder.jpg    # サムネイル未生成時のフォールバック画像

frontend/
  src/
    app/
      page.tsx           # / トップ（ドライブ一覧、Server Component）
      drive/[name]/      # ドライブルート（フォルダ+ファイル、Client Component）
      drive/[name]/[...path]/ # サブフォルダブラウザ (Client Component)
      files/[id]/        # ファイル詳細・再生ページ (Client Component)
      unlock/            # パスワード解除ページ (UIにリンクなし)
      layout.tsx         # ルートレイアウト (Inter, PWA meta, dark theme)
      globals.css        # CSS変数 (デザイントークン), Tailwind
    components/
      Sidebar.tsx        # サイドバー（LIBRARY/PLAYLISTS/PINS/TAGS/DRIVES セクション）
      Header.tsx         # ヘッダー・ナビゲーションバー
      FolderBrowser.tsx  # フォルダ一覧 + ファイル一覧の統合表示
      FolderCard.tsx     # フォルダアイテム表示
      Breadcrumb.tsx     # パンくずリスト
      FileCard.tsx       # ファイルカード（file_type でサムネイル/アイコン切替）
      FileGrid.tsx       # グリッド表示
      FileList.tsx       # リスト表示
      FilePreview.tsx    # file_type 分岐プレビュー（video→VideoPlayer、他→情報表示）
      FileTypeIcon.tsx   # ファイルタイプアイコン
      FileActions.tsx    # ファイル操作メニュー（リネーム、移動、削除）
      FolderActions.tsx  # フォルダ操作メニュー
      VideoPlayer.tsx    # 動画プレーヤー（サーバーサイドレジューム対応）
      VideoPreview.tsx   # 動画サムネイルプレビュー（ホバー/長押しでスプライトシートアニメーション）
      AudioPlayer.tsx    # 音声プレーヤー（サーバーサイドレジューム対応）
      PlaylistPanel.tsx # プレイリスト再生パネル（トラックリスト、レイアウト切替）
      PlaylistPicker.tsx # プレイリスト選択ダイアログ（追加先選択用）
      DriveHome.tsx      # ドライブホームページレイアウト
      GlobalSearch.tsx   # グローバル検索
      SortButton.tsx     # ソートオプションボタン
      SelectionBar.tsx   # 複数選択アクションバー
      FavoriteButton.tsx # お気に入りトグルボタン
      TagEditor.tsx      # タグ編集
      TagList.tsx        # タグ一覧表示
      MoveDialog.tsx     # ファイル/フォルダ移動ダイアログ
      RenameDialog.tsx   # リネームダイアログ
      ConfirmDialog.tsx  # 確認ダイアログ
      ContextMenu.tsx    # 右クリックコンテキストメニュー
      CarouselSection.tsx # カルーセルUI
      ArchivePreview.tsx  # ZIPアーカイブ閲覧（一覧+画像ビューア+テキストプレビュー）
      EmptyState.tsx     # 空状態表示
      CurrentDriveProvider.tsx # カレントドライブ Context Provider
      SidebarProvider.tsx     # サイドバー Context Provider
      ThemeProvider.tsx       # テーマ Context Provider
      LanguageSwitcher.tsx    # 言語切替トグル（ja/en）
      ThemeToggle.tsx         # ダーク/ライトテーマ切替
      WebSocketProvider.tsx  # WebSocket接続管理 Context Provider
      ProfileProvider.tsx    # プロファイル（ニックネーム）Context Provider
      ProfileSetup.tsx       # プロファイル初回設定ダイアログ
      ContinueWatchingSection.tsx # 「続きを見る」カルーセルセクション
    i18n/
      config.ts            # next-intl設定（locales, defaultLocale）
      request.ts           # getRequestConfig（Cookie→locale解決）
    messages/
      ja.json              # 日本語翻訳ファイル（170+キー）
      en.json              # 英語翻訳ファイル
    hooks/
      useContextMenu.ts  # コンテキストメニュー hook
      useSelection.ts    # 複数選択状態 hook
      useUpload.ts       # アップロード管理 hook
      useWebSocket.ts    # WebSocketイベント受信 hook
    lib/
      api.ts             # Backend API呼び出しクライアント
      format.ts          # formatDuration, formatFileSize
      recentlyPlayed.ts  # 最近再生した曲の管理
    types/index.ts       # FileItem, Drive, Folder, Tag, PlaylistSummary, PlaylistDetail, WebSocketEvent 等の型定義
  server.js              # Custom Server (WebSocketプロキシ、http-proxy、Docker本番用)

deploy/
  post-receive         # git push → Mac mini 自動デプロイ hook

docker-compose.yml     # backend (expose 8000) + frontend (ports 3000)
drives.json            # ドライブ設定 (git管理外)
drives.json.example    # ドライブ設定サンプル
passwords.json         # アクセス制御パスワード設定 (git管理外)
passwords.json.example # パスワード設定サンプル
data/                  # SQLite DB + サムネイル + .jwt_secret (git管理外)
```

## 開発コマンド

```bash
# 起動
docker compose up -d --build

# Backend テスト (Docker内で実行、ローカルPython 3.14ではpydantic非対応)
docker build -f backend/Dockerfile.test -t video-share-test backend/
docker run --rm video-share-test

# Frontend テスト
cd frontend && pnpm test

# ログ確認
docker compose logs -f backend
```

## API エンドポイント

### ドライブスコープ

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/drives | ドライブ一覧 |
| GET | /api/drives/{drive}/folders?path= | サブフォルダ一覧（名前+ファイル数） |
| GET | /api/drives/{drive}/files?path=&search=&sort=&order=&page=&limit=&favorite=&tag=&type= | ファイル一覧（type でフィルタ可能） |
| GET | /api/drives/{drive}/tags | タグ一覧 |
| POST | /api/drives/{drive}/folders | フォルダ作成 |
| PUT | /api/drives/{drive}/folders | フォルダリネーム |
| DELETE | /api/drives/{drive}/folders?path= | フォルダ削除（空のみ） |
| POST | /api/drives/{drive}/upload/init | アップロード開始 |
| POST | /api/drives/{drive}/upload/{id}/chunk | チャンク送信 |
| POST | /api/drives/{drive}/upload/{id}/complete | アップロード完了 |
| DELETE | /api/drives/{drive}/upload/{id} | アップロードキャンセル |
| GET | /api/drives/{drive}/pins | ピン留めフォルダ一覧 |
| POST | /api/drives/{drive}/pins | フォルダをピン留め |
| DELETE | /api/drives/{drive}/pins?path= | ピン留め解除 |
| POST | /api/drives/{drive}/scan | ドライブ単位スキャン (排他制御、競合時 409) |
| GET | /api/drives/{drive}/playlists | プレイリスト一覧 |
| POST | /api/drives/{drive}/playlists | プレイリスト作成 |
| GET | /api/drives/{drive}/playlists/{id} | プレイリスト詳細（アイテム一覧含む） |
| PUT | /api/drives/{drive}/playlists/{id} | プレイリストリネーム |
| DELETE | /api/drives/{drive}/playlists/{id} | プレイリスト削除 |
| POST | /api/drives/{drive}/playlists/{id}/items | アイテム追加（複数可） |
| DELETE | /api/drives/{drive}/playlists/{id}/items/{item_id} | アイテム削除 |
| PUT | /api/drives/{drive}/playlists/{id}/items/reorder | アイテム並び替え |
| GET | /api/drives/{drive}/watch-history?limit= | 続きを見るリスト（viewer_id別、未完了のみ） |

### 認証

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/auth/unlock | パスワード検証 → JWT Cookie 発行 |
| POST | /api/auth/lock | Cookie 削除（ロック） |
| GET | /api/auth/status | ロック解除状態の確認 |

### グローバル（IDベース）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/health | ヘルスチェック |
| GET | /api/files/{id} | ファイル詳細 |
| GET | /api/files/{id}/neighbors?sort=&order= | 同一フォルダ内の前後ファイルID（sort=random不可） |
| PUT | /api/files/{id} | メタデータ編集 (title, description) |
| GET | /api/files/{id}/stream | ストリーミング (Range Request 206対応、Content-Type は mime_type から動的決定) |
| GET | /api/files/{id}/thumbnail | サムネイル画像 (動画: ffmpeg生成、他: placeholder) |
| GET | /api/files/{id}/preview | 動画プレビュースプライトシート (8フレーム、2560x180 JPEG、オンデマンド生成+キャッシュ) |
| GET | /api/files/{id}/archive | ZIPアーカイブの中身一覧 |
| GET | /api/files/{id}/archive/entry?path= | ZIP内の個別ファイルをストリーム |
| GET | /api/files/{id}/subtitles/{index} | 字幕ストリーム（SRT→VTT自動変換、text/vtt） |
| POST | /api/files/{id}/like | いいね |
| POST | /api/files/{id}/dislike | likes - 1 |
| POST | /api/files/{id}/favorite | お気に入りトグル |
| PUT | /api/files/{id}/tags | タグ編集 |
| PUT | /api/files/{id}/rename | ファイルリネーム |
| PUT | /api/files/{id}/move | ファイル移動 |
| DELETE | /api/files/{id} | ファイル削除 |
| POST | /api/files/batch/get | バッチ取得（IDリスト） |
| POST | /api/files/batch/delete | バッチ削除 |
| PUT | /api/files/batch/move | バッチ移動 |
| PUT | /api/files/batch/tags | バッチタグ更新 |
| POST | /api/files/{id}/progress | 再生位置保存（viewer_id Cookie必須、なしは204） |
| GET | /api/files/{id}/progress | 再生位置取得 |
| DELETE | /api/files/{id}/progress | 再生履歴削除 |

## 重要な設計判断

### アクセス制御
- **独立型グループ**: `drives.json` の `access_group` でドライブをグループに割当、`passwords.json` でパスワードごとに解除するグループを定義
- **JWT Cookie**: `HttpOnly`, `SameSite=Strict`, HMAC-SHA256署名。シークレットは `DATA_DIR/.jwt_secret` に自動生成・永続化
- **保護ドライブの不可視性**: 未ロック時はAPI応答から完全除外（404を返す、403ではない）
- **`/unlock` ページ**: UIにリンクなし、URLを知っている人だけがアクセス
- **「このデバイスを記憶する」**: チェック時は永続Cookie（1年）、未チェック時はセッションCookie
- **`passwords.json` 未配置時**: 全ドライブ公開（既存動作と同じ、graceful degradation）。`docker-compose.yml` にマウント追加も不要
- **`passwords.json` 使用時**: `docker-compose.yml` の backend volumes に `./passwords.json:/app/passwords.json:ro` を追加する必要あり
- 設計書: `docs/superpowers/specs/2026-03-24-drive-access-control-design.md`

### ファイルタイプシステム
- **File テーブル**: 全ファイルの統一モデル（旧 Video テーブルを統合）
- **file_type**: 大分類（video/image/audio/document/archive/subtitle/other）— UIフィルタ・アイコン切替
- **mime_type**: 詳細（video/mp4 等）— Content-Type 決定・プレビュー方式判定
- **duration**: nullable、video/audio のみ ffprobe で取得
- **スキャン**: 隠しファイル（`.` 始まり）と字幕ファイル（`.srt`/`.vtt`）以外の全ファイルを登録
- 分類ロジックは `services/filetype.py` に分離
- 設計書: `docs/superpowers/specs/2026-03-24-file-browsing-extension-design.md`

### サムネイルプレビュー（動画ホバー/長押し）
- **方式**: スプライトシート — 8フレーム（0%～87.5%地点）を横1列に結合した1枚のJPEG（2560×180）
- **生成タイミング**: オンデマンド生成+キャッシュ（HEIC変換・サムネイルと同じパターン）
- **キャッシュ**: `data/previews/{file_id}.jpg` に保存、ファイル削除時・スキャン時に連動削除
- **同時実行制御**: `asyncio.Semaphore(2)` で最大2並列、同一ファイルの重複生成防止（in-progressセット）
- **原子性**: Pillow書き出しは `.tmp` → `os.replace()` で原子的に完了
- **フロントエンド**: デスクトップ=ホバー200ms後にフレーム切替（400ms間隔）、モバイル=長押し500msでプレビュー
- **CSS**: `background-size: 800% 100%` + `background-position` でフレーム切替（HTTPリクエスト1回）

### 字幕・キャプション対応
- **対象**: `.srt`（SubRip）/ `.vtt`（WebVTT）ファイル
- **検出方式**: DBに登録せず、`GET /api/files/{id}` 時にファイルシステムから動的検出
- **自動紐付け**: 同一フォルダ内の `{動画名}.srt` / `{動画名}.vtt` / `{動画名}.{lang}.srt` を検出
- **言語タグ**: `{動画名}.en.srt` → language="en", label="English" のように自動解析（ISO 639-1/3対応）
- **SRT→VTT変換**: ブラウザはVTTのみ対応のため、配信時にサーバーサイドで変換（タイムスタンプの `,` → `.` 変換）
- **API**: `GET /api/files/{id}/subtitles/{index}` で常に `text/vtt` として配信
- **フロント**: VideoPlayer に `<track>` タグで字幕を追加、ブラウザネイティブのCC UI で ON/OFF/言語切替
- **スキャナー除外**: 字幕ファイルは `file_type=subtitle` に分類されるがDBには登録しない（スキャン時にスキップ）

### HEIC画像対応
- **問題**: HEIC（iPhone撮影画像）はChrome/Firefoxで表示不可、Debian aptのffmpegはlibheif未対応でサムネイル真っ黒
- **解決**: `pillow-heif` + Pillow によるサーバーサイドJPEG変換
- **サムネイル**: HEICの場合はffmpegの代わりにPillowで生成（EXIF Orientation適用）
- **フル画像**: streamエンドポイントでHEIC検出時にJPEGに変換して配信（`Content-Type: image/jpeg`）
- **キャッシュ**: 変換結果は `data/converted/{hash}.jpg` に保存、2回目以降はキャッシュから配信
- **クリーンアップ**: ファイル削除時にキャッシュも連動削除
- **対象MIME型**: `image/heic`, `image/heif`, `image/heic-sequence`, `image/heif-sequence`
- 設計書: `docs/superpowers/specs/2026-04-02-heic-support-design.md`

### i18n（国際化）
- **ライブラリ**: next-intl（Next.js 16 App Router + Server Component対応）
- **ルーティング方式**: Cookie-only（`NEXT_LOCALE` Cookie）。URLにロケールプレフィックスを含めない
- **対応言語**: `ja`（日本語、デフォルト）、`en`（英語）
- **翻訳ファイル**: `messages/ja.json`, `messages/en.json`（170+キー、19名前空間）
- **Client Component**: `useTranslations('namespace')` でアクセス
- **Server Component**: `getTranslations('namespace')` でアクセス
- **言語切替**: Header内のLanguageSwitcherトグル → Cookie設定 → `router.refresh()`
- **バックエンド**: エラーメッセージはキー化せず、フロント側で表示文言を解決
- **既知の制限**: `format.ts`（相対日時）と `useUpload.ts`（エラーメッセージ）はフック外のためハードコードのまま
- 設計書: `docs/superpowers/specs/2026-04-02-i18n-foundation-design.md`

### WebSocket基盤
- **方式**: Next.js Custom Server（`server.ts`）で `/api/ws` をバックエンドにプロキシ（`http-proxy`使用）
- **選定理由**: 「backendは外部非公開」の設計方針維持、インターネット公開時もシングルオリジンでCookie認証がそのまま動作
- **接続管理**: `ConnectionManager` シングルトンで全接続を管理、ブロードキャスト時に保護ドライブのアクセスグループでフィルタ
- **認証**: JWT Cookie を接続時に読み取り。未認証でも接続許可（全公開モード対応）、保護ドライブ通知のみフィルタ
- **イベント**: `scan:progress`（50件 or 1秒間隔バッチ）、`scan:complete`、`upload:complete`
- **スキャナー連携**: `_scan_and_register` は `run_in_executor` で同期実行のため、`call_soon_threadsafe` で非同期ブロードキャストに橋渡し
- **フロントエンド**: `WebSocketProvider` + `useWebSocket` フック、指数バックオフ再接続（1s→2s→4s→最大30s）、`visibilitychange` で切断/再接続
- **メッセージフォーマット**: `{"event": "scan:progress", "data": {...}}`
- 設計書: `docs/superpowers/specs/2026-04-02-websocket-foundation-design.md`

### ZIPアーカイブ閲覧
- **対象**: ZIPファイルのみ（Python標準`zipfile`ライブラリ、外部依存なし）
- **閲覧方式**: ZIP内のファイル一覧をツリー表示、画像は `ImageGallery` と同じフルスクリーンビューア（prefetch + スライドショー対応）
- **API**: `GET /api/files/{id}/archive`（一覧）、`GET /api/files/{id}/archive/entry?path=`（個別ストリーム）
- **メモリ設計**: `zipfile.infolist()` はヘッダのみ（数KB）、画像は1枚ずつ展開（~500KB）、`asyncio.Semaphore(3)` で同時展開制限
- **セキュリティ**: パストラバーサル防止（`..`拒否）、展開サイズ上限50MB、シンボリックリンク拒否
- **サムネイル**: 未対応（アーカイブアイコンのみ）
- 設計書: `docs/superpowers/specs/2026-03-28-zip-archive-viewer-design.md`

### ドライブ + フォルダ階層
- **ドライブ**: 論理的なコンテンツ領域の分離。タグもドライブ間で独立
- **フォルダ階層**: ファイラーのようにネストしたフォルダを辿れるUI
- ドライブ設定は `drives.json` で管理（DB外）。変更時はコンテナ再起動
- フォルダは `folder_path` カラムから動的算出 + `EmptyFolder` テーブルで空フォルダ表示 + `PinnedFolder` テーブルでピン留め管理
- `drives.json` に `readonly: true` で書き込み禁止（デフォルト: 書き込み可能）
- ドライブ横断操作（検索、お気に入り）は不要。各ドライブは完全に独立
- お気に入りURLは `?view=favorites` クエリパラメータ（フォルダ名との競合回避）
- 設計書: `docs/superpowers/specs/2026-03-24-drives-and-folders-design.md`

### 視聴履歴・レジューム再生
- **プロファイルとアクセス制御は独立**: パスワード認証（JWT `hv_token`）はドライブアクセス制御、プロファイル（Cookie `hv_viewer`）は個人識別。2つは直交
- **ニックネーム方式**: アカウント不要。ニックネームをCookieに保存、サーバー側でSHA-256ハッシュ→viewer_idに変換
- **デバイス間共有**: 同じニックネームを別デバイスで入力すれば同じ履歴を共有
- **プロファイル一覧API不在**: プライバシー保護。他人のviewer_idを知る手段がない
- **プロファイル未設定時**: localStorageフォールバック（既存動作維持）、サーバーへの保存なし（204返却）
- **WatchHistoryテーブル**: `(viewer_id, file_id)` 複合PK、`file_id` CASCADE DELETE
- **「続きを見る」セクション**: ドライブホーム最上部、`playback_position < duration * 0.9` でフィルタ（未完了のみ）
- **FileCard プログレスバー**: サムネイル下部に3px accent色バー（YouTube風）
- **進捗保存間隔**: VideoPlayer/AudioPlayer共に10秒間隔、fire-and-forget
- 設計書: `docs/superpowers/specs/2026-04-02-watch-history-resume-design.md`

### Backend
- `app.config` はモジュール参照で使う (`import app.config as config`)。`from app.config import VIDEOS_DIR` するとテスト時のパス差し替えが効かない。
- Range Request: Rangeヘッダーなしは200で全体配信、ありは206でPartial Content
- パストラバーサル防止: IDベースでDBからfile_pathを取得 → `os.path.realpath()` で正規化 → base_dir配下か検証
- スキャン排他制御: `asyncio.Lock` で同時実行防止、ロック中は 409 Conflict
- サムネイル: 動画はffmpegで5秒目(短い動画は0秒目)を抽出、画像はリサイズ。いずれも320x180 JPEG

### ファイル前後ナビゲーション
- **neighbors API**: `GET /api/files/{id}/neighbors?sort=&order=` で同一フォルダ内の前後ファイルIDを返す。SQLで前後1件ずつ取得（O(1)）
- **安定ソート**: 一覧APIとneighbors APIで `id` によるセカンダリソートを共有し、順序の一貫性を保証
- **sort=random 除外**: ランダム順では前後が定義できないため 422 を返す。一覧からのリンクにもパラメータを付与しない
- **ソート順の引き継ぎ**: 一覧ページのリンクに `?sort=&order=` クエリパラメータを付与し、詳細ページで同じ順序のナビゲーションを提供
- **キーボードショートカット**: 画像・document・otherファイルで `←`/`→` キー有効。video/audioでは動画シークと競合するため無効
- **履歴管理**: 前後移動は `router.replace` で履歴を置き換え、ブラウザ戻るボタンでフォルダ一覧に正しく戻る
- **特殊ビューからの遷移**: お気に入り・タグ等からの遷移ではフォルダ内ナビゲーションとなる（将来プレイリスト機能で拡張予定）
- 設計書: `docs/superpowers/specs/2026-03-25-file-navigation-design.md`

### プレイリスト
- **2種類**: ユーザー作成プレイリスト（DB永続化）+ フォルダ自動プレイリスト（フロントエンドが都度構築）
- **ドライブ内限定**: プレイリストはドライブに紐づき、ドライブ横断不可。ファイル追加時にドライブ一致を検証
- **DB モデル**: `Playlist`（nanoid主キー）+ `PlaylistItem`（auto-increment主キー、position で曲順管理）
- **カスケード削除**: SQLite の `PRAGMA foreign_keys=ON` を有効化し、ファイル削除時にPlaylistItemも自動削除
- **再生画面**: 既存の `/files/[id]` ページに `?playlist={id}` or `?folder_play=1` で起動。`router.replace` で次曲遷移（ImageGalleryと同パターン）
- **レイアウト切替**: デスクトップ動画=シアターモード（縦積み）、デスクトップ音声=サイドパネル、モバイル=縦積み折りたたみ
- **曲順変更**: 上下ボタン（▲▼）で全デバイス共通。ドラッグ&ドロップライブラリは不使用
- **管理UI**: サイドバーのPLAYLISTSセクション + 右クリックメニュー / 選択バーからファイル追加
- **readonlyドライブ**: プレイリストはDBメタデータなので、readonlyドライブでもCRUD可能
- 設計書: `docs/superpowers/specs/2026-03-25-playlist-design.md`

### Frontend
- Next.js 16: `params` は `Promise` 型。Server Component では `await params`、Client Component では `use(params)` または `useParams()`
- トップページ (`/`) は Server Component で `http://backend:8000` に直接fetch
- ドライブ・ファイルページは Client Component で `/api/` (rewrites経由) にfetch
- rewrites (`next.config.ts`): `/api/*` → `http://backend:8000/api/*` でHTTPプロキシ。CORSは不要。
- WebSocket: Custom Server (`server.js`) で `/api/ws` を `http-proxy` 経由でバックエンドにプロキシ（Docker本番用）
- ダークテーマ固定 (CSS変数 `--bg-primary: #0a0a0f` 等)
- ViewToggle の状態は localStorage に保持
- PWA: `manifest.json` + apple-mobile-web-app-capable

### Docker
- backend は `expose` のみ (外部からアクセス不可)、frontend が唯一のエントリーポイント
- backend healthcheck → frontend は `depends_on: condition: service_healthy`
- 各ドライブディレクトリは `:ro` (読み取り専用) でマウント
- `drives.json` は `:ro` でマウント
- `data/` にSQLite DB + サムネイル画像を永続化

## テスト

- **Backend**: pytest, Docker内で実行 (`Dockerfile.test`)。テストfixtureに小さなMP4ファイルを含む。
- **Frontend**: Vitest 3 + jsdom 25 + React Testing Library。
- Vitest 4は rolldown ネイティブバインディング問題あり、3.x を使うこと
- jsdom 29は ESM互換性問題あり、25.x を使うこと

## デプロイ

Mac mini上にbare gitリポジトリ (`~/video-share.git`) を作成し、`post-receive` hookで自動デプロイ。
`docker compose build` 成功時のみ `down` → `up` する（失敗時は現バージョンを維持）。
`drives.json` はホスト固有設定のためgit管理外。`drives.json.example` を参考に作成。

## 設計ドキュメント

- `docs/superpowers/specs/2026-03-23-video-share-design.md` — 詳細設計書
- `docs/superpowers/specs/2026-03-23-video-share-implementation-plan.md` — 実装計画
- `docs/superpowers/specs/2026-03-24-drives-and-folders-design.md` — ドライブ+フォルダ階層設計書
- `docs/superpowers/specs/2026-03-24-file-browsing-extension-design.md` — ファイル閲覧拡張設計書
- `docs/superpowers/specs/2026-03-24-drive-access-control-design.md` — ドライブアクセス制御設計書
- `docs/superpowers/specs/2026-03-24-file-operations-design.md` — ファイル操作設計書
- `docs/superpowers/specs/2026-03-25-folder-pinning-design.md` — フォルダピン留め設計書
- `docs/superpowers/specs/2026-03-25-like-dislike-unification-design.md` — いいね/よくないね統合設計書
- `docs/superpowers/specs/2026-03-25-file-navigation-design.md` — ファイル前後ナビゲーション設計書
- `docs/superpowers/specs/2026-03-28-zip-archive-viewer-design.md` — ZIPアーカイブ閲覧設計書
- `docs/superpowers/specs/2026-04-02-heic-support-design.md` — HEIC画像ブラウザ互換性対応設計書
- `docs/superpowers/specs/2026-04-02-i18n-foundation-design.md` — i18n基盤設計書
- `docs/superpowers/specs/2026-04-02-websocket-foundation-design.md` — WebSocket基盤設計書
- `docs/superpowers/specs/2026-04-02-watch-history-resume-design.md` — 視聴履歴・レジューム再生設計書
- `docs/superpowers/specs/2026-04-02-feature-roadmap.md` — 機能拡張ロードマップ
