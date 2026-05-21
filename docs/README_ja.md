# Litloft

家庭内 LAN 向けのセルフホスト型ファイル・メディアアプリ。ファイルの閲覧・ストリーミング・検索ができ、必要に応じて LLM によるタグ提案・要約・自然言語 Q&A を利用できます。Docker 上で動作し、ブラウザ（PWA）からアクセスします。

> **LAN 専用。** Litloft は信頼できる家庭内ネットワークでの利用を想定しています。HTTPS リバースプロキシと VPN なしでインターネットに公開しないでください。

> **注記：** 個人利用のために開発されています。Issue や PR は歓迎しますが、サポートはベストエフォートです。

**[ランディングページ](https://mamepenguin.github.io/Litloft/)** · **[ドキュメント](README.md)**

<p align="center">
  <img src="images/user-guide/drive-home-overview.png" width="92%" alt="Litloft ドライブホーム概観" />
</p>

<p align="center">
  <img src="images/screenshot_summary.png" width="45%" alt="引用付きの Litloft AI 要約" />
  <img src="images/user-guide/markdown-viewer-frontmatter-mermaid.png" width="45%" alt="frontmatter と Mermaid を表示する Litloft Markdown ビューア" />
</p>

---

## 機能

### コア
- **フォルダブラウザ** — ネストした階層のナビゲーション、グリッド／リスト表示、サムネイルの遅延読み込み
- **ストリーミング** — Range Request 対応の動画／音声、字幕表示、前回位置からの再開
- **ビューア** — 画像ビューア（スワイプ、見開き）、Markdown（Mermaid、シンタックスハイライト）、PDF、Office、ZIP
- **ファイル操作** — アップロード（フォルダ、チャンク分割）、リネーム、移動、コピー、一括操作、ブラウザ内テキスト編集
- **ゴミ箱** — 30 日後に自動消去するソフト削除。いつでも復元可能
- **検索と発見** — キーワード検索、タグフィルタ、重複検出、ピン留めフォルダ
- **整理** — コレクション、お気に入り、ファイル単位のコメント、再開対応の視聴履歴

### AI（Intelligence アドオン）
- **Ask** — メディアに対する自然言語 Q&A。引用元クリップ付き
- **セマンティック検索** — トランスクリプト・テキスト・画像フレーム（CLIP）を横断する埋め込みベース検索
- **AI 要約** — 短い要約 + 引用が自動リンクされた長文 Markdown
- **オートタグ** — AI が提案するタグ。承認／却下ワークフロー（自動適用はしない）
- **トランスクリプト精緻化** — LLM による ASR 補正。元のテキストは復元用に保持
- **文字起こし** — ローカル動画／音声には faster-Whisper、インポート動画には YouTube 字幕インポート

### システム
- **マルチドライブ** — アクセス制御とアドオンポリシーを独立して持つ複数のコンテンツ領域
- **パスワード保護** — ドライブ単位のアクセスグループ。管理者アクセス用のマスターパスワード
- **管理 UI** — 初回起動ウィザード（`/setup`）、設定 GUI（`/admin/settings`）、ダッシュボード
- **アドオンシステム** — インプロセス型・独立サービス型のアドオン。ドライブスコープまたはグローバル
- **i18n** — 日本語／英語（クッキーベース、URL プレフィックスなし）
- **ダーク／ライトテーマ**、**PWA**（ホーム画面に追加）

---

## クイックスタート

**前提条件：** Git · Docker · Python 3

### 1. クローン

```bash
git clone --recurse-submodules https://github.com/mamepenguin/Litloft
cd Litloft
```

### 2. 設定

**macOS / Linux:**
```bash
python3 configure.py
```

**Windows:**
```bash
py -3 configure.py
```

`configure.py` は Docker 起動前に必要なコンテナの結線を生成し、最後にコンテナの起動を提案します（デフォルトは yes）。以下を尋ねます：

| ステップ | 設定内容 |
|------|--------------------|
| ① ドライブマウント | ドライブ数、ホストパス、各ドライブの slug |
| ② ポート | デフォルト `3000`。必要なら変更 |
| ③ Intelligence アドオン | 独立した AI サービスコンテナを有効化（任意） |
| ④ Knowledge アドオン | 独立した Markdown vault サービスコンテナを有効化（任意） |

**出力ファイル：** `docker-compose.override.yml`、空の `drives.json` / `passwords.json`、必要に応じて `event-hooks.json`、intelligence 有効時は `addons/intelligence/search-config.yml`、ポートやアドオンシークレットが必要な場合は `.env`。

ドライブの表示名、アクセスグループ、パスワード、AI 機能モードは、後でブラウザから設定します。最初に `/setup`、その後 `/admin/settings` で行います。

> コンテナの結線を更新するには、いつでも `configure.py` を再実行できます。生成されるファイルはプレーンテキストなので、手動で編集することもできます。

> **初回起動前に `drives.json` が存在している必要があります** — `docker-compose.yml` は常にこれをバインドマウントします。`configure.py` を実行すれば（推奨）自動で作成されます。手動でセットアップしたい場合は、ステップ 3 の下の注記を参照してください。

### 3. 起動

`configure.py` は最後にコンテナを自動起動します。プロンプトをスキップした場合や後から再起動する場合:

```bash
docker compose up -d --build
```

`http://localhost:3000` を開きます。LAN 上の他のデバイスからは `http://<host-ip>:3000`。初回起動時は `/setup` ウィザードがドライブの命名とパスワード／アドオンポリシーの設定を行います。

> 初回ビルドではベースイメージのダウンロードとコンテナ依存関係のインストールが行われます。intelligence アドオンが有効な場合、ML モデルの重みは初回利用時にダウンロードされ、`data/addons/intelligence/models/` 以下にキャッシュされます。

> **手動セットアップ（configure.py を使わない場合）：** ドライブのボリュームマウントを手動で作成します — `docker-compose.override.yml.example` を `docker-compose.override.yml` にコピーし、ホストパスを編集します。次に、Docker が起動できるよう最小限の単一ファイルバインドマウント先を作成します：`echo '[]' > drives.json` と `echo '[]' > passwords.json`。その後、`docker compose up -d --build` を実行すると `/setup` の初回起動ウィザードが開き、最終的な論理設定を書き込みます。

---

## AI 機能（Intelligence アドオン）

Intelligence アドオンはセマンティック検索、Ask Q&A、AI 要約を追加します。ベースアプリより多くのリソースを必要とします。

### ハードウェア

| Whisper モデル | RAM（目安） | 備考 |
|---------------|--------------|-------|
| small | 約 500 MB | 高速、精度は低め |
| turbo *（デフォルト）* | 約 1.2 GB | 精度と速度のバランスが最良 |
| large-v3 | 約 3 GB | 最高精度 |

インデックス処理（文字起こし + 埋め込み）は CPU 負荷が高く、ファイルのスキャン後にバックグラウンドで実行されます。

### LLM（Ask、要約、オートタグに必要）

`/admin/intelligence` または `addons/intelligence/search-config.yml` の編集で、以下のいずれかを選択します：

**オプション A — ローカル（プライバシー重視の場合に推奨）**

ホストに [Ollama](https://ollama.com) をインストールし、モデルを取得します：

```bash
ollama pull gemma3:4b   # または llama3.2, qwen2.5 など
```

プロバイダを `ollama`、ベース URL を `http://host.docker.internal:11434` に設定します。データがマシンの外に出ることはありません。

**オプション B — API**

OpenAI、DeepSeek、その他 OpenAI 互換のエンドポイントを利用します。ベース URL と `LLM_API_KEY` を `.env` または管理 UI で設定します。LLM ベースのインデックスタスクや Ask クエリの際に、ファイル内容（トランスクリプト、テキスト）が API に送信されます。

> セマンティック検索と文字起こしは LLM なしでも動作します — テキスト生成機能のみ LLM を必要とします。

### クラウド文字起こしプロバイダ（クラウド STT）

ローカル Whisper（`faster-whisper`、CPU）に加えて、Litloft はいくつかのクラウド STT プロバイダをサポートします：

| プロバイダ | 強み | 備考 |
|---|---|---|
| OpenAI 互換（Groq / Fireworks など） | OSS Whisper 系統、馴染みのある API | 公式 OpenAI API はファイルあたり 25 MB の上限あり |
| Deepgram Nova-3 | トップクラスの WER、強力な話者分離 | 別途課金 |
| ElevenLabs Scribe | 話者分離、長尺音声 | 別途課金 |

`addons/intelligence/search-config.yml` の `transcription` セクションと、対応する API キー環境変数（`DEEPGRAM_API_KEY` / `ELEVENLABS_API_KEY` / `OPENAI_API_KEY`）で設定します。詳細は [intelligence の文字起こしプロバイダ一覧](addons/intelligence.md#transcription-providers) を参照してください。

**プライバシーに関する注記：** クラウドプロバイダを選択すると、音声バイトがそのプロバイダに送信されます。プライバシーに配慮したいドライブでは、そのドライブの `drives.json` に `addons.intelligence.transcription_cloud: false` を設定することで、**強制ローカルフォールバック**を固定できます — グローバルなプロバイダがクラウドであっても適用されます。

---

## アドオン

アドオンは `--recurse-submodules` によってメインリポジトリと一緒にクローンされます。`configure.py` は独立サービス型のアドオン（`intelligence`、`knowledge`）について尋ねます。インプロセス型のアドオンは、サブモジュールが存在しイメージが再ビルドされると読み込まれます。

| アドオン | 説明 |
|-------|-------------|
| **intelligence** | AI 検索、Ask Q&A、要約、オートタグ、CLIP 画像検索 |
| **knowledge** | ドライブ単位の Markdown vault と Web クリッピング |
| **cloud-sync** | rclone でドライブをクラウドストレージにバックアップ（S3、Backblaze、Google Drive など） |
| **media_import** | URL からメディアを `.loft` 参照としてインポート。メタデータとプロバイダ埋め込み付き |

---

## アクセス制御

`passwords.json` がない場合、すべてのドライブは LAN 上で誰でもアクセス可能です。

`passwords.json` がある場合、`access_group` を持つ各ドライブはアンロックにパスワードが必要です。グループを持たないドライブは誰でもアクセスできます。マスターパスワード（すべてのグループを網羅するパスワード）でアンロックした viewer が **管理者** になります。

アンロック URL：`http://<ip>:3000/unlock`（UI には意図的にリンクを張っていません）

---

## アップデート

```bash
git pull --recurse-submodules
docker compose up -d --build
```

ビルドに失敗した場合、以前のコンテナがそのまま動作し続けます。

---

## 開発

```bash
# バックエンドテスト（Docker 内で実行）
docker build -f backend/Dockerfile.test -t litloft-test backend/
docker run --rm litloft-test

# フロントエンドテスト
cd frontend && pnpm test

# ログ
docker compose logs -f backend
```

---

## 技術スタック

| レイヤー | 技術 |
|-------|-----------|
| バックエンド | FastAPI (Python 3.12) + SQLite (SQLAlchemy) + ffmpeg |
| フロントエンド | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| インフラ | Docker Compose |
| AI | faster-Whisper · SigLIP2/CLIP · multilingual-e5 / Ruri · sqlite-vec · SQLite FTS5 |

```
Browser → :3000 (Next.js) → rewrites /api/* → :8000 (FastAPI, internal only)
```

---

## ライセンス

[AGPL-3.0](../LICENSE)
