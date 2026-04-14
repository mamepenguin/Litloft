# HomeVault 機能マップ

全体像を俯瞰し、拡張・整理の判断に使うためのマインドマップ。
Mermaid 形式なので、MarkdownPreview でそのまま閲覧できる。

粒度は「ユーザーが認知できる機能」「開発者がディレクトリ単位で認識するモジュール」レベル。
内部実装の細部（関数名など）は含めない。

---

## 1. レイヤー軸マップ

実装構造に沿った配置。拡張時に「どこを触るか」を素早く特定するための地図。

```mermaid
mindmap
  root((HomeVault))
    Frontend
      Pages
        ホーム ドライブ選択
        ドライブホーム
        フォルダビュー
        ファイル詳細
        ダッシュボード admin
        アンロック unlock
        アドオンページ
        ドライブ別アドオンページ
      Components
        ファイル表示 FileGrid/List/Card
        メディア再生 Video/Audio/Gallery
        プレビュー Text/Markdown/Archive
        操作 Move/Rename/Batch/Favorite
        フォルダ Browser/Toolbar
        アップロード Zone/Button/Progress
        サイドバー Pins/Playlists/Tags
        タグ TagEditor/TagList
        コメント CommentSection
        検索 GlobalSearch
        選択 SelectionBar
        状態 Trash/Missing
        拡張点 AddonSlot
      Hooks
        useUpload
        useSelection
        useDragAndDrop
        useContextMenu
        useWebSocket
        useInfiniteScroll
      i18n
        next-intl Cookie方式
        ja / en
    Backend
      Routers
        auth JWT/unlock/lock
        files メタ/削除/タグ/編集
        drives 一覧/フォルダ/重複/pin
        uploads チャンク式
        comments 投稿/編集/削除
        playlists 作成/並べ替え
        progress 視聴進度
        admin ダッシュボード
        ws WebSocket配信
        internal アドオン向け内部API
        addon_proxy 汎用アドオンプロキシ
      Services
        scanner ドライブスキャン
        thumbnail サムネ生成
        upload チャンク結合
        fileops 移動/コピー/削除
        hash ファイルハッシュ
        subtitle SRT→VTT
        filetype タイプ分類
        heic HEIC変換
        safepath パス検証
        preview プレビュー生成
        ws ブロードキャスタ
        event_hooks イベント配信
        addon_registry メタ/スロット
      Lifecycle
        startup 全ドライブスキャン
        scheduled Trash自動purge 24h
        自動アドオンロード
      Data
        SQLite /data/app.db
        models File/Tag/Playlist
        models WatchHistory/Comment
        active_file_filter 3状態
    Addons
      intelligence scope=both
        セマンティック検索
        AI要約
        AutoTags
        Ask
        Whisper/CLIP/BLIP
      downloader scope=drive
        yt-dlp
        キュー管理
      podcast scope=drive
        購読/再生
      knowledge scope=drive
        Markdownノート
        Webクリップ
      cloud-sync scope=global
        rclone
        スケジュール同期
    Infra
      Docker
        backend 非公開 :8000
        frontend エントリ :3000
        override でアドオン追加
      Config
        drives.json ドライブ定義
        passwords.json アクセス制御
        event-hooks.json イベント購読
      Volumes
        /data 永続化
        /drives/* マウント
      Deploy
        git pull + compose build
        post-receive hook
```

---

## 2. ユーザー動線軸マップ

「ユーザーが何をしたいか」に沿った配置。機能の重複・抜けを発見したり、
同じ動線に関わる複数モジュールを束ねて見直すのに使う。

```mermaid
mindmap
  root((ユーザー動線))
    閲覧
      ドライブ選択
      フォルダツリー
      ファイル一覧 Grid/List
      サムネイル表示
      パンくず
      メディア再生
        動画 シーク/速度/字幕
        音声
        画像ギャラリー
      プレビュー
        Text/Markdown
        PDF
        ZIPアーカイブ
      視聴進度の自動復元
    アップロード
      ドラッグ&ドロップ
      チャンク式（大容量）
      フォルダ丸ごと
      進捗リアルタイム
      missing 復活上書き
    検索発見
      グローバル検索 ファイル名/説明
      タグ検索
      タイプ/フォルダ絞り込み
      重複検出
      Semantic Search intelligence
      Ask 自然言語質問
      サジェスト/履歴
    整理
      タグ付け 単体/一括
      プレイリスト
        作成/並べ替え
        再生
      お気に入り
      ピンフォルダ
      リネーム/移動 単体/一括
      フォルダ作成
      テキストファイル作成
      ゴミ箱 30日パージ
      Missing 手動パージ
      AutoTags 提案/承認
    共有コラボ
      コメント 投稿/編集/削除
      レート制限
      Like 👍👎
      視聴履歴 viewer別
      プロファイル ニックネーム
    管理
      パスワード認証 JWT
      ドライブアクセス制御
      保護ドライブの不可視化
      readonly ドライブ
      ダッシュボード
        ディスク使用量
        タイプ別統計
        スキャン状態
      手動スキャン
      WebSocket ライブ通知
    AI拡張
      AI要約 intelligence
      AutoTags 画像/動画/文書
      Ask 引用付き回答
      Transcription Whisper
      Frame Caption BLIP
      Knowledge ノート/クリップ
      Downloader URL取込
      Cloud Sync クラウドバックアップ
      Podcast 購読
    設定
      言語切替 ja/en
      テーマ
      プロファイル ニックネーム
      ロック/アンロック
```

---

## 3. Intelligence アドオン 検索の仕組み

`intelligence` アドオンは HomeVault の AI 軸の中核。5 チャネル並列検索とスコア融合、
Ask による引用付き回答を提供する。

### 3-1. インデックス時の流れ

ファイルが HomeVault にスキャンされると、webhook 経由で intelligence にタスクが流れ、
優先度付きキュー＋種別ごとのワーカーで処理される。

```mermaid
flowchart TD
  A[HomeVault スキャン完了] -->|scan-complete webhook| B[reconcile 差分抽出]
  B --> Q[Priority Queue]

  Q --> M[metadata_worker]
  Q --> W[whisper_worker セマフォ1]
  Q --> C[clip_worker x N]
  Q --> T[text_content_worker]

  M -->|title/description/size| DB1[(indexed_files / fts_files)]

  W -->|faster-whisper| WR[transcript_chunks]
  WR -->|embed_passages| V1[(vec_text)]
  WR --> DB2[(fts_transcripts)]

  C -->|ffmpeg + scenedetect| F[key frames]
  F -->|CLIP ViT| V2[(vec_clip)]
  F -.BLIP 任意.-> CAP[caption] --> DB3[(fts_clip_analysis)]

  T -->|PDF/Text/字幕 抽出| TS[segments]
  TS -->|embed_passages| V1
  TS --> DB4[(fts_text_content)]

  classDef model fill:#fef3c7,stroke:#d97706
  classDef db fill:#dbeafe,stroke:#2563eb
  class M,W,C,T,F model
  class DB1,DB2,DB3,DB4,V1,V2 db
```

**関連ファイル**: `addons/intelligence/app/indexer.py`, `workers/whisper.py`, `workers/clip.py`, `workers/metadata.py`, `database.py`

### 3-2. 検索時の流れ（/search）

クエリを 2 種類のベクトル化＋3 種類の FTS で並列検索し、モード別にスコア融合する。

```mermaid
flowchart TD
  Q[User Query] --> H{X-HV-Drive header}
  H --> E[embed_query]
  E --> ET[Text Embedding<br/>multilingual-e5 / Ruri]
  E --> EC[CLIP Embedding<br/>OpenAI/llm-jp CLIP]

  ET --> S1[Vector Search text<br/>sqlite-vec L2]
  EC --> S2[Vector Search clip<br/>sqlite-vec L2]
  Q --> S3[FTS5 metadata]
  Q --> S4[FTS5 transcript]
  Q --> S5[FTS5 text_content]

  S1 & S2 & S3 & S4 & S5 --> MODE{mode?}
  MODE -->|precision UI用| P[重み付きコサイン合成<br/>厳密カットオフ]
  MODE -->|recall RAG用| R[Weighted RRF<br/>text 1.0 / transcript 1.5 / clip 0.2]

  P & R --> G[file-level グループ化]
  G --> F[drive scope filter]
  F --> OUT[SearchResponse]

  classDef vec fill:#ede9fe,stroke:#7c3aed
  classDef fts fill:#d1fae5,stroke:#059669
  class S1,S2 vec
  class S3,S4,S5 fts
```

**関連ファイル**: `addons/intelligence/app/search.py`, `embedder.py`

### 3-3. Ask の流れ（/ask）

`/search` の recall モードを内部で使い、LLM で引用付き回答を生成。
citation は必ずホワイトリスト検証でハルシネーションを防ぐ。

```mermaid
flowchart TD
  U[User Question] --> QT[Query Transform<br/>LLM でキーワード抽出]
  QT --> RT[retrieve_with_keywords<br/>= search recall mode]
  RT --> AF[Access Filter<br/>本体 Internal API<br/>POST /filter-file-ids]
  AF --> CA[Context Assembly<br/>transcript ±30s / BLIP caption<br/>budget 超過分は drop]
  CA --> PR[Prompt 構築<br/>system + file blocks + question]
  PR --> LLM[LLM Stream<br/>AsyncOpenAI 互換]
  LLM --> SSE[SSE token stream]
  LLM --> JSON[answer + citations JSON]
  JSON --> CV{Citation Validator}
  CV -->|file_id in whitelist| OK[relevance clamp 0-1]
  CV -->|unknown file_id| DROP[drop]
  OK --> RESP[Response with<br/>drive / filename / quote / segment]

  classDef ext fill:#fee2e2,stroke:#dc2626
  classDef safe fill:#fef3c7,stroke:#d97706
  class LLM,QT ext
  class AF,CV safe
```

**セキュリティ 2 層**:
1. 内部フィルタ: `access_token` cookie → 本体 `/api/internal/filter-file-ids` で権限チェック
2. citation 検証: LLM が捏造した file_id は retriever 結果セットに無ければ drop

**関連ファイル**: `addons/intelligence/app/rag/service.py`, `retriever.py`, `query_transform.py`, `parser.py`, `context.py`, `prompt.py`

### 3-4. 使われている構成要素まとめ

| 種別 | 採用技術 | 用途 |
|---|---|---|
| テキスト埋め込み | multilingual-e5 / Ruri | クエリ・文書の共通ベクトル空間 |
| 画像埋め込み | CLIP ViT (OpenAI / llm-jp) | 画像・動画フレームの検索 |
| 画像記述 (任意) | BLIP | auto-tags 精度向上、Ask コンテキスト |
| 音声書き起こし | faster-whisper (CTranslate2) | transcript + タイムスタンプ |
| フレーム抽出 | ffmpeg + scenedetect | 代表フレーム選択 |
| ベクトル検索 | sqlite-vec (L2 距離) | 低依存で同プロセス |
| 全文検索 | SQLite FTS5 | metadata / transcript / text_content |
| スコア融合 | Weighted RRF / Cosine 合成 | recall / precision モード |
| LLM | OpenAI 互換 API (ollama / vLLM / OpenAI / DeepSeek) | Ask 回答・クエリ変換 |
| 権限境界 | 本体 Internal API + addon_proxy | 二重のアクセス制御 |

---

## 使い方

- **新機能追加の設計時**: 動線軸で似た機能がないか確認 → レイヤー軸でどのモジュールを触るか特定
- **リファクタリング時**: レイヤー軸で肥大化したノードを探し、分割候補を議論
- **アドオン設計時**: 動線軸の AI拡張 / 検索発見 に既存アドオンとの重複がないか確認
- **ドキュメント更新時**: 新機能をここに 1 行追加 → `docs/FEATURES.md` 本文も更新

メンテのヒント: 機能を足したら葉を 1 つ追加するだけでよい。構造（ブランチ）は滅多に変えない。
