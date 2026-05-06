# Litloft 機能マップ

「このシステムに何ができるか」を俯瞰するための資料。
内部実装の詳細（ファイル名・関数名・モジュール名など）は含めない。

---

## 1. 全体構成

ブラウザからアクセスする単一のエントリーポイントの背後に本体とアドオン群が並ぶ。
本体はファイル管理・再生・基本検索を担当し、AI・ノート・同期などの付加機能は
アドオンとして独立して差し込む構造になっている。

```mermaid
flowchart LR
  U[ユーザー<br/>ブラウザ / PWA]
  U --> FE[Litloft 本体<br/>ファイル一覧・再生<br/>検索・アップロード<br/>タグ・お気に入り<br/>視聴履歴]

  FE <--> D[(ドライブ<br/>家族ビデオ / 仕事 / ...)]
  FE <--> S[(ファイル情報<br/>タグ・コメント・履歴)]

  FE -.拡張.-> I[intelligence<br/>AI検索・要約・Ask]
  FE -.拡張.-> K[knowledge<br/>Markdownノート<br/>Webクリップ]
  FE -.拡張.-> DL[downloader<br/>URL取り込み]
  FE -.拡張.-> P[podcast<br/>RSS配信]
  FE -.拡張.-> C[cloud-sync<br/>クラウドバックアップ]

  classDef core fill:#dbeafe,stroke:#2563eb
  classDef addon fill:#fef3c7,stroke:#d97706
  classDef data fill:#d1fae5,stroke:#059669
  class FE core
  class I,K,DL,P,C addon
  class D,S data
```

- **ドライブ**: コンテンツ領域の単位。各ドライブは完全に独立しており、アクセス制御・AI機能の有効/無効もドライブごとに設定する。
- **アドオン**: 本体を拡張する独立モジュール。クローン直後の状態ではすべて無効で、必要なものだけを追加する。AI機能を使うかどうかはドライブごとに選べる。

---

## 2. ユーザー動線軸マップ

「ユーザーが何をしたいか」に沿って機能を並べたマインドマップ。
機能の抜け・重複を見るのに使う。

```mermaid
mindmap
  root((ユーザー動線))
    閲覧
      ドライブ選択
      フォルダナビゲーション
      ファイル一覧 Grid/List ドキュメントlazy preview付き
      メディア再生 動画/音声/画像
      プレビュー Text/Markdown/PDF/Office/ZIP
      画像ビューア スワイプ/タップゾーン/見開き分割 LTR・RTL
      視聴進度の自動復元
    アップロード
      ドラッグ&ドロップ
      チャンク式の大容量対応
      フォルダ丸ごと
      進捗リアルタイム
    検索発見
      キーワード検索
      タグ検索
      重複検出
      Semantic Search 意味近似
      Ask 自然言語質問
      Find ファイル列挙クエリ チップ編集
    整理
      タグ付け 単体/一括
      プレイリスト
      お気に入り/ピン
      リネーム/移動 単体/一括 移動時ハッシュ照合でAIデータ引継ぎ
      テキストファイル作成/編集
      ゴミ箱 30日で自動削除
      Missing 手動削除
      AutoTags 提案/承認
    共有コラボ
      コメント
      Like / Dislike
      プロファイル別の視聴履歴
    管理
      パスワード認証
      ドライブ別アクセス制御
      ダッシュボード 統計/スキャン/ヘルス
      手動スキャン
    AI拡張
      AI要約 short/long
      Detailed Summary Markdown
        出典リンク自動付与 strong/weak tier
        単一出典がない段落は無印（ノイズ回避）
        セクション単位の編集/revert
      AutoTags 画像/動画/文書
      Ask 引用付き回答
      Transcript Refine 修正/revert
      Transcription Whisper
      Frame Caption BLIP
      Knowledge ノート/Webクリップ/loft://ファイルリンク/Ask回答保存
      Downloader URL取込
      LoftRef 外部URLソース
      Cloud Sync クラウドバックアップ
      Podcast RSS配信
    設定
      設定ページ /settings
        プロファイル ニックネーム
        テーマ light/dark/system
        言語 ja/en
      ロック/アンロック
      キーボードショートカット ⌘ or Ctrl
```

---

## 3. ファイル状態モデル

ファイルは FS とユーザー操作の両方に影響を受けるため、3 つの状態を持つ。
AI 生成データ（書き起こし・埋め込みベクトル・キャプション）は FS から再生成できないので、
FS で一時的に見えなくなっても即削除しない設計になっている。

```mermaid
stateDiagram-v2
  [*] --> Active: アップロード / スキャンで発見
  Active --> Trash: ユーザーが削除
  Active --> Missing: スキャン時にFSで見つからない
  Missing --> Active: FSに再出現（復活）
  Missing --> [*]: ユーザーが明示的にパージ
  Trash --> Active: 復元
  Trash --> [*]: 30日経過で自動パージ or 手動パージ

  note right of Missing
    視聴履歴・タグ・AI生成データは保持
    自動削除されない
  end note
  note right of Trash
    FS上のファイルはそのまま残る
    パージ時に初めて物理削除
  end note
```

---

## 4. Intelligence アドオン 検索の仕組み

以降は技術者向けの詳細。`intelligence` アドオンは Litloft の AI 軸の中核で、
5 チャネル並列検索とスコア融合、Ask による引用付き回答を提供する。
外部の技術者やオンボーディング向けに、採用技術と内部フローを示す。

### 4-1. インデックス時の流れ

ファイルが Litloft にスキャンされると、webhook 経由で intelligence にタスクが流れ、
優先度付きキュー＋種別ごとのワーカーで処理される。

```mermaid
flowchart TD
  A[Litloft スキャン完了] -->|scan-complete webhook| B[reconcile 差分抽出]
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

### 4-2. 検索時の流れ（/search）

クエリを 2 種類のベクトル化＋3 種類の FTS で並列検索し、モード別にスコア融合する。

```mermaid
flowchart TD
  Q[User Query] --> H{X-Lit-Drive header}
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

### 4-3. Ask / Find の流れ（/ask, /find）

`/search` の recall モードを内部で使い、Stage A-D（query decompose → personal history filter → category expand → scoped retrieve）を共通基盤として 2 系統の出力経路を持つ。

- **E_ask (`POST /ask`)**: Stage A-D の retrieve 結果を LLM に流し、引用付き文章をストリーム返却（既存）
- **E_find (`POST /find`)**: Stage A-D の retrieve 結果をそのままファイルカード列 + 透明化チップとして返却（LLM 文章生成なし、SSE なし、単発 JSON）

Find モードは「先週観た映画で SF っぽいのどれ？」のようなファイル列挙意図のクエリを Ask の文章回答ではなくランク付きファイルリストで返す。LLM 解釈はチップとしてユーザーに見せ、× クリックで個別軸を緩めて再 retrieve できる（ステートレス、`overrides` を再 POST するだけ）。詳細は spec [`2026-04-30-intelligence-find-mode.md`](superpowers/specs/2026-04-30-intelligence-find-mode.md)。

以下は Ask（E_ask）のシーケンス。Find は最後の LLM Stream 以降を「retrieve 結果を JSON 整形して返却」に置き換えるだけで、citation 検証は走らない（tier 1 の retrieve hit chunk をそのまま見せる）。

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

**関連ファイル**: `addons/intelligence/app/rag/service.py` (`stream_answer` for Ask, `find_files` for Find), `addons/intelligence/app/routers/rag.py` (`/ask`, `/find`), `retriever.py`, `query_transform.py`, `query_decomposer.py`, `category_expander.py`, `history_client.py`, `parser.py`, `context.py`, `prompt.py`. Frontend: `addons/intelligence/frontend/pages/find.tsx`, `FindModeSlot.tsx`, `FindChip.tsx`, `api.ts`

### 4-4. 使われている構成要素まとめ

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

- **このシステムで何ができるか知りたい**: セクション 1・2 を見れば十分。
- **AI 検索の仕組みを知りたい（技術者・オンボーディング）**: セクション 4 を参照。
- **新機能追加時**: セクション 2（動線軸）に既存と重複がないか確認し、あれば葉を 1 つ追加する。

メンテのヒント: 構造（ブランチ）は滅多に変えない。機能を足したら葉を 1 つ追加するだけでよい。
実装詳細は `docs/FEATURES.md` / `docs/ADDON-DEVELOPMENT.md` の側に置く。
