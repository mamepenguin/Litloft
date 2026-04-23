# Open Notebook Transformations 調査

## 1. Transformation とは（公式定義 + 実装観察）

Open Notebook における **Transformation** は、ソース（Source）に対して**テンプレート化されたLLM処理を適用して、構造化された派生コンテンツ（Insight）を生成する仕組みである。

公式定義（docs/2-CORE-CONCEPTS/chat-vs-transformations.md より）：
- **テンプレートベース処理**: 再利用可能なテンプレートをソースに対して適用
- **一度に1ソース**: 複数ソースの場合は1つずつ順番に実行（将来的にバッチ処理予定）
- **構造化出力**: 生成結果は Note として保存される
- **リピート可能**: 同じテンプレートを複数のソースに順番に実行

実装からの観察：
- Transformation はデータベースの `transformation` テーブルに保存（`name`, `title`, `description`, `prompt`, `apply_default` フィールド）
- プロンプトは **Plain Text（プレースホルダ付き）** で、Jinja2 テンプレート処理対応
- 生成結果は `SourceInsight` テーブルに保存され、その後 `Note` に変換可能
- 実行時に LLM プロバイダ/モデルを明示的に指定可能

---

## 2. データモデル

### 2.1 Transformation（定義そのもの）

**ファイル**: `open_notebook/domain/transformation.py`

```python
class Transformation(ObjectModel):
    table_name: ClassVar[str] = "transformation"
    name: str                    # 識別子（例："summary", "key_concepts"）
    title: str                   # 表示名（例："Summary"）
    description: str             # ユーザー向け説明
    prompt: str                  # テンプレート本体（Jinja2対応）
    apply_default: bool          # ソース取り込み時のデフォルト適用フラグ
```

**重要**: 
- `apply_default=True` の Transformation は、ソース追加時に **自動的に実行される**
- プロンプトは **Jinja2 テンプレート** で、 `{{ variable }}` 形式でデータを参照可能
- Transformation は手動作成も可能（UI から）

### 2.2 Insight（生成結果）

**ファイル**: `open_notebook/domain/notebook.py`

```python
class SourceInsight(ObjectModel):
    table_name: ClassVar[str] = "source_insight"
    insight_type: str            # transformation の title を格納
    content: str                 # 生成されたテキスト
    
    async def get_source(self) -> Source:
        """親のソースを取得"""
        
    async def save_as_note(self, notebook_id: Optional[str] = None) -> Note:
        """Insight を Note に変換"""
```

**データベース関係性**:
- `source_insight` テーブルは source への **参照** を持つ
- 1つの Source は複数の SourceInsight を持てる（異なる insight_type ごと）
- SourceInsight は自動的に **embedding を生成される**（非同期コマンド経由）

---

## 3. 実行フロー（グラフ）

### 3.1 手動実行フロー

```
API POST /transformations/execute
    ↓
TransformationExecuteRequest
    - transformation_id
    - input_text (またはソースから自動取得)
    - model_id
    ↓
open_notebook/graphs/transformation.py::transformation_graph
    ├─ run_transformation()
    │   ├─ DefaultPrompts から transformation_instructions を取得
    │   ├─ Jinja2 テンプレート処理: prompt を state でレンダリング
    │   ├─ LLM呼び出し（provision_langchain_model で model_id を指定）
    │   │   ├─ SystemMessage: transformation_template + input
    │   │   └─ HumanMessage: input_text / source.full_text
    │   ├─ Response クリーニング（thinking content 除去）
    │   ├─ source.add_insight() で SourceInsight 作成（非同期コマンド）
    │   └─ output 返却
    ↓
TransformationExecuteResponse
    - output: 変換後テキスト
    - transformation_id
    - model_id
```

### 3.2 ソース取り込み時の自動フロー

```
SourceProcessingInput (commands/source_commands.py)
    - source_id
    - transformations: List[str]  ← apply_default=True のものが入る
    ↓
process_source_command
    ├─ Transformation.get() で全transformation を読み込み
    ├─ source_graph を実行（LangGraph workflow）
    │   ├─ content_process: 多言語対応テキスト抽出（content-core）
    │   ├─ save_source: 抽出テキストを source.full_text に保存
    │   │   └─ source.vectorize() で embedding job 投入（非同期）
    │   ├─ trigger_transformations: 各 transformation を Send で並列投入
    │   └─ transform_content: 各 transformation を個別に実行
    │       ├─ transform_graph.ainvoke()
    │       └─ source.add_insight() で結果を SourceInsight に
    ↓
SourceProcessingOutput
    - insights_created: int
    - embedded_chunks: int (embedding jobs 投入数、完了ではない)
```

**重要**: SourceInsight 作成は **非同期コマンド（fire-and-forget）** 。結果作成 + embedding 処理が背後で進行。

---

## 4. プロンプトの構造

### 4.1 テンプレート処理パイプライン

**ファイル**: `open_notebook/graphs/transformation.py::run_transformation()`

```python
transformation_template_text = transformation.prompt
default_prompts: DefaultPrompts = DefaultPrompts(transformation_instructions=None)
if default_prompts.transformation_instructions:
    # グローバルな instruction をプリペンド
    transformation_template_text = f"{default_prompts.transformation_instructions}\n\n{transformation_template_text}"

transformation_template_text = f"{transformation_template_text}\n\n# INPUT"

# Jinja2 レンダリング
system_prompt = Prompter(template_text=transformation_template_text).render(
    data=state
)
```

### 4.2 変数バインディング

`Prompter` の `render(data=state)` で以下の state 変数が available：
- `input_text`: 変換対象テキスト
- `source`: Source オブジェクト（title, topics, full_text など）
- `transformation`: Transformation オブジェクト（name, title, description など）

**例**:
```
プロンプト内:
  "Analyze this {{transformation.title}} from source '{{source.title}}':"

実行時に:
  "Analyze this Summary from source 'Research Paper 2025.pdf':"
```

### 4.3 DefaultPrompts（グローバルインストラクション）

**ファイル**: `open_notebook/domain/transformation.py`

```python
class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "open_notebook:default_prompts"
    transformation_instructions: Optional[str] = None
```

- **シングルトン** パターン（`record_id` が固定）
- **グローバル前置き指示** を全 transformation に付与
- API エンドポイント `GET/PUT /transformations/default-prompt` で管理

**用途例**: "これらの transformation は論文分析用です。以下の形式を守ってください："といった共通ルール

---

## 5. Built-in Transformations 一覧

ユーザーガイド（docs/3-USER-GUIDE/transformations.md）より：

1. **Summary**
   - 200-300 語の概要生成
   - キーポイント、主張、結論の抽出
   - 用途: クイックリファレンス、高速理解

2. **Key Concepts**
   - 主要アイデアと用語の抽出
   - コンセプトごとの説明
   - 用途: 新トピック学習、語彙構築

3. **Methodology**
   - 研究アプローチの抽出
   - 実施方法の詳細
   - 用途: 学術論文、研究レビュー

4. **Takeaways**
   - 実行可能な洞察の抽出
   - 何をすべきか
   - 用途: ビジネス文書、実践的ガイド

5. **Questions**
   - ソースが喚起する質問の生成
   - オープンクエスチョン、ギャップ、フォローアップ研究
   - 用途: 文献レビュー、研究計画

**実装上**: これらは initialization 時に `transformation` テーブルに seed データとして投入される（実装コード確認済み）。

---

## 6. ユーザー定義と UI

### 6.1 API エンドポイント

**ファイル**: `api/routers/transformations.py`

```
GET    /transformations              → List[TransformationResponse]
POST   /transformations              → TransformationResponse（新規作成）
GET    /transformations/{id}         → TransformationResponse
PUT    /transformations/{id}         → TransformationResponse（更新）
DELETE /transformations/{id}         → {"message": "..."}
POST   /transformations/execute      → TransformationExecuteResponse

GET    /transformations/default-prompt     → DefaultPromptResponse
PUT    /transformations/default-prompt     → DefaultPromptResponse（更新）
```

### 6.2 作成フロー

```python
@router.post("/transformations")
async def create_transformation(transformation_data: TransformationCreate):
    new_transformation = Transformation(
        name=transformation_data.name,
        title=transformation_data.title,
        description=transformation_data.description,
        prompt=transformation_data.prompt,
        apply_default=transformation_data.apply_default,
    )
    await new_transformation.save()
    return TransformationResponse(...)
```

**制限**:
- name, title, description, prompt すべて必須
- apply_default は optional（デフォルト False）
- **ユーザーは任意の prompt を定義できる** — validation なし

### 6.3 フロントエンド統合

**ファイル**: `frontend/src/lib/hooks/use-transformations.ts`（推定）

UI から:
1. 「Create Transformation」フォーム
2. 既存 transformation リスト表示
3. 各 transformation の「Apply」ボタン
4. 単一 source または複数 source（バッチ）への適用

---

## 7. 再生成と invalidation

### 7.1 Insight の再生成（明示的）

**現在の実装**:
- SourceInsight は **削除** して **再実行** が必要
- 自動 invalidation メカニズムなし

```python
# API
DELETE /insights/{insight_id}

# その後、transformation を再実行
POST /transformations/execute
    - input_text: source.full_text
    - transformation_id
    - model_id
```

### 7.2 ソース更新時の影響

**現在**: ソースの full_text が更新されても、既存 insight は **自動削除されない**
- 古い insight と新しい source が不整合になる可能性
- **ユーザー責任** で古い insight を削除し再実行

**実装上の注記**:
```python
# source.py::delete()
await repo_query(
    "DELETE source_insight WHERE source = $source_id",
    {"source_id": source_id},
)
```
ソース削除時のみ cascading delete 実装

### 7.3 提案: Versioning メカニズム

（Future）SourceInsight に version field を追加して、「このソースの最新バージョン用」を track することで、自動 invalidation を実装可能。

---

## 8. LLM モデル選択

### 8.1 実行時モデル指定

```python
class TransformationExecuteRequest(BaseModel):
    transformation_id: str      # 実行する transformation
    input_text: str            # テキスト（ソース full_text 優先）
    model_id: str              # ← 実行時に指定可能
```

### 8.2 モデル検証

```python
@router.post("/transformations/execute")
async def execute_transformation(execute_request: TransformationExecuteRequest):
    model = await Model.get(execute_request.model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    result = await transformation_graph.ainvoke(
        dict(input_text=..., transformation=...),
        config=dict(configurable={"model_id": execute_request.model_id})
    )
```

### 8.3 デフォルトモデル

**ファイル**: `api/models.py`

```python
class DefaultModelsResponse(BaseModel):
    default_chat_model: Optional[str] = None
    default_transformation_model: Optional[str] = None   # ← あり
    large_context_model: Optional[str] = None
    ...
```

ただし、実装ではトランスformation実行時に **常に model_id を明示指定** する仕様のため、デフォルトモデルは使用されない（推定）。

---

## 9. Litloft への示唆

### 9.1 Knowledge Addon Phase 3 との接続

Litloft のロードマップ：
- Phase 1 (Done): FileActiveSummary で「このファイルの active summary はこのノート」を表現
- Phase 2: Intelligence addon で既存 transformation を活用
- Phase 3 (計画): Knowledge addon = **ユーザー定義 transformation 群** + **再利用可能なプロンプト**

Open Notebook から学ぶ：
1. **Transformation はシンプルな構造で十分** — name, title, description, prompt だけ
2. **Jinja2 テンプレーティングで十分な柔軟性** — state 変数バインディング機構
3. **実行時モデル選択が重要** — transformation ごとに異なるモデルを使いたいユースケース多い

### 9.2 FileActiveSummary との対応

現在（Litloft）:
```python
class FileActiveSummary(Base):
    file_id: int
    note_id: int  # ← このノートがアクティブ要約
    created_at: datetime
    updated_at: datetime
```

Open Notebook との対応：
- `file_id` ≈ Source
- `note_id` ≈ Note（from SourceInsight.save_as_note()）
- Insight ≈ 中間表現（LLM出力をそのまま保存、後で Note に変換）

**推奨**: Litloft も SourceInsight に相当する中間テーブルを導入して、
「Transformation → Insight（検証段階）→ Note（確定）」という 2段階フローにすることで、
品質管理と再生成が容易になる。

### 9.3 直接取り込める発想

#### 9.3.1 DefaultPrompts シングルトン

Open Notebook：
```python
class DefaultPrompts(RecordModel):
    record_id: ClassVar[str] = "open_notebook:default_prompts"
    transformation_instructions: Optional[str] = None
```

Litloft で活用：
```python
class KnowledgeAddonDefaults:
    """シングルトン設定モデル"""
    transformation_prefix: str  # 全transformation に付与する共通指示
    enable_auto_transformations: bool
    default_model_for_transformations: str
```

#### 9.3.2 Transformation Apply Default フラグ

Open Notebook：
```python
class Transformation(ObjectModel):
    apply_default: bool
```

使用例：
- ファイル追加時に自動実行する transformation を「apply_default=True」でマーク
- Intelligence addon の `auto_tags`, `summaries` といった feature flag との統合

#### 9.3.3 非同期コマンドパターン

Open Notebook：
```python
async def add_insight(self, insight_type: str, content: str) -> Optional[str]:
    command_id = submit_command(
        "open_notebook",
        "create_insight",
        {
            "source_id": str(self.id),
            "insight_type": insight_type,
            "content": content,
        },
    )
    return str(command_id)
```

Litloft の Intelligence addon で活用：
```python
async def run_transformation(file_id: int, transformation_id: str):
    # 1. LLM呼び出し（同期）
    result = await llm.invoke(...)
    
    # 2. Insight 作成（非同期コマンド）
    submit_command("litloft", "create_file_insight", {
        "file_id": file_id,
        "transformation_id": transformation_id,
        "content": result
    })
    
    # 3. 即座に戻る（ユーザーは待たない）
```

### 9.4 アドオン境界を壊さずに取り込む方法

**提案**: Intelligence addon の内部に Transformation 概念を組み込む

```
intelligence/
  ├─ models.py
  │   ├─ Transformation          # ← 新規（transformation ID, prompt, apply_default）
  │   └─ FileInsight             # ← 既存（生成結果の中間保存）
  ├─ service.py
  │   ├─ run_transformation()
  │   ├─ get_all_transformations()
  │   └─ create_custom_transformation()
  ├─ routers/
  │   └─ transformations.py       # ← 新規
  └─ addon_config.yaml
      ├─ auto_transformations: ["detailed_summary", "key_questions"]
      └─ enable_custom_transformations: true
```

**利点**：
- Intelligence addon の責務が明確（insight 生成）
- Knowledge addon (Phase 3) が「transformation の再利用性管理」に特化可能
- アドオン間の結合度が低い

### 9.5 具体的な改善提案（優先度付き）

#### 優先度 1: FileInsight → Transformation の統合

**現在**:
```python
class FileInsight:
    type: str  # "auto_tags", "summary", "detailed_summary", "transcript_refine"
```

**改善**:
```python
class FileInsight:
    transformation_id: str  # ← 実行した transformation を記録
    transformation_version: int  # ← 再生成時の世代管理
    type: str  # ← Transformation.name の値
    content: str
    created_at: datetime
    invalidated_at: Optional[datetime]  # ← ソース更新時に set
```

**効果**：
- 「どの transformation が生成したか」が追跡可能
- 同じ transformation を複数バージョン持つ文献管理型ワークフロー対応

#### 優先度 2: Jinja2 テンプレーティングの導入

**現在**: プロンプトはハードコード

**改善**:
```python
# intelligence/prompts/detailed_summary.jinja2
Summarize this {{file_type}} in {{language}}:

File: {{file_name}}
Duration: {{duration}}  # ビデオの場合
Transcript: {{transcript}}

Output format: {{format}}  # "markdown", "bullet_points", etc.
```

**効果**：
- プロンプト再利用性向上
- ユーザー定義 transformation 時の表現力向上

#### 優先度 3: 非同期コマンドパターンの導入

**現在**: Whisper / CLIP / BLIP は同期実行で HTTP接続をブロック

**改善**:
```python
# intelligence/commands/run_transformation.py
@command(
    "run_transformation",
    app="litloft",
    retry={...}
)
async def run_transformation_command(input_data: RunTransformationInput):
    # 1. Transformation fetch
    transformation = await Transformation.get(input_data.transformation_id)
    
    # 2. LLM invoke
    result = await provision_model(input_data.model_id).ainvoke(...)
    
    # 3. FileInsight create with retry
    await FileInsight(
        file_id=...,
        transformation_id=...,
        content=result,
    ).save()
    
    # 4. Embedding submit (fire-and-forget)
    submit_command("litloft", "embed_file_insight", {...})
```

**効果**：
- 大型ファイル処理でのタイムアウト回避
- UI レスポンスが即座に返る

#### 優先度 4: ユーザー定義 transformation UI

**実装例**:
```
Knowledge Addon → "Manage Transformations"
├─ Built-in: [Summary] [Detailed Summary] [Key Questions] [Teaching Outline]
└─ Custom:
    ├─ [Create New] ← フォーム
    │   - Name: "Video Concept Map"
    │   - Description: "Extract main concepts and relationships"
    │   - Prompt: [Jinja2 テンプレート エディタ]
    │   - Apply by default: [toggle]
    │   - [Test on Sample File] [Save]
    └─ [Edit] [Delete] ← 各カスタム transformation
```

**変更**: `intelligence/config.yaml`
```yaml
transformations:
  - id: detailed_summary
    type: builtin
    apply_default: true
    model: claude-haiku
    
  - id: video_concept_map
    type: custom
    apply_default: false
    model: claude-sonnet  # ← custom は powerful model
    prompt: |
      Extract the concept map from this video...
```

---

## 10. 関連ファイル索引

### Domain Models
- `/tmp/research/open-notebook/open_notebook/domain/transformation.py` — Transformation, DefaultPrompts
- `/tmp/research/open-notebook/open_notebook/domain/notebook.py` — Source, SourceInsight, Note

### Graphs & Execution
- `/tmp/research/open-notebook/open_notebook/graphs/transformation.py` — transformation_graph (実行エンジン)
- `/tmp/research/open-notebook/open_notebook/graphs/source.py` — source_graph (ソース取り込みフロー)

### API & Routers
- `/tmp/research/open-notebook/api/routers/transformations.py` — REST endpoints
- `/tmp/research/open-notebook/api/routers/insights.py` — Insight 関連 endpoints
- `/tmp/research/open-notebook/api/models.py` — Request/Response schemas
- `/tmp/research/open-notebook/api/transformations_service.py` — Service layer
- `/tmp/research/open-notebook/api/insights_service.py` — Insight service layer

### Commands (Background Jobs)
- `/tmp/research/open-notebook/commands/source_commands.py` — process_source_command
- `/tmp/research/open-notebook/commands/embedding_commands.py` — create_insight_command, embed_insight_command

### Prompts & Templates
- `/tmp/research/open-notebook/prompts/ask/` — Ask feature prompts
- `/tmp/research/open-notebook/prompts/chat/` — Chat system prompt

### Documentation
- `/tmp/research/open-notebook/docs/2-CORE-CONCEPTS/chat-vs-transformations.md` — 概念説明
- `/tmp/research/open-notebook/docs/3-USER-GUIDE/transformations.md` — ユーザーガイド

### Database Schema (Inferred)
```sql
transformation {
  id: RecordID,
  name: string,
  title: string,
  description: string,
  prompt: string,          # Jinja2 template
  apply_default: boolean,
  created: datetime,
  updated: datetime
}

source_insight {
  id: RecordID,
  source: RecordID,        # 親ソースへの参照
  insight_type: string,    # transformation.title
  content: string,         # LLM生成テキスト
  embedding: vector,       # async で埋め込み
  created: datetime,
  updated: datetime
}

record: open_notebook:default_prompts {
  transformation_instructions: string  # グローバル前置き
}
```

---

## 追記: 設計パターンの抽出

### パターン 1: 非同期コマンド（Surreal Commands）

**課題**: HTTP接続プール枯渇、タイムアウト

**解決**:
```
API→ Job Submit → 即座に戻る → Job実行（background）
```

Open Notebook の実装：
- `source.add_insight()` → `submit_command("create_insight", {...})`
- `source.vectorize()` → `submit_command("embed_source", {...})`
- `note.save()` → `submit_command("embed_note", {...})`

**Litloft への応用**：
Intelligence addon で同じパターン採用 → Large file, LLM intensive な処理が解放される

### パターン 2: グローバルな前置き指示（DefaultPrompts）

**課題**: 複数の transformation が類似の「共通ルール」を繰り返す

**解決**:
```
transformation.prompt = "[DefaultPrompts.transformation_instructions]" + "\n\n[Custom Prompt]"
```

**Litloft への応用**：
```
DefaultKnowledgeAddonConfig.instruction_prefix = "You are analyzing a video file. Focus on..."
```

### パターン 3: テンプレート化されたプロンプト（Jinja2）

**課題**: ハードコードされたプロンプトが再利用・カスタマイズ困難

**解決**:
```python
Prompter(template_text=transformation.prompt).render(data=state)
```

state 変数：
- `source`: ソースオブジェクト全体
- `transformation`: transformation オブジェクト全体
- `input_text`: テキスト本体

**Litloft への応用**：
```jinja2
# intelligence/prompts/detailed_summary.jinja2
Summarize this {{file.type}} file:
File: {{file.name}}
Duration: {{file.duration}}
Transcript: {{transcript}}
```

### パターン 4: Insight → Note の2段階フロー

**課題**: LLM出力を直接 Note にすると、QA や品質確認が困難

**解決**:
```
Transformation → SourceInsight（自動生成、検証前）
                 ↓ [ユーザーチェック]
                 → Note（確定、ユーザー編集可）
```

**Litloft への応用**：
```python
class FileInsight(Insight):  # ← 中間表現
    transformation_id: str
    
    async def promote_to_note(self, notebook_id: str) -> Note:
        """Insight → Note に昇格（確定）"""
```

---

## 総括

Open Notebook の Transformation 機構は、以下の特徴を持つ **シンプルで拡張性の高い設計** である：

1. **定義**: name + prompt の組み合わせ（テーブルに保存可能）
2. **実行**: Jinja2 + LangGraph で state-based パイプライン
3. **出力**: SourceInsight（中間）→ Note（確定）の2段階
4. **拡張性**: ユーザーが任意のプロンプトで新 transformation 作成可能
5. **実装**: 非同期コマンドで大規模処理に対応

Litloft の **Knowledge addon Phase 3** への提案：

| 要素 | Open Notebook | Litloft改善案 |
|------|---------------|---------|
| 定義 | Transformation テーブル | Intelligence addon で管理 |
| プロンプト | Jinja2 テンプレート | same（導入推奨） |
| 実行 | LangGraph + async command | same（非同期化推奨） |
| 出力 | SourceInsight テーブル | FileInsight + world tracking |
| UI | 「Transformations」ページ | Knowledge addon 内に integration |
| ユーザー定義 | API + UI で自由度高い | Phase 3 で実装（優先度1） |

これらを段階的に導入することで、Intelligence addon は「固定的な insight 生成」から「ユーザーカスタマイズ可能な transformation プラットフォーム」へ進化する。

<!-- investigation-complete -->
