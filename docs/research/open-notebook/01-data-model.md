# Open Notebook データモデル調査

## 1. エンティティ一覧（図解）

```
┌─────────────────────────────────────────────┐
│            NOTEBOOK (スコープ)              │
│        研究プロジェクト全体を統括            │
├─────────────────────────────────────────────┤
│                                             │
│ SOURCE (生素材)                             │
│ ├─ full_text: 抽出テキスト                 │
│ ├─ asset: {file_path, url}                │
│ ├─ command: surreal-commands job ID        │
│ └─ SourceEmbedding: chunk[] (vector化済)  │
│ └─ SourceInsight: 生成洞察[] (embedding)  │
│                                             │
│ NOTE (知識アウトプット)                     │
│ ├─ title, content                         │
│ ├─ note_type: "human" | "ai"              │
│ └─ embedding: vector                      │
│                                             │
│ CHAT_SESSION (会話セッション)               │
│ ├─ title                                  │
│ ├─ model_override                         │
│ └─ message[] (SurrealDB外で管理)           │
│                                             │
└─────────────────────────────────────────────┘

グラフ関係（エッジ定義):
  Source --reference--> Notebook
  Note --artifact--> Notebook
  ChatSession --refers_to--> Notebook
  (1対多、SurrealDB RELATION テーブル)
```

---

## 2. Notebook

### 定義（`open_notebook/domain/notebook.py: Notebook`）

```python
class Notebook(ObjectModel):
    table_name: ClassVar[str] = "notebook"
    name: str
    description: str
    archived: Optional[bool] = False
    created: Optional[datetime] = None
    updated: Optional[datetime] = None
```

### ライフサイクル

| イベント | 説明 |
|---------|------|
| **Create** | `name` と `description` を指定して新規 notebook 作成。通常の REST API か Python 直接生成 |
| **Read** | `get_all()`, `get(id)` で取得。source/note/chat_session は別メソッドで遅延ロード |
| **Update** | `name`, `description`, `archived` フィールドを更新し `save()` |
| **Delete** | 複雑：`delete(delete_exclusive_sources: bool)` が cascade 削除を担当 |

### 削除時の複雑性

Notebook を削除する場合、複数の cascade ルールが適用される（`notebook.py:138-230`）:

```python
async def delete(self, delete_exclusive_sources: bool = False) -> Dict[str, int]:
    # 1. ノート削除（全て）
    #    DELETE artifact WHERE out = $notebook_id
    
    # 2. ソース削除かアンリンク
    #    - delete_exclusive_sources=True なら "このノートだけに紐づく" ソースを物理削除
    #    - False なら reference を削除するだけ（ソースは残す）
    #    SELECT ... count(->reference[WHERE out != $notebook_id]) as assigned_others ...
    
    # 3. Notebook 本体削除
    #    DELETE notebook WHERE id = $id
    
    return {
        "deleted_notes": count,
        "deleted_sources": count,
        "unlinked_sources": count
    }
```

**特徴**:
- **源泉的: Notebook は source と note の親だが、source は複数の notebook に紐づく可能性がある**
- **多対多参照**: `reference` テーブル（`source --reference--> notebook`）により、同じ source を複数の notebook で共有可能
- **削除判定が動的**: 「このソースは他のノートからも参照されているか？」をリアルタイム問合せで判定

---

## 3. Source

### 定義（`open_notebook/domain/notebook.py: Source`）

```python
class Source(ObjectModel):
    table_name: ClassVar[str] = "source"
    asset: Optional[Asset] = None            # {file_path, url}
    title: Optional[str] = None
    topics: Optional[List[str]] = Field(default_factory=list)
    full_text: Optional[str] = None          # 抽出済みテキスト（大）
    command: Optional[Union[str, RecordID]] = None  # embed_source job ID
```

### Ingestion ライフサイクル

```
1. アップロード / URL 追加
   └─ Source レコード作成（asset と title だけ）

2. テキスト抽出フェーズ
   └─ extract_source_content command 実行
      ├─ PDF → OCR で text 抽出
      ├─ URL → web scraping
      ├─ Video/Audio → 字幕 or 音声認識
      └─ full_text フィールド保存

3. Chunking フェーズ（内部）
   └─ extract_source_content に含まれる（Langchain splitter 使用）

4. Vectorization フェーズ
   └─ Source.vectorize() → embed_source command 発行
      ├─ full_text をチャンク単位で再処理
      ├─ 各チャンク → vector embedding 生成
      └─ SourceEmbedding レコード作成（m:1 関係）
```

### アーティテクチャ: Job ベース処理

**重要**: 大規模ファイルの処理を HTTP 接続プーム枯渇から防ぐため、**`surreal-commands`** という別プロセス（Pydantic タスクキュー）を使用：

```python
async def vectorize(self) -> str:
    command_id = submit_command(
        "open_notebook",
        "embed_source",
        {"source_id": str(self.id)}
    )
    return command_id_str
```

- 処理は **fire-and-forget** （戻り値は job ID、待機しない）
- Status は `get_processing_progress()` で非同期ポーリング
- DB 更新は command 側で管理（transaction conflict retry）

### SourceEmbedding（チャンク・レベルのベクトル）

```python
class SourceEmbedding(ObjectModel):
    table_name: ClassVar[str] = "source_embedding"
    source: RecordID  # Source への FK
    order: int        # チャンク順序
    content: str      # チャンク本体（~500 word）
    embedding: List[float]  # OpenAI embedding_3_small など（1536 dim）
```

**スキーマ** (`1.surrealql`):
```sql
DEFINE TABLE source_embedding SCHEMAFULL;
DEFINE FIELD source ON TABLE source_embedding TYPE record<source>;
DEFINE FIELD embedding ON TABLE source_embedding TYPE array<float>;
```

**削除連鎖**: `DEFINE EVENT source_delete ON TABLE source ... DELETE source_embedding ...`
→ Source が削除されると同時に全 embedding レコード自動削除

### SourceInsight（生成洞察）

```python
class SourceInsight(ObjectModel):
    table_name: ClassVar[str] = "source_insight"
    source: RecordID  # Source への FK
    insight_type: str  # "summary" | "key_concepts" | "methodology" など
    content: str       # 洞察の内容（LLM 生成）
    embedding: List[float]  # 洞察用ベクトル
```

**特徴**:
- Manual note と異なり、Source から自動生成される
- `Source.add_insight(insight_type, content)` で fire-and-forget 投入
- 検索時に `source.get_insights()` で複数取得可能
- AI や transformation の「準備段階」として機能

### Source と Notebook の関係

**参照テーブル**: `reference` (SurrealDB RELATION)

```sql
DEFINE TABLE reference
TYPE RELATION 
FROM source TO notebook;
```

**特徴**:
- **多対多**: 同じ Source は複数の Notebook に参照可能
- **削除時判定**: `count(->reference[WHERE out != $notebook_id])` で「他のノートへの参照数」を確認
- **削除フロー**: 
  - `delete_exclusive_sources=False`: reference だけ削除（Source は残す）
  - `delete_exclusive_sources=True`: 他の reference がなければ Source 本体も物理削除

---

## 4. Note

### 定義（`open_notebook/domain/notebook.py: Note`）

```python
class Note(ObjectModel):
    table_name: ClassVar[str] = "note"
    title: Optional[str] = None
    note_type: Optional[Literal["human", "ai"]] = None
    content: Optional[str] = None
    embedding: Optional[List[float]] = None  # embedding フィールドは定義済み
    created: Optional[datetime] = None
    updated: Optional[datetime] = None
```

### Note 作成パターン

| パターン | 作成元 | note_type | 説明 |
|---------|-------|-----------|------|
| **Manual** | ユーザー直接入力 | `"human"` | ユーザーが作成したオリジナルノート |
| **Chat Save** | Chat インタラクション | `"ai"` | Chat の応答をユーザーが「Save as Note」 |
| **Transformation** | Transformation 実行 | `"ai"` | Template ベース抽出の結果 |
| **SourceInsight.save_as_note()** | Source → Note 昇格 | `"ai"` | Insight を永続ノートに変換 |

### Embedding と保存

```python
async def save(self) -> Optional[str]:
    # 1. 親 ObjectModel.save() を呼び出し
    await super().save()
    
    # 2. Embedding 作成コマンド fire-and-forget
    if self.id and self.content:
        command_id = submit_command(
            "open_notebook",
            "embed_note",
            {"note_id": str(self.id)}
        )
        return command_id
    return None
```

**特徴**: embedding も **非同期ジョブ化** → Source と同じ戦略で大規模文書対応

### Note と Notebook の関係

**参照テーブル**: `artifact` (SurrealDB RELATION)

```sql
DEFINE TABLE artifact
TYPE RELATION 
FROM note TO notebook;
```

**特徴**:
- **1対多**: 各 Note は **最大1つの Notebook** にのみ所属
- Source と異なり「共有」不可
- Notebook 削除時に全 artifact 削除（cascade）

---

## 5. Chat / Conversation

### 定義（`open_notebook/domain/notebook.py: ChatSession`）

```python
class ChatSession(ObjectModel):
    table_name: ClassVar[str] = "chat_session"
    title: Optional[str] = None
    model_override: Optional[str] = None
    created: Optional[datetime] = None
    updated: Optional[datetime] = None
```

### スキーマ（`3.surrealql`）

```sql
DEFINE TABLE chat_session SCHEMALESS;

DEFINE TABLE refers_to
TYPE RELATION 
FROM chat_session TO notebook;
```

### メッセージ管理

**重要**: ChatSession は「セッション」を表す親テーブルだが、**メッセージ履歴は SurrealDB テーブルではなく LangChain の RunnableConfig で管理される**。

```python
# api/routers/chat.py
async def execute_chat(request: ExecuteChatRequest):
    session_id = request.session_id
    message = request.message
    context = request.context  # {sources: [], notes: [], ...}
    
    # LangChain graph 経由で execute
    config = RunnableConfig(configurable={"session_id": session_id})
    response = await chat_graph.ainvoke(
        {"messages": [...]},
        config=config
    )
    # response がメッセージ履歴を返す（ただし DB には永続化されない）
```

### Chat のコンテキスト・マネジメント

`api/routers/context.py` で「ユーザーが選んだどのソース/ノートを AI に見せるか」を制御：

```python
class BuildContextRequest(BaseModel):
    notebook_id: str
    context_config: Dict[str, Any]
    # context_config の例:
    # {
    #   "sources": [
    #     {
    #       "source_id": "source:123",
    #       "context_level": "full" | "summary" | "excluded"
    #     }
    #   ],
    #   "notes": [...]
    # }
```

**context_level**:
- `"full"`: SourceEmbedding の full_text を完全に AI に送信
- `"summary"`: Source の insights だけを AI に送信
- `"excluded"`: AI に見せない

### Chat vs Ask の使い分け

| 特徴 | Chat | Ask |
|-----|------|-----|
| **Context Control** | 手動選択（context_level） | 自動検索（全 source 対象） |
| **Context Type** | 完全なテキスト送信 | Vector search → 関連チャンクのみ |
| **Conversational** | 複数ターン可（履歴保持） | 1 回の質問 → 1 回の回答 |
| **実装** | LangChain graph | RAG function |

---

## 6. ライフサイクル: Ingestion → Embedding → Search → Citation

```
╔═══════════════════════════════════════════════════════════════╗
║  典型的な研究ワークフロー                                      ║
╚═══════════════════════════════════════════════════════════════╝

[INGESTION PHASE]
  ├─ Source 新規作成 → full_text フィールド入力前
  ├─ extract_source_content command 発行 → full_text 抽出
  └─ Notebook への reference 作成（add_to_notebook API）

[EMBEDDING PHASE]
  ├─ Source.vectorize() → embed_source command
  │  └─ SourceEmbedding テーブルに chunk+vector 一括 insert
  └─ Note.save() → embed_note command
     └─ note.embedding フィールド更新

[ENRICHMENT PHASE (オプション)]
  ├─ Source.add_insight() → create_insight command
  │  └─ SourceInsight テーブルに分析結果記録
  └─ Transformation 実行
     └─ 新しい Note 作成（note_type="ai"）

[SEARCH/RETRIEVAL PHASE]
  ├─ text_search(): BM25 キーワード検索
  │  └─ source_embedding.content @1@ $keyword
  │  └─ source.title / note.title 等も対象
  │
  └─ vector_search(): Semantic similarity
     ├─ query を embedding に変換
     ├─ cosine similarity で比較
     └─ 関連度スコア付きでランク
        ├─ source_embedding: similarity
        ├─ source_insight: similarity
        └─ note: similarity

[AI INTERACTION]
  ├─ Chat: 選択した source/note を context に → full content 送信
  │
  └─ Ask: vector_search 結果をマージ → LLM へ
     └─ 関連チャンク + citation 情報を回答に含める

[KNOWLEDGE OUTPUT]
  ├─ Note 手動作成 / Chat/Ask 応答を save-as-note
  └─ Note の embedding も非同期化で対応
```

### Search 関数の詳細（SurrealDB 内部実装）

**Text Search** (`1.surrealql`):
```sql
DEFINE FUNCTION fn::text_search(
    $query_text: string,
    $match_count: int,
    $sources: bool,
    $show_notes: bool
) {
    -- source_embedding.content, source.full_text をマルチキー検索
    -- source.title, source_insight 等をまとめて検索
    -- SEARCH ANALYZER my_analyzer BM25 HIGHLIGHTS
    
    RETURN (SELECT item_id, relevance
        FROM $final_results
        ORDER BY relevance DESC
        LIMIT $match_count)
}
```

**Vector Search** (`3.surrealql` より新版):
```sql
DEFINE FUNCTION fn::vector_search(
    $query: array<float>,
    $match_count: int,
    $sources: bool,
    $show_notes: bool,
    $min_similarity: float
) {
    -- embedding を cosine 距離で比較
    -- $min_similarity (default 0.2) 未満は除外
    
    RETURN (SELECT id, title, content, parent_id, similarity
        FROM $all_results
        GROUP BY id
        ORDER BY similarity DESC
        LIMIT $match_count)
}
```

---

## 7. SurrealDB スキーマの特徴

### テーブル設計（マイグレーション `1.surrealql` から）

| テーブル | 型 | 親→子 | 説明 |
|---------|-----|-------|------|
| `notebook` | 通常 | - | 研究プロジェクト本体 |
| `source` | 通常 | - | 生素材（不変） |
| `source_embedding` | 通常 | source:N | Chunk × vector（削除連鎖） |
| `source_insight` | 通常 | source:N | 自動生成洞察（削除連鎖） |
| `note` | 通常 | - | ユーザー作成知識 |
| `chat_session` | SCHEMALESS | - | 会話セッション（メッセージは外部管理） |
| `reference` | RELATION | source → notebook | 多対多リンク |
| `artifact` | RELATION | note → notebook | 1対多リンク |
| `refers_to` | RELATION | chat_session → notebook | セッション紐づけ |

### インデックス戦略（全文検索対応）

```sql
DEFINE ANALYZER my_analyzer 
    TOKENIZERS blank,class,camel,punct 
    FILTERS snowball(english), lowercase;

-- BM25 インデックス（複数）
DEFINE INDEX idx_source_title ON TABLE source 
    COLUMNS title SEARCH ANALYZER my_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX idx_source_full_text ON TABLE source 
    COLUMNS full_text SEARCH ANALYZER my_analyzer BM25 HIGHLIGHTS;
DEFINE INDEX idx_source_embed_chunk ON TABLE source_embedding 
    COLUMNS content SEARCH ANALYZER my_analyzer BM25 HIGHLIGHTS;
-- ...
```

### イベント駆動削除（Cascade）

```sql
DEFINE EVENT source_delete ON TABLE source 
    WHEN ($after == NONE) THEN {
        delete source_embedding where source == $before.id;
        delete source_insight where source == $before.id;
    };
```

**効果**: Source が削除されると自動的に embedding と insight もクリーンアップ

### SCHEMALESS vs SCHEMAFULL

- **notebook, source, note**: `SCHEMAFULL` → フィールド定義が明示的
- **chat_session**: `SCHEMALESS` → 柔軟（メッセージ形式が外部定義）

---

## 8. Litloft への示唆

### 8.1 直接移植できそうな発想

#### A. プロジェクト・スコープ概念

Open Notebook の **Notebook** = Litloft の **一時研究プロジェクト**:

```
Litloft 現状:
  └─ Drive (セキュリティ/FS 境界)
     └─ File[] (path, mime, created, ...)

提案:
  └─ Drive
     ├─ File[]
     └─ ResearchProject (一時的な "notebook" 的なグループ)
        ├─ selected_files: File[]
        ├─ notes: Note[]  ← Intelligence addon 生成
        └─ chat_session: ChatSession[] (LLM 対話履歴)
```

**Use Case**: 「このフォルダセットについてまとめの動画を生成したい」→ Project を作成 → Project scope で chat/ask → Chat 履歴から自動 podcast 生成

#### B. File の多面的な参照

Open Notebook: Source は複数の Notebook で共有可能（`reference` 多対多）

Litloft 応用:
```
既存: FileRelation (ファイル同士の関連付け)
提案: ProjectMembership (ファイル → ResearchProject 多対多)
      
RELATION: File --project_member--> ResearchProject
```

**メリット**:
- 同じファイルが複数プロジェクトで参照される場合も対応
- 削除時に「このファイルは他のプロジェクトでも使われているか？」判定可能

#### C. Insight / Summary の分層

Open Notebook:
- `SourceEmbedding`: Chunk 単位 (RAG 用)
- `SourceInsight`: 洞察タイプ別 (生成知識)
- `Note`: 永続知識

Litloft 応用: Intelligence addon の `FileActiveSummary` とアラインメント

```
現在: FileActiveSummary (1:1) → 「このファイルのアクティブな要約」

提案: 段階化
  ├─ FileSegment (chunk, embedding, created by Whisper/CLIP)
  ├─ FileInsight (insight_type, generated by intelligence)
  │  └─ e.g., "face_names", "transcript_summary", "scene_tags"
  └─ FileActiveSummary (昇格した "canonical" insight)
```

#### D. Async Command / Job Queue の活用

Open Notebook: `surreal-commands` で embed_source / embed_note / create_insight を非同期化

Litloft への移植:
```python
# 現状: Whisper/CLIP 処理が HTTP handler で実行（タイムアウト risk）

# 提案: Intelligence addon 内で Job Queue
async def add_transcription_job(file_id: str):
    command_id = submit_command(
        "intelligence",
        "transcribe_audio",
        {"file_id": file_id}
    )
    return command_id

# Status polling
async def get_transcription_status(command_id: str):
    return await get_command_status(command_id)
```

**利点**: HTTP タイムアウト回避、優先度制御、部分失敗の graceful handling

### 8.2 Litloft の制約で真似できない部分

#### A. FS-first 設計との齟齬

**Open Notebook**:
- Source は DB primary source
- asset (file_path) は optional
- 「PDF をアップロード → DB に記録 → 処理」

**Litloft**:
- File は FS primary source
- DB は FS のキャッシュ + addon 生成データ
- 「FS に存在する file を scanner が発見 → DB に記録」

→ Litloft で Project concept を入れる場合、**Project 作成時に「どのファイルを含めるか」をユーザーが指定** する必要がある（自動スキャンではなく）

#### B. Multi-Notebook 参照の複雑性

Open Notebook: Source が複数 Notebook に属するのは「同じ素材から複数の研究」の想定

Litloft での同等物は「ドライブ内スコープ」であり、**ドライブを越えた参照は設計上不可**（セキュリティ境界だため）

→ ResearchProject は同ドライブ内のみ

#### C. チャット履歴の永続性

Open Notebook: Chat はセッション単位でメッセージ履歴を保有（ただしスコープは不明）

Litloft 既存仕様: Chat 履歴なし（Intelligence の Ask は stateless）

→ Research Project に chat 機能を加える場合、**LangChain Memory / LLM message store** の別実装が必要

### 8.3 Litloft の既存モデル（File / FileRelation / FileActiveSummary）との対応表

| Open Notebook | Litloft 現状 | 提案: 新フィールド/テーブル |
|---|---|---|
| **Notebook** | - | ResearchProject (新) |
| **Source** | File | ← そのまま |
| **source.full_text** | - | file.transcript (Whisper) / file.text_content (OCR) |
| **SourceEmbedding (chunk+vector)** | - | FileSegment (新テーブル、Whisper chunk や CLIP frame) |
| **SourceInsight** | - | FileInsight (新テーブル、`kind` = "tag" \| "scene" \| "face" など) |
| **source.get_insights()** | - | file.get_insights(kind=None) |
| **Note (artifact)** | - | ResearchProjectNote (新テーブル、project_id FK) |
| **note_type: "ai"** | - | source = "intelligence" \| "manual" |
| **ChatSession** | - | ResearchProjectChat (新テーブル、project_id FK) |
| **reference (Source ↔ Notebook)** | FileRelation | ProjectMembership (新テーブル、File ↔ ResearchProject) |
| **artifact (Note ↔ Notebook)** | - | (FK via ResearchProjectNote.project_id) |
| **FileActiveSummary (1:1)** | FileActiveSummary | ← そのまま（昇格 Insight を point） |

### 8.4 具体的な改善提案

#### Phase 1: Core インフラ（既存 FileRelation を拡張）

**新テーブル**:

1. **`research_projects`** (Notebook 相当)
   ```python
   class ResearchProject(Base):
       id: PrimaryKey
       drive_id: FK(Drive)
       name: str
       description: str
       archived: bool = False
       created_at: datetime
       updated_at: datetime
   ```

2. **`project_memberships`** (reference 相当)
   ```python
   class ProjectMembership(Base):
       project_id: FK(ResearchProject)
       file_id: FK(File)
       # role: "primary" | "reference" (将来拡張)
   ```

3. **`project_notes`** (artifact 相当)
   ```python
   class ProjectNote(Base):
       project_id: FK(ResearchProject)
       title: str
       content: str
       note_type: "manual" | "ai"  # ai = Intelligence 生成
       embedding: Optional[Vector]
       created_at: datetime
       updated_at: datetime
   ```

**削除カスケード**:
- ProjectNote は project_id FK で自動削除
- ProjectMembership は「project削除時はアンリンク（file は残す）」

#### Phase 2: Chat Capability

**新テーブル**:

```python
class ProjectChatSession(Base):
    project_id: FK(ResearchProject)
    title: str
    model_override: Optional[str]
    created_at: datetime
    updated_at: datetime

class ProjectChatMessage(Base):
    session_id: FK(ProjectChatSession)
    role: "user" | "assistant"
    content: str
    timestamp: datetime
    metadata: Optional[Dict]  # citations など
```

**API**:
- `POST /api/projects/{project_id}/chat/sessions`
- `POST /api/projects/{project_id}/chat/messages`
- `GET /api/projects/{project_id}/chat/sessions/{session_id}/messages`

**Context Building** (Open Notebook 参照):
```python
async def build_project_context(
    project_id: str,
    context_config: Dict[str, str]  # {"file_ids": [...], "context_level": "full"}
):
    """Build context from project files for LLM"""
    project = await ProjectService.get(project_id)
    memberships = await ProjectMembership.query(project_id=project_id)
    
    context = {}
    for file_id in context_config.get("file_ids", []):
        file = await File.get(file_id)
        if context_config.get("context_level") == "full":
            context[file_id] = file.transcript or file.text_content or ""
        else:  # "summary"
            context[file_id] = file.active_summary.content
    
    return context
```

#### Phase 3: Knowledge Promotion

**FileInsight の導入** (Open Notebook の SourceInsight 相当):

```python
class FileInsight(Base):
    file_id: FK(File)
    kind: str  # "tag" | "scene" | "transcript_chunk" | "face_region" など
    content: str
    metadata: Optional[Dict]  # { "timestamp": "00:15:30", "confidence": 0.95 }
    created_by: str  # "whisper" | "clip" | "blip" | "manual"
    embedding: Optional[Vector]

# 削除カスケード: file 削除時に自動削除
# ドライブ通知: intelligence が new insight 作成時に webhook 発行
```

**Promotion Path**:
```
Whisper → TranscriptChunk (既存)
          ↓ (Intelligence refine)
          FileInsight (kind="transcript_summary")
          ↓ (User marks as active)
          FileActiveSummary (昇格)
```

#### Phase 4: Multi-Project Analysis

**Ask Query** (Open Notebook の Ask に相当、Intelligence addon 実装):

```python
async def ask_about_project(
    project_id: str,
    question: str,
    models_only: bool = False  # LLM を使わずセグメント検索だけ
) -> Dict:
    """Ask a question across all project files"""
    
    project = await ResearchProject.get(project_id)
    memberships = await ProjectMembership.query(project_id=project_id)
    file_ids = [m.file_id for m in memberships]
    
    # RAG: Vector search across FileInsights
    search_results = await vector_search(
        question,
        file_ids=file_ids,
        entity_types=["FileInsight", "ProjectNote"]
    )
    
    if models_only:
        return {"segments": search_results}
    
    # Synthesis: LLM で統合
    response = await llm.ask(
        question,
        context=[r.content for r in search_results],
        citations=[
            {
                "file_id": r.file_id,
                "insight_id": r.insight_id,
                "timestamp": r.metadata.get("timestamp")
            }
            for r in search_results
        ]
    )
    
    return {
        "answer": response.text,
        "citations": response.citations,
        "search_results": search_results
    }
```

---

## 9. 関連ファイル索引（コードを読みたい人向け）

### Conceptual Documents

| ファイル | 内容 |
|---------|------|
| `/tmp/research/open-notebook/docs/2-CORE-CONCEPTS/notebooks-sources-notes.md` | 3層モデルの完全説明（必読） |
| `/tmp/research/open-notebook/docs/2-CORE-CONCEPTS/chat-vs-transformations.md` | Chat/Ask/Transformation の使い分け |
| `/tmp/research/open-notebook/docs/2-CORE-CONCEPTS/ai-context-rag.md` | RAG とコンテキスト管理戦略 |
| `/tmp/research/open-notebook/docs/7-DEVELOPMENT/architecture.md` | システム全体図（未読だが参考） |

### Core Data Models

| ファイル | 内容 |
|---------|------|
| `/tmp/research/open-notebook/open_notebook/domain/base.py` (362 行) | ObjectModel / RecordModel 基底クラス |
| `/tmp/research/open-notebook/open_notebook/domain/notebook.py` (681 行) | Notebook / Source / SourceEmbedding / SourceInsight / Note / ChatSession |
| `/tmp/research/open-notebook/open_notebook/domain/transformation.py` (22 行) | Transformation テンプレート定義 |

### Database & Schema

| ファイル | 内容 |
|---------|------|
| `/tmp/research/open-notebook/open_notebook/database/async_migrate.py` | Migration フレームワーク |
| `/tmp/research/open-notebook/open_notebook/database/migrations/1.surrealql` (179 行) | 初期スキーマ（テーブル、イベント、関数） |
| `/tmp/research/open-notebook/open_notebook/database/migrations/3.surrealql` (146 行) | ChatSession 追加 + vector_search 改良版 |

### API / Routers

| ファイル | 内容 |
|---------|------|
| `/tmp/research/open-notebook/api/routers/notebooks.py` (355 行) | Notebook CRUD + delete preview / cascade |
| `/tmp/research/open-notebook/api/routers/sources.py` (900+ 行) | Source upload / vectorize / insight 管理 |
| `/tmp/research/open-notebook/api/routers/notes.py` (250+ 行) | Note CRUD |
| `/tmp/research/open-notebook/api/routers/chat.py` (800+ 行) | Chat session + execute + context building |
| `/tmp/research/open-notebook/api/routers/search.py` (250+ 行) | text_search / vector_search wrapper |
| `/tmp/research/open-notebook/api/routers/context.py` (150+ 行) | Context level management |

### LangChain Integration

| ファイル | 内容 |
|---------|------|
| `/tmp/research/open-notebook/open_notebook/graphs/chat.py` | Chat graph (question → retrieval → response) |
| `/tmp/research/open-notebook/open_notebook/graphs/source.py` | Source ingestion graph |

### Litloft Reference (for comparison)

| ファイル | 内容 |
|---------|------|
| `/Users/libre/Sources/video_share/.claude/rules/design-decisions.md` | File / FileRelation / FileActiveSummary 設計 |
| `/Users/libre/Sources/video_share/backend/app/models.py` | File / Drive / FileRelation / FileActiveSummary 定義 |

---

## 10. 重要な設計パターン

### 10.1 Async Command / Job Queue

**原則**: 長時間処理（embedding, extraction, insight generation）を HTTP handler から切り離す

```python
# ❌ 悪い例（タイムアウト、接続プール枯渇）
@router.post("/sources/{source_id}/vectorize")
async def vectorize_source(source_id: str):
    embeddings = await embed_all_chunks(source_id)  # 30min で timeout
    return {"status": "done"}

# ✅ 良い例（Open Notebook パターン）
@router.post("/sources/{source_id}/vectorize")
async def vectorize_source(source_id: str):
    command_id = submit_command("open_notebook", "embed_source", {"source_id": source_id})
    return {"command_id": command_id, "status": "submitted"}

# 別プロセスで実行
async def embed_source_job(source_id: str):
    source = await Source.get(source_id)
    chunks = extract_chunks(source.full_text)
    embeddings = await batch_embed(chunks)
    await SourceEmbedding.bulk_create(embeddings)  # transaction conflict retry 内部
```

**Litloft への応用**: Intelligence addon の Whisper / CLIP / Podcast generation をすべてこのパターンに

### 10.2 Cascade Delete の明示化

Open Notebook: 削除時に「何が削除されるか」をプレビュー

```python
# 削除前に確認
preview = await notebook.get_delete_preview()
# {
#   "note_count": 10,
#   "exclusive_source_count": 3,  # このノートだけの source
#   "shared_source_count": 5       # 他のノートでも使われている source
# }

# ユーザー確認後に削除
await notebook.delete(delete_exclusive_sources=True)
```

**Litloft への応用**:
```python
async def get_project_delete_preview(project_id: str):
    return {
        "note_count": len(await ProjectNote.query(project_id=project_id)),
        "file_count_exclusively_in_project": ...,
        "file_count_in_other_projects": ...,
    }
```

### 10.3 1対多 vs 多対多の関係定義

| 関係 | Open Notebook | 実装パターン |
|-----|---|---|
| **多対多** | Source ↔ Notebook | RELATION `reference` テーブル（明示的） |
| **1対多** | Note → Notebook | RELATION `artifact` テーブル（FK + cascade） |
| **1対多** | ChatSession → Notebook | RELATION `refers_to` テーブル |

**Litloft への教訓**: FileRelation は「同じ静的事実」だが、FileActiveSummary は「現在の state」→ 2 テーブル分離が正解

### 10.4 Vector Search の Minimum Threshold

```python
async def vector_search(
    query: str,
    ...,
    minimum_score: float = 0.2  # ← 重要
):
    embed = await generate_embedding(query)
    results = await repo_query(
        "SELECT * FROM fn::vector_search($embed, $results, ..., $minimum_score)",
        {"minimum_score": minimum_score}
    )
```

**意味**: cosine similarity < 0.2 のマッチは「関連性が低い」として自動除外

**Litloft への応用**: Intelligence Ask で誤った answer を避けるため同様に threshold 設定

---

## 11. 学習すべき点（特に Litloft 開発者向け）

### スコープ管理の重要性

Open Notebook の Notebook → Litloft の Drive/ResearchProject:
- **Notebook = 研究プロジェクトのスコープ**: 「この研究で使うデータはどれか」をはっきり定義
- **Benefits**: 
  - "どのデータが関連あるか" の問合せが高速（全体スキャンでなく scope 内）
  - 権限管理が単純（project 単位で grant/revoke）
  - データ削除時の影響範囲が明確

### Embedding の段階化

Open Notebook の 3 種類:
1. **SourceEmbedding**: Chunk level（RAG 用）
2. **SourceInsight**: 洞察 level（知識検索用）
3. **Note**: ユーザー知識 level（cross-project 検索用）

**Litloft への応用**: FileSegment (Whisper chunk) → FileInsight (scene summary) → FileActiveSummary (昇格) の段階化により、「粒度に応じた検索」が可能に

### 非同期処理の必須性

大規模ファイル（1GB 動画、1000 ページ PDF）を扱う場合、**HTTP handler 内で同期処理は危険**

→ Job Queue（surreal-commands）が必須

---

<!-- investigation-complete -->
