# HomeVault

自宅LAN向けファイル管理＆メディアストリーミングWebアプリ。Docker で動かし、ブラウザ（PWA対応）からアクセスする。

> **Note:** このプロジェクトは個人用途で開発しています。Issue/PRは歓迎しますが、対応・サポートは保証しません。

> **Warning:** HomeVaultは信頼できる家庭内ネットワークでの使用を前提としています。インターネットに公開するのに十分なセキュリティは備えていません。外部公開する場合は、リバースプロキシによるHTTPS化やVPN等を自身で構成してください。

<!-- TODO: スクリーンショット（ドライブ一覧 or フォルダブラウザのメイン画面） -->
![HomeVault メイン画面](screenshots/main.png)

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
- **セマンティック検索 + Ask** — 埋め込み検索と引用付きの自然言語 Q&A、Whisper 文字起こし、CLIP フレーム検索、AI 要約（長文 Markdown の詳細要約は出典リンク自動付与＋セクション編集対応、幻覚検出の⚠表示付き）、タグ提案、トランスクリプト AI 修正（intelligence アドオン）
- **ナレッジノート** — ドライブ別の Markdown Vault と Web クリッピング（knowledge アドオン）
- **URL ダウンロード** — yt-dlp ダウンロードと HvLink 外部 URL 参照（downloader アドオン）
- **フォルダピン留め** — よく使うフォルダへのショートカット
- **コメント / メモ** — ファイルごとのコメント投稿（プロファイル連携）
- **視聴履歴** — レジューム再生、最近再生した動画、視聴進捗トラッキング
- **重複ファイル検出** — ハッシュベースの重複検出＋ストレージ統計
- **アクセス制御** — ドライブ単位のパスワード保護（オプション）
- **ドライブ別アドオンポリシー** — `drives.json` でドライブごとにアドオン機能を個別 ON/OFF
- **管理ダッシュボード** — ドライブ統計、スキャン状態、システムヘルス監視、アドオンウィジェット
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

### 1. ドライブ設定

`drives.json.example` を参考に `drives.json` を作成:

```bash
cp drives.json.example drives.json
```

```json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "テレビ番組", "path": "/app/drives/tv", "readonly": true },
  { "name": "プライベート", "path": "/app/drives/private", "access_group": "private" }
]
```

| プロパティ | 説明 |
|-----------|------|
| `name` | UI上の表示名 |
| `path` | コンテナ内パス（`docker-compose.yml` の volumes でマウント） |
| `readonly` | `true` でファイル操作を禁止（デフォルト: 書き込み可能） |
| `access_group` | アクセス制御グループ名（省略で公開ドライブ） |
| `addons` | ドライブ別アドオンポリシー（詳細は [DRIVE-POLICY.md](DRIVE-POLICY.md)） |

### 2. docker-compose.yml にドライブをマウント

```yaml
services:
  backend:
    volumes:
      - ./drives.json:/app/drives.json:ro
      - /path/to/family-videos:/app/drives/family:ro
      - /path/to/tv-recordings:/app/drives/tv:ro
      - /path/to/private:/app/drives/private
      - ./data:/app/data
```

### 3. 起動

```bash
docker compose up -d --build
```

ブラウザで `http://localhost:3000` を開く。LAN内の他デバイスからは `http://<ホストIP>:3000`。

#### Windows での注意事項

- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) の WSL 2 バックエンドを使用すること。
- `docker-compose.yml` のボリュームマウントパスは Windows でもスラッシュを使う（例: `//c/Users/you/Videos:/app/drives/videos`）。または WSL パス（`/mnt/c/Users/you/Videos`）を使用。
- インプロセスアドオンのシンボリックリンクは、開発者モードの有効化または管理者権限が必要。代替としてディレクトリをコピーしてもよい。

### 4. アクセス制御（オプション）

特定ドライブをパスワードで保護する場合:

```bash
cp passwords.json.example passwords.json
```

```json
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
- ./passwords.json:/app/passwords.json:ro
```

設定変更後はコンテナの再ビルドが必要: `docker compose up -d --build`

#### ロック解除の使い方

1. ブラウザで `http://<IP>:3000/unlock` にアクセス（UIにリンクはない）
2. パスワードを入力
3. 「Remember this device」にチェックを入れるとブラウザに記憶される（1年間有効）
4. 「Unlock」をクリックするとトップページにリダイレクトされ、保護ドライブが表示される

ロック解除中はサイドバーに「Lock」ボタンが表示される。

> **注意:** `passwords.json` を配置しなければ全ドライブが公開される（デフォルト動作）。`access_group` が設定されたドライブに対応するパスワードが `passwords.json` にないと、そのドライブには永久にアクセスできないため注意。

## 開発

```bash
# 起動
docker compose up -d --build

# Backend テスト（Docker内で実行）
docker build -f backend/Dockerfile.test -t homevault-test backend/
docker run --rm homevault-test

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
