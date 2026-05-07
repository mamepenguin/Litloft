# Litloft

自宅LAN向けファイル管理＆メディアストリーミングWebアプリ。Docker で動かし、ブラウザ（PWA対応）からアクセスする。

> **Note:** このプロジェクトは個人用途で開発しています。Issue/PRは歓迎しますが、対応・サポートは保証しません。

> **Warning:** Litloftは信頼できる家庭内ネットワークでの使用を前提としています。インターネットに公開するのに十分なセキュリティは備えていません。外部公開する場合は、リバースプロキシによるHTTPS化やVPN等を自身で構成してください。

<!-- TODO: スクリーンショット（ドライブ一覧 or フォルダブラウザのメイン画面） -->
![Litloft メイン画面](screenshots/main.png)

## 主な機能

- **マルチドライブ** — 用途別にコンテンツ領域を分離（家族ビデオ、音楽、写真など）
- **フォルダブラウザ** — ネストしたフォルダ階層をファイラーのように辿れるUI
- **動画/音声ストリーミング** — Range Request対応、ブラウザ内再生、字幕/キャプション、キャスト
- **画像/ドキュメント閲覧** — プレビュー表示、前後ナビゲーション、Markdown レンダリング（シンタックスハイライト / タスクリスト / Mermaid 対応）
- **アーカイブ閲覧** — ZIP内容一覧表示＋個別エントリ抽出（Shift_JIS対応）
- **プレイリスト** — ユーザー作成プレイリスト＋フォルダ自動再生
- **ファイル操作** — アップロード（フォルダ対応）、リネーム、移動、コピー、削除、テキストファイルのブラウザ内編集、バッチ操作、クリップボード（コピー/カット/ペースト）
- **ゴミ箱** — ソフトデリート＋30日自動パージ、復元対応
- **見つからないファイル（Missing）** — FSから消えたファイルの視聴履歴・タグ・AI データを失わず追跡
- **検索/タグ/お気に入り** — ドライブ内のファイルを素早く見つける
- **セマンティック検索 + Ask** — 埋め込み検索と引用付きの自然言語 Q&A、Whisper 文字起こし、CLIP フレーム検索、AI 要約（長文 Markdown の詳細要約は出典リンク自動付与＋セクション編集対応。単一チャンクに結び付かない行はリンクを出さずプレーン表示）、タグ提案、トランスクリプト AI 修正（intelligence アドオン）
- **ナレッジノート** — ドライブ別の Markdown Vault と Web クリッピング（knowledge アドオン）
- **URL ダウンロード** — yt-dlp ダウンロードと LoftRef 外部 URL 参照（downloader アドオン）
- **フォルダピン留め** — よく使うフォルダへのショートカット
- **コメント / メモ** — ファイルごとのコメント投稿（プロファイル連携）
- **視聴履歴** — レジューム再生、最近再生した動画、視聴進捗トラッキング。動画/音声に加えてテキスト・Markdown・PDF・画像のファイル詳細ページ閲覧も記録対象
- **設定ページ** — `/settings` でプロファイル（ニックネーム）・テーマ（light/dark/system）・言語（ja/en）を一括管理。ドライブのロック状態に関わらずアクセス可能
- **重複ファイル検出** — ハッシュベースの重複検出＋ストレージ統計
- **アクセス制御** — ドライブ単位のパスワード保護（オプション）
- **ドライブ別アドオンポリシー** — `drives.json` でドライブごとにアドオン機能を個別 ON/OFF
- **管理ダッシュボード** — ドライブ統計、スキャン状態、システムヘルス監視、アドオンウィジェット
- **初回セットアップウィザード / 管理設定 GUI** — `/setup`（初回）と `/admin/settings`（以降）からブラウザでドライブ・マスターパスワード・アドオンポリシーを編集。JSON 直書きも引き続き可能
- **ダーク/ライトテーマ** — 切替対応
- **国際化** — 日本語/英語（next-intl、Cookieベースのロケール切替）
- **PWA** — スマホのホーム画面に追加してネイティブアプリのように使える
- **アドオンシステム** — インプロセス/独立サービスの2種類、scope=drive / global で機能拡張

<!-- TODO: スクリーンショット（機能を並べたギャラリー、2〜3枚横並び） -->
<p align="center">
  <img src="screenshots/folder-browser.png" width="32%" alt="フォルダブラウザ" />
  <img src="screenshots/video-player.png" width="32%" alt="動画再生" />
  <img src="screenshots/playlist.png" width="32%" alt="プレイリスト" />
</p>

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Backend | FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| インフラ | Docker Compose (2コンテナ) |

```
ブラウザ → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI, Docker内部のみ)
```

## セットアップ

### 1. docker-compose.yml にドライブディレクトリをマウント

公開したいホスト側ディレクトリを backend にマウントする。マウントしていないディレクトリは backend から見えない。

```yaml
services:
  backend:
    volumes:
      - /path/to/family-videos:/app/drives/family:ro
      - /path/to/tv-recordings:/app/drives/tv:ro
      - /path/to/private:/app/drives/private
      - ./data:/app/data
```

`drives.json` と `passwords.json` は GUI（手順 3）で管理されるため、自分でマウントする必要はない。JSON 直書き派の場合は後述の[手動設定（上級者向け）](#手動設定上級者向け)を参照。

### 2. 起動

```bash
docker compose up -d --build
```

ブラウザで `http://localhost:3000` を開く。LAN内の他デバイスからは `http://<ホストIP>:3000`。

#### Windows での注意事項

- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) の WSL 2 バックエンドを使用すること。
- `docker-compose.yml` のボリュームマウントパスは Windows でもスラッシュを使う（例: `//c/Users/you/Videos:/app/drives/videos`）。または WSL パス（`/mnt/c/Users/you/Videos`）を使用。
- インプロセスアドオンのシンボリックリンクは、開発者モードの有効化または管理者権限が必要。代替としてディレクトリをコピーしてもよい。

### 3. 初回セットアップウィザード

初回起動時、ブラウザは `/setup` にリダイレクトされる。ウィザードは以下のステップで進む:

1. **言語** — ja / en
2. **ドライブ** — 1 件以上追加（表示名、`/app/drives/...` 配下のコンテナ内パス、任意のアクセスグループ）。コンテナ内にパスが存在するかその場で検証する。
3. **アクセスモード** — 「全公開」または「パスワード保護」を選択。
4. **マスターパスワード** — パスワード保護を選んだ場合、手順 2 で使った全グループを含むマスターパスワードを作成する。これでロック解除した viewer が **admin**（以降の設定編集権限を持つ唯一の viewer）になる。
5. **アドオンポリシー** — 各アドオンをドライブごとに ON/OFF（任意。デフォルトは有効）。
6. **完了** — 完了で `/admin` に遷移し、backend コンテナを再起動して反映する。

ウィザードで保存すると、`/admin/*` 配下に **再起動バナー** が表示される。次のコマンドで反映する:

```bash
docker compose restart backend
```

backend が再起動するとバナーは自動的に消える。

### 4. 後から設定を変更する

`/admin/settings`（admin viewer のみアクセス可能）でドライブの追加・削除、パスワード変更、アドオンポリシー切替ができる。保存するたびに restart-pending フラグが立ち、バナーが表示される — 設定反映には `docker compose restart backend` が必要。

> **注意:** `passwords.json` が無い（全公開モード）場合、誰でも `/admin/settings` にアクセスできる。`access_group` を設定したドライブに対応するパスワードが `passwords.json` にないと、そのドライブには永久にアクセスできない。

### 5. LLM 機能（オプション）

intelligence アドオンの LLM 機能（Ask、AI 要約、auto-tags、transcript refine）を使うには `.env` にクレデンシャルを設定:

```bash
LLM_API_KEY=sk-...
```

その後 1 回だけ再ビルド: `docker compose up -d --build`。以降の GUI 設定変更は `docker compose restart backend` で反映できる。

### 6. クラウド文字起こしプロバイダー (cloud STT)

Litloft はローカル Whisper（faster-whisper、CPU 動作）に加えて、以下のクラウド STT プロバイダーに対応します:

| Provider | 強み | 注意 |
|---|---|---|
| OpenAI 互換（Groq / Fireworks 等） | OSS Whisper の延長、API 親和性 | 公式 OpenAI API は 25MB ファイル制限 |
| Deepgram Nova-3 | WER トップクラス、diarization 強力 | 課金別系統 |
| ElevenLabs Scribe | diarization、長尺対応 | 課金別系統 |

設定は `addons/intelligence/search-config.yml` の `transcription` セクション + 各 provider の API key env (`DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` / `OPENAI_API_KEY`)。詳細は [PROVIDERS.md](PROVIDERS.md) を参照。

**プライバシー注意**: クラウド STT を選択すると音声ファイルがプロバイダーに送信されます。プライバシー重視ドライブは `drives.json` の `addons.intelligence.transcription_cloud: false` で **強制ローカル fallback** できます。

### 手動設定（上級者向け）

JSON を直接編集したい場合、GUI は完全に任意:

```bash
cp drives.json.example drives.json
cp passwords.json.example passwords.json   # 任意
```

```json
// drives.json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "テレビ番組", "path": "/app/drives/tv" },
  { "name": "プライベート", "path": "/app/drives/private", "access_group": "private" }
]
```

| プロパティ | 説明 |
|-----------|------|
| `name` | UI上の表示名 |
| `path` | コンテナ内パス（`docker-compose.yml` の volumes でマウント） |
| `access_group` | アクセス制御グループ名（省略で公開ドライブ） |
| `addons` | ドライブ別アドオンポリシー（詳細は [DRIVE-POLICY.md](DRIVE-POLICY.md)） |

```json
// passwords.json
[
  { "password": "family-secret", "groups": ["family"] },
  { "password": "my-master-pw", "groups": ["family", "private"] }
]
```

| フィールド | 説明 |
|-----------|------|
| `password` | ロック解除に使うパスワード |
| `groups` | このパスワードで解除されるグループ名のリスト |

`docker-compose.yml` の backend volumes に追加:

```yaml
services:
  backend:
    volumes:
      - ./drives.json:/app/drives.json
      - ./passwords.json:/app/passwords.json
```

その後 `docker compose up -d --build`。`drives.json` が既に存在する状態で起動した場合、backend は自動的に `data/setup_completed` を作成するため、初回ウィザードはスキップされる。

#### ロック解除の使い方

1. ブラウザで `http://<IP>:3000/unlock` にアクセス（UIにリンクはない）
2. パスワードを入力
3. 「Remember this device」にチェックを入れるとブラウザに記憶される（1年間有効）
4. 「Unlock」をクリックするとトップページにリダイレクトされ、保護ドライブが表示される

ロック解除中はサイドバーに「Lock」ボタンが表示される。

## 開発

```bash
# 起動
docker compose up -d --build

# Backend テスト（Docker内で実行）
docker build -f backend/Dockerfile.test -t litloft-test backend/
docker run --rm litloft-test

# Frontend テスト
cd frontend && pnpm test

# ログ確認
docker compose logs -f backend
```

## 更新

```bash
git pull
docker compose up -d --build
```

コンテナが再ビルド・再起動される。ビルドに失敗した場合、既存のコンテナはそのまま稼働し続ける。

## ライセンス

MIT
