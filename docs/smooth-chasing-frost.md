# HomeVault × Karpathy Second Brain / WriteBack-RAG — 取り込み提案書

---

## 哲学 (Why)

### 参照記事
- **記事1 (Karpathy Second Brain)**: raw/ に全部放り込み、AI が wiki/ を自動生成。**質問→回答を Wiki に書き戻す複利ループ**が核。
- **記事2 (WriteBack-RAG, 2026/03)**: Agentic RAG で苦労して集めた複数文書の知見を蒸留し、**元ナレッジとは別の DB に書き戻す**。検索時は両方引く。全部書き戻すと劣化するので「本当に有用なもの」だけに絞る。

### HomeVault がこれを取り込む意味
HomeVault は元々ファイル管理アプリだが、**Obsidian/Notion が要求する「書く文化」を持たない多数派**にとって第二の脳の最後の砦になりうる。生活の副産物として既に動画・写真・音声・PDF が TB 単位で蓄積されており、Whisper/CLIP/BLIP が「書かれなかった知識」を読める状態にしている。記事1/2 の複利ループを**低摩擦経路**として差し込めば、「ファイルを開くついでに Wiki が育つ」という他 KB にない体験が生まれる。

### 守るべき設計原則 (譲れない線)
1. **ステートレス Ask は死守**: `POST /ask` は副作用なし。書き戻しは明示 approve 経由でのみ発生。(既存の `docs/superpowers/specs/2026-04-10-intelligence-rag.md` に明文化済み)
2. **元ナレッジは汚さない**: intelligence の embedding/transcript/summaries は自動再生成可能な派生層。書き戻し (蒸留ノート) は knowledge 側の独立 DB に隔離。
3. **ドライブ = セキュリティ境界**: 蒸留ノートは `drive_id` 必須、単一ドライブ source 制約で越境禁止。per-drive policy で AI OFF のまま使い続ける自由を最後まで担保。
4. **書き戻しは opt-in、まず manual**: `features.writeback: false/manual/on_answer` の3値 (既存 `features.auto_tags` と対称)。デフォルト `manual`。
5. **「第二の脳」の看板は出さない**: ユーザーが使い込んで自分でそう呼ぶのを待つ。Karpathy 式の脱力感 (「Obsidian 不要」) と同じ温度で届ける。
6. **raw は捨てない**: 動画・画像の蒸留は情報の射影であって等価物ではない。重くなる vault を肯定的に提示する (「記憶の地層」)。
7. **Wiki を独立した目的地にしない**: トップメニューから Wiki に行かせない。ファイル詳細・検索結果・Ask 応答のフッタに寄生させる。複利は「ファイルを開く動線」から生まれる。
8. **権威化の防止**: Ask 回答と Wiki エントリには**書かれた日付・情報源の古さ**を強制表示。蒸留と発酵を区別する UI。

### 体験の頂点
- **⚡ citation が初めて混ざる夜** — 「半年前の自分に助けられた」小さな感動
- **ファイルを開くと関連 Wiki スニペットが勝手に目に入る** — 複利の起点
- **1年後、Finder で探す頻度が激減する** — HomeVault がファイル管理アプリという語彙から外れる

### やらないこと (意図的に)
- raw/wiki/outputs の物理3フォルダ強制 (ドライブが既に raw 相当)
- ドライブ横断の Wiki・共有 Second Brain (scope=drive 原則と衝突)
- 自動 on_index 書き戻し (記事2 の「全部書き戻すと劣化」研究を尊重)
- ゲーミフィケーション (個人・家族どちらでも寒い)

---

## 取り込み推奨機能 (自己完結リファレンス)

**記法**: 各項目は `場所 / 何を / どう見える / なぜ / 依存` の順。
**推奨度**: ★★★ 必須 / ★★ 推奨 / ★ 任意

---

### ★★★ F1. Citation の種別タグ付け
- **場所 (backend)**: `addons/intelligence/app/rag/parser.py` の `Citation` dataclass に `kind: Literal['file','note']` を追加。`addons/intelligence/app/rag/service.py::stream_answer` の `citations` event の `data` にそのまま出す。
- **場所 (frontend)**: `addons/intelligence/frontend/Page.tsx` の Ask 回答描画部 (citations チップ) にバッジ 📄 / 📝 の出し分けを追加。
- **何を**: Ask 回答の citation を「生ファイル」「蒸留ノート」の2種に区別する型。現状は file_id 単一型。
- **どう見える**: 回答下の citation リストで `📄 video_2023.mp4 (06:42)` / `📝 ノート: 2025-11 の自分の整理` のように種別が一目で分かる。
- **なぜ**: 記事2 WriteBack-RAG の「元ナレッジと蒸留ノート両引き」を将来 F5 で統合した時、**ユーザーが情報源の種類を瞬時に判別できる UI 基盤**。この段階では `kind='file'` しか出さないが、型だけ先に入れておく。
- **依存**: なし (既存 Citation 型拡張のみ)
- **リスク**: 低。型拡張だけなので後方互換で導入可能。

### ★★★ F2. Ask 応答への writeback_hint 同梱
- **場所 (backend)**: `addons/intelligence/app/rag/service.py::stream_answer` の最後の `done` event の `data` に `writeback_hint` フィールドを追加。内容: 高スコア `file_ids` (既に citations に使った集合)、LLM に渡した `excerpts` の dict。
- **何を**: Ask 応答の payload に「後で蒸留するための種」を含める。Ask 本体は引き続きステートレス (DB 書き込みなし)。
- **どう見える**: ユーザーには見えない (裏方データ)。F3 の「Wiki に残す」ボタン押下時にフロントエンドがこれをサーバーに送り返すだけで、**2度目の検索/LLM 呼び出しが不要**になる。
- **なぜ**: 「Ask のステートレス性」と「複利の即時性」を両立する鍵。再検索しないので approve が低レイテンシ。
- **依存**: F1 不要。単独で導入可能。
- **リスク**: 低。ペイロードサイズはわずか増 (数十 file_id + 抜粋)。

### ★★★ F3. 「Wiki に残す」ボタン (Ask 応答下の明示 approve)
- **場所 (frontend)**: `addons/intelligence/frontend/Page.tsx` の Ask 回答ヘッダ近くにプライマリボタンを設置。クリックで preview モーダル (蒸留候補テキスト) → `approve` で knowledge 側 API を叩く。
- **場所 (backend)**: `addons/knowledge/app/routers/` 配下に新ルータ `notes.py` を追加。`POST /notes/distill` (writeback_hint を受け取って LLM で蒸留→suggested 状態の note を保存)、`POST /notes/{id}/approve`、`POST /notes/{id}/dismiss`、`GET /notes`。
- **何を**: 記事1 Step 6「質問→保存」の明示アクション。auto は絶対にやらない (家族でも個人でも、主体はユーザー)。
- **どう見える**: Ask 回答の右上に `[📝 Wiki に残す]` ボタン。クリック→プレビュー (72-93 token のコンパクトな蒸留文 + source_file_ids) →「保存」で knowledge vault に追加、「破棄」で破棄。
- **なぜ**: Karpathy Step 6 のコア。複利ループの入口。**質問した文脈が残っている瞬間**が判断力最高点。auto-tags が suggest→approve なのは AI が勝手に提案するから; Ask 保存はユーザー起点なので別パターン。
- **依存**: F2 必須 (hint がないと蒸留が重い)。F1 はあれば preview で kind='note' 表示できるが必須ではない。
- **リスク**: 中。LLM 呼び出しが1回発生。ただし hint があるので retrieval は走らず、タイムアウトリスクは小。

### ★★★ F4. knowledge アドオンに `distilled_notes` テーブル
- **場所 (backend)**: `addons/knowledge/app/models.py` に `DistilledNote` モデル追加。
  ```python
  # 想定スキーマ (実装時確定)
  class DistilledNote(Base):
      __tablename__ = "distilled_notes"
      __table_args__ = (UniqueConstraint("drive", "id"),)  # drive per-purge 用
      id: Mapped[int] = primary_key
      drive: Mapped[str]        # ドライブ境界
      viewer_id: Mapped[str]    # 個人ドライブで本人のみ表示するため
      content: Mapped[str]      # 蒸留文 (~72-93 tokens)
      source_file_ids: Mapped[str]  # JSON; 全て同一 drive 制約
      source_question: Mapped[str]  # 生成元の Ask
      status: Mapped[str]       # suggested | approved | dismissed
      health: Mapped[str]       # healthy | degraded | orphaned
      missing_source_ids: Mapped[str]  # JSON
      created_at, approved_at, created_day (表示用の固定日付)
  ```
- **場所 (migration)**: `addons/knowledge/app/database.py` のマイグレーション (既存 knowledge migration と同形)。
- **何を**: 記事2 WriteBack-RAG の「書き戻し先 別 DB」の HomeVault 版。
- **どう見える**: ユーザーには直接見えない。F3 の approve 先、F5 の retriever の2つ目の index、F8 の一覧ページのデータ源として裏で使われる。
- **なぜ**: 「元ナレッジを汚さない」原則の物理実装。intelligence DB (embedding/transcript) は FS から再生成可能だが、蒸留ノートは**再生成不可能なユーザー判断の結晶**。`clip_jobs` と同じく knowledge 側の一次資産。
- **依存**: F3 と対で導入 (片方だけでは意味がない)。
- **リスク**: 低。新規テーブル追加のみ、既存に影響なし。

### ★★ F5. Ask retriever に蒸留ノート index を合流
- **場所 (backend)**: `addons/intelligence/app/rag/retriever.py::retrieve_candidates` を拡張。現在は intelligence DB の file index のみ検索するが、knowledge の `distilled_notes` も併行検索し、`RetrievedFile` と同じ shape の `RetrievedNote` を混ぜ返す。knowledge の検索は `addons/knowledge/app/internal_client.py` 経由で呼ぶ。
- **場所 (parser)**: F1 で入れた `Citation.kind` がここで初めて `'note'` を返す経路が生きる。`addons/intelligence/app/rag/prompt.py` の system/user prompt に「ノート由来の context は kind: note として出典を付ける」指示を追加。
- **何を**: 記事2 WriteBack-RAG の「検索時は元ナレッジと蒸留 DB を両引き」を実装。
- **どう見える**: ユーザーの Ask 回答に `📝 ノート: 2025-11 の自分の整理「AWS のサブネット設計」` が citation として初めて混ざる。これが**⚡ 初遭遇の夜**の瞬間。
- **なぜ**: 複利ループの完成。approve して保存したノートが次の Ask で引かれる実感が、複利を複利たらしめる。
- **依存**: F1 (kind 型)、F4 (蒸留ノート実体)、F3 (最低1件の approve された note が存在する前提)。
- **リスク**: 中。retriever 拡張は検索品質に直接影響。既存の retrieval path は壊さない形で加算的に合流する (feature flag で off にできるように)。また knowledge 側に embedding を持たせるか、intelligence の embedding モデルを共用するかの判断が要る (推奨: 共用、knowledge 側は embedding カラムだけ持ち、intelligence が埋め込む)。

### ★★ F6. 情報源の古さ・日付の強制表示
- **場所 (frontend)**: Ask 回答の citation チップに `📝 ノート (2025-11-03, 5ヶ月前)` のように相対日付を常時表示。`addons/intelligence/frontend/Page.tsx`。
- **場所 (knowledge UI)**: `addons/knowledge/frontend/` の vault 表示コンポーネント (該当 slot) で蒸留ノート表示時に `created_day` を header に。
- **何を**: 「このノートは N ヶ月前に書かれた」「この raw は N 年前に撮られた」を常時可視化。
- **どう見える**: `📝 ノート「AWS サブネット設計」 2025-11-03 (5ヶ月前)` のような補足表示。古い情報源は色を薄く/ 警告アイコンを付ける選択肢も。
- **なぜ**: ダークシナリオ「Wiki の権威化」対策の核。3年前の自分の結論が「現在の事実」として扱われるのを防ぐ。**蒸留と発酵を区別する UI** の具体形。
- **依存**: F4 (日付フィールドが必要)。F1 があると kind で表示スタイル分岐できる。
- **リスク**: 低。表示追加のみ。

### ★★ F7. ファイル詳細に「関連 Wiki スニペット」セクション
- **場所 (frontend)**: `frontend/src/app/files/[id]/page.tsx` (または既存の slot 描画位置)。`file-detail-sections` スロットに knowledge の新コンポーネントを差し込む。
- **場所 (knowledge)**: `addons/knowledge/frontend/slots.ts` に `"related-notes"` を登録、`RelatedNotesSection.tsx` を新設 (既存 `KnowledgeEditSection.tsx` と同形)。API は `GET /notes?source_file_id=xxx`。
- **場所 (backend)**: `addons/knowledge/app/routers/notes.py` (F3 で新設) に `GET /notes` のフィルタ実装。
- **何を**: ファイルを開いたとき、そのファイルを source に含む蒸留ノートを一覧表示。
- **どう見える**: 動画ファイル詳細ページの下の方に「このファイルを参照しているノート (3件)」セクション。クリックで該当ノートの全文プレビュー。
- **なぜ**: **Wiki を独立目的地にしない**原則の具体実装。毎日ファイルを開く行為そのものが Wiki の再訪になる。複利の自然発生装置。
- **依存**: F4 + F3 (ノートが存在する前提)。
- **リスク**: 低。既存 slot 機構に乗るだけ。

### ★★ F8. ローカル LLM 前面化 (オンボーディング)
- **場所 (frontend)**: admin 画面 `frontend/src/app/admin/page.tsx` および intelligence 設定ページに「LLM 設定ウィザード」を追加。初回起動時に `ollama` を既定として提示、クラウド LLM は「外部 API に送信されます。契約書・研究データがある場合はローカル LLM を推奨」の警告付き2次選択肢。
- **場所 (backend)**: `addons/intelligence/search-config.yml.example` のコメントに「個人利用で機密情報を含む場合は ollama 推奨」を明記。
- **何を**: Ask/writeback を使う時に LLM にファイル内容が送られるリスクを UI 側で透明化。
- **どう見える**: 初回設定で「どの LLM を使いますか?」の選択画面に ollama がトップ、クラウドには明示的な警告ラベル。
- **なぜ**: 討議で特定された一等ターゲット (研究者・契約書を扱う編集者・投資家・翻訳者) は全員クラウド LLM を使えない。ここが**個人 KB としての差別化軸**。今の設定 UX は技術者以外に優しくない。
- **依存**: なし (既存 LLM 設定の UI 化のみ)。
- **リスク**: 低。純粋な UX 改善。

### ★★ F9. `features.writeback` フラグ (3値)
- **場所 (backend)**: `addons/intelligence/app/config.py` の `FeaturesConfig` dataclass に `writeback: str = "manual"` を追加 (`false | manual | on_answer`)。既存 `auto_tags` と対称。
- **場所 (config)**: `addons/intelligence/search-config.yml.example` に `writeback: manual` を追加、コメントで3値の意味を説明。
- **場所 (frontend)**: F3 の「Wiki に残す」ボタン表示可否をこのフラグで制御。`on_answer` では Ask 応答後に自動で draft を作る (まだ approved ではない)。
- **何を**: 書き戻しの有効化ポリシー。
- **どう見える**: ユーザーが設定で writeback を完全 OFF にできる。上級ユーザーは `on_answer` で自動 draft 化 (ただし approve は明示)。
- **なぜ**: 既存 `auto_tags` と同じ語彙で統一。記事2 の「全部書き戻すと劣化」研究に配慮して安全側に倒す。
- **依存**: F3。
- **リスク**: 低。フラグ追加のみ。

---

### ★ F10. ⚡ citation クリックで「過去の自分の全文」モーダル
- **場所 (frontend)**: `addons/intelligence/frontend/Page.tsx` の citation チップに onClick。`kind='note'` の時に modal で note 全文 + source_file_ids へのリンクを表示。
- **何を**: 「半年前の自分の整理」を即座に読めるようにする演出。
- **どう見える**: Ask 回答下の `📝 ノート: 2025-11 の整理` をクリック → モーダルで全文と元 file へのリンク。
- **なぜ**: 「過去の自分に助けられた」の感動を最大化する UX。必須ではないが投資対効果大。
- **依存**: F1, F5。
- **リスク**: 低。

### ★ F11. 月1ヘルスチェック widget
- **場所 (frontend)**: 既存の `dashboard-widgets` スロット (今は intelligence の `index-status` widget がある) に knowledge の新 widget を追加。`addons/knowledge/frontend/slots.ts` に `"health-check"` 登録。
- **場所 (backend)**: `addons/knowledge/app/routers/notes.py` に `GET /notes/health` (矛盾候補検出、missing source、古すぎる note の列挙)。矛盾検出は LLM 呼び出しが必要なので heavy、バックグラウンドジョブで月1実行。
- **何を**: 記事1 Step 7 のヘルスチェックを月1で自動実行し、結果を widget に表示。
- **どう見える**: dashboard に「矛盾候補 3件 / 未訪問 raw 12件 / 古いノート 5件 (1年以上前)」のカード。
- **なぜ**: Wiki 硬化の早期警告装置。Phase 3 以降、Wiki がある程度育ってから意味が出る。
- **依存**: F4, F5 が実装済み & ノートが数十件以上ある状態。
- **リスク**: 中。LLM 呼び出しコスト。最初はマーキングだけ (file_id の重複検出など非LLM) でもよい。

### ★ F12. ファイル詳細の「このファイルを引用しているノート」逆リンク
- **場所**: F7 の拡張 (F7 は source_file_id 完全一致、F12 は citation でも引用されたものを追加)。
- **何を**: 完全には source に含まれないが Ask citation で引かれた実績があるファイルに「このファイルは N 件のノートで言及されました」を表示。
- **なぜ**: 「自分の記憶が繋がった」感の更なる演出。
- **依存**: F5, F7 + Ask 履歴の軽量ログ (ただし discussed 設計の「Ask ステートレス」に抵触するので扱い注意。citation 実績だけを note 側で集計する形なら ok)。
- **リスク**: 中。ステートレス原則との整合を再確認する必要あり。

### ★ F13. 週次 "今週のあなたの関心トピック" widget
- **場所**: intelligence か knowledge の `dashboard-widgets` スロット。
- **何を**: 直近7日にアクセスされたファイル群から LLM で「今週の関心トピック 3件」を生成。
- **なぜ**: 「明日の自分への置き手紙」体験の具体化、習慣トリガー。
- **依存**: F5 (蒸留ノート生成の経験値)、intelligence 側のファイルアクセスログ (存在するか要確認)。
- **リスク**: 中。ログの有無次第、プライバシー配慮必須。

---

## 実装ステップ (段階別リリース)

### Phase 0: 方針確定 (1日)
- 本ドキュメントを `docs/superpowers/specs/` 配下に spec 化 (例: `2026-04-20-knowledge-writeback.md`)
- 既存 spec `2026-04-10-intelligence-rag.md` と連携する形で「Ask ステートレス堅持 + 書き戻しは knowledge 側」の方針を spec 化
- `docs/superpowers/specs/2026-04-14-intelligence-drive-scope.md` の per-drive policy 章に `writeback` feature を追加する方針を記載

### Phase 1: Citation 種別化と Ask の誠実化 (1-2週)
**目的**: ユーザーが見える変化は小さいが、Citation の型整備と writeback_hint を準備、Ask 回答を「いつの情報か」が分かる誠実なツールにする。

- F1: Citation に `kind` フィールド追加
- F2: Ask 応答に writeback_hint 同梱
- F6: Ask 回答の citation に相対日付 (「5ヶ月前」) を常時表示
- F8: ローカル LLM 前面化 (先行でやるとターゲット層にリーチしやすい)

**リリース基準**: 既存 Ask の振る舞いが壊れていない、citation の日付が全部出ている。

### Phase 2: distilled_notes と明示 approve 動線 (2-3週)
**目的**: ユーザーが「Wiki に残す」を押せる状態を作る。retriever 統合はまだ。

- F4: `distilled_notes` テーブル + migration
- F9: `features.writeback` 3値フラグ (default `false` でリリース、manual は opt-in)
- F3: 「Wiki に残す」ボタン + preview + approve API
- 蒸留 API の citation 捏造対策: `POST /notes/distill` でも既存 RAG の file_id 照合ロジックを通す
- missing/purged event hook で health 遷移 (既存 `files.missing/restored/purged` リスナーに knowledge を追加)

**リリース基準**: opt-in で writeback=manual にしたユーザーが、Ask 回答から1クリックで蒸留 note を貯められる。その note はまだ Ask に出ない。

### Phase 3: 複利ループ完成 (2週)
**目的**: approve された note が Ask に返ってくる。⚡ の初遭遇を生む。

- F5: retriever に distilled_notes index を合流 (feature flag 制御)
- F7: ファイル詳細に「関連ノート」スロット
- F10: ⚡ citation クリックで note 全文モーダル
- Phase 1 で入れた F6 の表示を note 側にも適用

**リリース基準**: approve 済み note が Ask citation に `📝 ノート` として混ざる。ファイル詳細で関連 note が見える。

### Phase 4: 習慣化と健全化 (任意、3-4週、利用実績を見て判断)
- F11: 月1ヘルスチェック widget
- F12: citation 逆リンク (ステートレス整合確認後)
- F13: 週次関心トピック widget
- `features.writeback: on_answer` の有効化 (Phase 3 までの使用データから品質が担保できそうなら)

---

## 各 Phase 後の体験

- **Phase 1 後**: Ask が「いつの情報かを教えてくれる誠実な検索」になる。ローカル LLM ユーザーが初回で詰まらなくなる。第二の脳の看板は出さない。
- **Phase 2 後**: 熱心なユーザーが「Wiki に残す」を押し始める。蒸留 note が貯まっていくが、まだ Ask には出ない (ユーザーは知識が成長しているのを vault ページで見る程度)。
- **Phase 3 後**: ⚡ 初遭遇が起きる。ファイルを開くと関連 note が目に入る。**複利ループが自走**。
- **Phase 4 後**: 硬化対策と習慣強化。使い込んだユーザーから「HomeVault はもうファイル管理アプリじゃない」という声が出始める(=目標)。

---

## この取り込みの成否を測る指標 (仮)
- Phase 2-3 跨ぎで **Ask 実行数 / 週** が減らない (増える方が望ましい)
- Phase 3 完了後 **Ask citation に `kind='note'` が含まれる割合** が 1ヶ月で 20%+ に
- Phase 3 完了後 **ファイル詳細からの関連ノート click-through 率** が 10%+
- Phase 4 で **月1ヘルスチェックで古すぎる (>1年) note の割合** が 10% 未満

---

## 参考リンク (プロジェクト内)
- `docs/superpowers/specs/2026-04-10-intelligence-rag.md` — Ask ステートレス原則
- `docs/superpowers/specs/2026-04-14-intelligence-drive-scope.md` — per-drive policy
- `.claude/rules/design-decisions.md` — ドライブ境界、ソフトデリート、missing 設計
- `addons/intelligence/app/rag/` — 既存 RAG 実装
- `addons/knowledge/app/models.py` — 現在の knowledge スキーマ (UserVault 中心)

---

# 以下: 討議プロセス記録 (参考資料)

## Context (Round A: アーキテクチャ討議)

ユーザーが共有した2記事のコンセプトを HomeVault の intelligence + knowledge アドオンに取り込む場合、どういう形になりうるかを議論する（**実装はしない**）。3エージェント（Architect / Backend / UX）を cmux 独立ペインで走らせ、ラウンド形式で相互質問・応答させた議論ログ。

---

## ラウンド1: 初期提言

### Architect
- **対応関係**: 記事1 raw = FS 上のファイル群（不可侵）、wiki = knowledge アドオンの蒸留ノート、outputs = 既存の comment/tag/playlist。CLAUDE.md ↔ `knowledge/schema.md`。記事1 Step 6 複利 ≈ 記事2 WriteBack-RAG ≈ Ask 応答の書き戻し。
- **最重要ポイント**: 「書き戻しは drive-scoped かつ opt-in」。`features.writeback: false/manual/on_answer` を auto-tags と同形で。knowledge DB を drive ごとに物理分離し横断参照を構造的に不可能化。
- **責任分担 (DAG)**: intelligence → knowledge（書き）、knowledge → intelligence（読み、retriever 経由）。循環禁止。

### Backend
- **保存先**: knowledge アドオン DB に `distilled_notes` 単独配置。
  ```
  distilled_notes(id, drive_id NOT NULL, content, embedding,
    source_file_ids JSON, source_question,
    status ENUM(suggested|approved|dismissed),
    quality_score, created_at, approved_at, approved_by)
  ```
  理由: intelligence DB は FS 再生成可能な派生層、knowledge は人の判断が入る一次資産層。
- **有用サンプル選別の多層信号**:
  1. 明示（強）: 保存ボタン、citation thumbs-up、auto-tags approve 率
  2. 暗黙（中）: 同ドライブで類似質問 N 回、citation ファイルを実際に開いた
  3. retrieval（弱）: top-k スコア分布のエントロピー、複数ファイル統合が必要だった質問

### UX
- **「使うほど賢くなる」感**: ゲーミフィケーションは家族規模では寒い。代わりに「今週 +3 件」程度の控えめログ、「過去の回答を3件再利用」の使い回し可視化、ファイル詳細に逆リンク「Wiki の◯◯に引用されています」。
- **approve/dismiss**: **明示 approve 一択**。knowledge は人の wiki という役割分離、家族利用では誰が書いたか (viewer_id) が意味を持つ、auto_tags と違い人の意図を伴う行為。
- **二種類の記憶**: knowledge = 人の wiki（明示）、intelligence = 機械の writeback キャッシュ（auto 可、元ナレッジ非汚染）。UI で明確に分離。

---

## ラウンド2: 相互応答

### Architect → Backend の「Ask の純粋関数性と複利の両立」
- **立場**: (ii) 完全分離寄り、**ただし半歩だけ (i)**
- Ask のステートレス性は spec 明文化の信頼性契約。崩すと citation 捏造対策と同格の監査可能性が壊れる。
- **半歩の譲歩**: Ask 応答 payload に `writeback_hint`（高スコア file_ids + 蒸留用抜粋）を同梱するだけ。積むのは UI の明示アクション経由。2回目の検索コスト不要で複利の即時感を担保、副作用は knowledge 側に閉じる。fire-and-forget は失敗時の扱い曖昧で不採用。
- **統合デザイン**:
  - intelligence: 機械キャッシュ層（embeddings/summaries/transcripts、自動、再生成可）
  - knowledge: 人の wiki 層（distilled_notes、Backend スキーマ採用、status ENUM に **stale** を追加）
  - **失効伝播**: `files.missing/purged` で該当ノート → `stale`（削除せず人の判断待ち）。部分 strip でなく stale 化（蒸留文脈が壊れるため）。

### Backend → Architect / UX の質問
- **summaries vs distilled_notes の軸**: 「単一ファイル要約 vs 複数ファイル統合」ではなく **「FS 再生成可能 vs 人の判断入り一次資産」**。後者は再インデックスで復元不可、故に別DB・別層。
- **missing 時の挙動（3値 health）**:
  ```
  health: healthy | degraded | orphaned
  missing_source_ids JSON
  ```
  - 1件でも missing → `degraded`（検索可、UI ⚠、citation から該当 file_id を strip）
  - 全 source missing → `orphaned`（検索除外、物理削除なし＝ Missing 設計思想踏襲）
  - recovered → `healthy` 復帰
- **Citation union 型**:
  ```typescript
  type Citation =
    | { kind: 'file'; file_id, range?, snippet }
    | { kind: 'note'; note_id, source_file_ids[], health }
    | { kind: 'wiki'; wiki_id, anchor? }  // 将来
  ```
  共通: `drive_id, confidence, display_title`。捏造対策は kind ごとに別 registry で照合。

### UX → Architect の「即時ボタン vs review キュー」
- **推奨**: **即時ボタン + 軽量 review キュー の併置**
  - プライマリ: Ask 応答直後の「Wiki に残す」ボタン（複利の即時性、質問文脈が残っている瞬間が判断力最高）
  - セーフティネット: dashboard-widget に「保存し忘れた最近の Ask 5件」（キューではなく履歴 + 遅延 approve）
  - 根拠: auto_tags が review キュー型なのは AI が勝手に提案したから。Ask 保存はユーザー起点なので別パターン。家族規模では後者が誰もやらない死に筋リスク。
- **UI 分離**:
  - `search-modes` = Ask（機械 writeback は裏方、UI 非表示）
  - `file-detail-sections` = Wiki 逆リンク（人の記憶）
  - `dashboard-widgets` = 「Wiki の成長」「Ask キャッシュ統計」を別カード
  - ラベル: 「ノート」（人） / 「学習済み応答」（機械、Ask 設定画面にのみ露出）
  - プライバシー: 回答末尾に `根拠: 📄 生ファイル2件 / 📝 ノート1件 / ⚡ 学習済み応答1件` を常時表示
  - ドライブ設定に **「このドライブが記憶している内容」** ページ（件数・全削除・policy OFF 時の挙動明記）

---

## 収束した統合デザイン（3役合意）

### アーキテクチャ二層
| 層 | 責任 | 特性 | DB |
|---|---|---|---|
| **intelligence** | retriever / LLM / 機械キャッシュ | ステートレス Ask 本体、FS 再生成可 | embeddings / transcripts / summaries / **writeback cache（auto可）** |
| **knowledge** | 人の wiki、蒸留ノート | 人の approve 必須、一次資産 | **distilled_notes**（drive_id 必須、単一ドライブ source 制約、health 3値） |

依存は一方向: `intelligence → knowledge` 書き、`knowledge → intelligence` 読み（retriever 合流）。循環禁止。

### Ask の複利フロー（ステートレス原則維持）
1. `POST /ask` → 応答に `writeback_hint` 同梱（副作用なし）
2. UI が「Wiki に残す」ボタン表示（プライマリ動線）
3. 押下 → `POST /knowledge/notes/distill`（hint を渡して再検索不要）→ `suggested`
4. プレビュー → approve で `approved`
5. 次回 Ask の retriever は両 index 検索（元 + distilled_notes）

### セキュリティ境界
- `drive_id NOT NULL` + 単一ドライブ source_file_ids 制約で越境蒸留を型レベル禁止
- per-drive policy OFF → `purge_drive` が distilled_notes も連動削除
- 既存 Internal API + manifest `drive_access_nested` の二重アクセス制御を citation 解決時にも適用
- `files.missing/purged` で health 遷移（削除せず stale/degraded/orphaned）

### UI 3種バッジ
`📄 生ファイル` / `📝 ノート（人）` / `⚡ 学習済み応答（機械）` を Citation kind と 1対1 対応

### features フラグ（auto-tags と対称）
- `features.writeback: false | manual | on_answer`（デフォルト manual）
- 機械 writeback キャッシュは別フラグで auto 可

---

## 残る懸念（未決）

1. **記事1 raw/ フォルダ概念**: HomeVault では「FS 上のドライブ」が既に raw 相当。別途 raw フォルダ導入は YAGNI（UX 見解）。採用見送り。
2. **ヘルスチェック（月1）**: dashboard-widget に「矛盾候補 N 件」として出す方針。実装優先度は低め。
3. **「quality_score」の具体的計算式**: Backend の多層シグナル（明示 > 暗黙 > retrieval）の重み付けは運用で調整、スペック固定しない。
4. **家族利用での viewer_id 責任追跡**: UX が「誰が書いたか」を重視したが、現 Cookie プロファイルは匿名ニックネーム。書いた本人しか編集できない縛りは過剰か、自由編集でよいか未決。

---

## 議論プロセス

- **方式**: cmux 独立ペイン × 3 claude インスタンス（Architect / Backend / UX）、ユーザー（本 claude）が仲介
- **ラウンド数**: 2（初期提言 → 相互質問応答）
- **収束度**: 高い。責任分離・ステートレス保持・drive 境界・citation union・UI 2層 の5点で 3役一致

---

## 結論

**両記事のエッセンスは HomeVault の既存原則（ドライブ=セキュリティ境界、ステートレス Ask、元ナレッジ非汚染、auto-tags の suggest→approve）と高い整合性を持つ。** 取り込み形として:

1. **Ask は純粋関数のまま**、応答に writeback_hint を積むだけで複利の即時性は担保
2. **knowledge アドオンに distilled_notes を新設**（drive-scoped、health 3値、Citation union の `kind:'note'`）
3. **機械キャッシュ（intelligence）と人のノート（knowledge）を UI で明確に分離**（3種バッジ、ラベル、per-drive 「記憶している内容」ページ）
4. **デフォルト manual、features.writeback で 3値制御**（auto-tags と対称）

記事1の raw/wiki/outputs 物理構造は採用せず、思想（複利ループ）だけを採る。記事2 の WriteBack-RAG は distilled_notes の別 index 化で論文通り実装可能。

**議論終了。実装は行わない。**

---

# 追加討議 (Round B): 体験と UX の親和性

## Context

設計・スキーマは上記で固まったので、今度は「**この機能を実装するとどんな体験ができるか**」「家族共有と個人ナレッジDBの両面での UX 親和性」のみを掘る。3エージェント（家族UX / 体験ストーリー / 個人KB）を cmux 独立ペインで2ラウンド議論。

---

## ラウンド1: 3つの視点

### 家族UX: 家族共有プラットフォームとしての体験

**具体シーン3つ:**
- **子供の宿題ドライブ**: 小学生が「織田信長について」と Ask。家族の歴史番組録画と図鑑PDFから引用付き回答。Wiki に「織田信長」ページが育ち、兄弟が翌年同じ単元で再利用。親は学習の足跡が Wiki に残るので見守れる。
- **家計ドライブ**: レシート/光熱費 PDF を raw 投入。Ask「去年の electricity と今年の比較」→ Wiki に「我が家の固定費推移」ページが自動更新。夫婦どちらが Ask しても同じ知識が育つ。
- **祖父母の旅行写真ドライブ**: BLIPキャプション+Whisper で、子供が「おばあちゃんが行ったお寺」と Ask。Wiki「家族の京都記録」が世代をまたいで蓄積。祖父母の記憶が失われる前の継承装置。

**嬉しくないケース:**
- 「保険見直し」「子供の進路相談」等プライベート Ask が同ドライブ内の家族に見える
- 親の偏見が Wiki に固定化され子が鵜呑み
- 誰が何を聞いたかが profile_id 単位で辿れると監視的

**提案**: Ask 履歴と writeback を「下書き=個人」「公開=Wiki反映」の2段階。**ドライブ境界だけでなくドライブ内の可視性層が必要**。

---

### 体験ストーリー: 時間軸の物語

**1週間目 ― 静かな違和感**
> 日曜の夜、父はスクラップブックのつもりで記事PDFと子どもの運動会動画を raw/ に放り込む。翌朝 wiki/INDEX.md が勝手に生えていて、一瞬ぞっとする。中身は薄い。「運動会」「確定申告」という見出しだけが並び、本文はほぼ空欄。「これ、育つの？」と半信半疑のまま閉じる。
> 戸惑いは "書いてないのに勝手に要約されている不気味さ" と "それにしては中身が浅い物足りなさ" の両方。Ask に問いかけても citation は 📄 ばかり。まだ第二の脳の手応えはない。

**数ヶ月後 ― ⚡が初めて混ざった夜**
> ある晩「去年のふるさと納税の限度額どう計算したっけ」と Ask。返ってきた citation の先頭が ⚡「2026-01 のあなたの回答」。開くと、半年前の自分が自分に宛てた短い整理メモ。**"過去の自分に助けられた" という小さな感動**。Wiki の該当トピックにも自然に追記されていて、今日の会話がまた明日の citation になる予感がする。

**1年後 ― ファイル置き場ではなくなっている**
> HomeVault はもう「動画サーバー」ではない。家族ドライブは相変わらず写真と動画の倉庫だが、**個人ドライブは "話しかけると過去の自分が答える場所" に化けている**。Finder で探す頻度は激減し、まず Ask する。ファイル管理アプリという語彙が本人の口から消える。

---

### 個人KB: Second Brain としての固有ポジション

**Obsidian/Notion/NotebookLM との決定的な違い:**
- Obsidian/Notion = 「書いたもの」が素材、NotebookLM = 「セッションに持ち込んだもの」が素材
- **HomeVault = 「生活の中で既に溜まっている一次素材（動画・写真・録音・PDF）」がそのまま KB 原料**
- 書かない人にも KB が育つ。弱みは逆で、Obsidian 民が持つ執筆衝動を前提にできない
- ゆえに WriteBack は「AI が書き、人が承認する」方向に倒すべき

**raw = ドライブそのもの:**
> 動画/写真が一等素材になるのは他 KB にない強み。家族旅行の動画、子供の成長写真、録画した講演——テキスト KB では死蔵されるが、Whisper+CLIP+BLIP で既に「読める」状態。raw フォルダを作る必要すらなく、**「生活を撮る」こと自体がインデックス行為**になる。

**家族と個人の両立:**
- 本線はドライブ分離。個人 KB = 自分の問いの履歴であり、家族に晒すのはプライバシー侵害に近い（「パパは何を検索したか」が見える KB は不健全）
- `personal-{viewer}` ドライブ = 個人 vault、`family-photos` 等 = 共有 vault
- ただし家族共有ドライブの中にも「家族の Second Brain」は成立する（「去年の運動会どこ？」を全員が問える共同脳）。この場合の distilled_notes は**匿名集約**で誰が書き戻したかは出さない

---

## ラウンド2: 相互応答と深化

### 家族UX → ⚡温かい/気持ち悪い / 誰が聞いたかの可視性

**⚡の表示: 「温かい側に倒す、ただし著者性を可視化」**
- 匿名の ⚡ は監視感が出る。「📝ママが去年答えた」と**名前付きで出ると家族の知恵袋**になる
- 家族ドライブ既定: ⚡ は署名付きで共有（profile nickname 表示）
- 個人ドライブ既定: ⚡ は自分のみ（viewer_id 一致時のみ表示）
- オプトアウト: Ask 時に「この質問は私だけの ⚡ にする」トグル（下書き扱い、昇格で家族公開）

**Wiki 書き戻しに「誰が聞いたか」: 「問いは隠し、答えは署名する」**
- 質問文は思考の露出なので非表示、Wiki に定着した知識側に「貢献者: パパ, ママ」と出す
- 「何を知らなかったか」は晒さない

**子供アカウント:**
- 子の Ask は親のみ閲覧可（保護者ビュー）、兄弟・祖父母には非表示
- 子の ⚡ は Wiki 昇格に親承認が必要（偏った知識の固定化防止）

**実装鍵**: profile に role（adult/child/guest）と drive ごとの `sharing_mode`（personal/family）。UI で「この質問は家族と共有しますか？」を Ask 送信前に一度だけ確認。

---

### 個人KB → 著者性メタデータ + 時間軸の離脱ポイント

**著者性メタデータは必須:**
- 一人用なら「有用性」単一軸で済むが、家族共有では**「誰にとっての真実か」が分岐する**
- 「お父さんは甘い派、お母さんは辛い派」のような合意されていない主観を単一の distilled note に蒸留すると、**知識ではなく家庭内政治**になる
- 必須: (1) author viewer_id、(2) claim type（事実/意見/家族合意）、(3) endorsement（他メンバーの賛否）
- 真に共有知に昇格するのは家族合意済みのものだけ、という**二層構造**

**時間軸ごとの離脱リスク:**
- **1週目**: 「便利な検索」にすら届かない。intelligence が重く、初回で「期待以下」が出ると第二の脳への期待値ごと折れる。**初回体験の速度と精度が生命線**。
- **数ヶ月目**: ⚡初遭遇は感動だが、その前に「問いを投げる習慣」が形成されていないと永遠に来ない。**検索窓を Ask として使う文化の醸成**がいる。NotebookLM 的な「例示質問」を最初に提示すべき。
- **1年後**: 「ファイル管理アプリでなくなる」が最大の離脱リスク。書かない・問わないメンバーにとっては依然ファイル管理アプリのまま。AI 機能は「重い・怖い・プライバシー不安」の対象になる。**per-drive policy で AI OFF のまま使い続ける自由**を最後まで担保しないと、家庭内で「使う人/使わない人」の分断が起きる。

---

### 体験ストーリー → ダークシナリオ / 境界を往復する物語

**ダークシナリオ ― 賢くなったのは父だけだった**
> 山田家の共有ドライブは、父が一人で育てていた。家族旅行の写真も、子どもの学校プリントも、確定申告PDFも全部父が raw/ に投入。半年後、Wiki の「我が家の医療費」「去年の夏休み」は父の筆致で埋まり、Ask の citation には ⚡父の過去回答ばかり。
> ある夜、母が「長男のアレルギー、いつから？」と Ask。返ってきたのは自信満々の要約と、⚡父の2026年3月のメモ。**だが日付が一年ずれていた。** 母は首をかしげつつ、Wiki に書いてあるならと受け入れる。**権威化された過去の誤りが家族の記憶を上書きし始める**。
> さらに悪いことに、父は旅行中の夫婦喧嘩のメモまで raw/ に放っていた。ある日、中学生の長女が「去年の沖縄旅行どうだった？」と Ask して、Wiki の要約に「両親の口論」が事実として淡々と混ざる。**機能は完璧に動いている。失敗しているのは家族のほう**だ。

**境界を往復する物語 ― 濾紙としての境界**
> 日曜の夜、佐藤さんは個人ドライブの Wiki を眺めていた。「睡眠」トピックに半年分の試行錯誤が蒸留されている。⚡「カフェインは14時まで」。ふと、最近夜眠れないとこぼしていた妻を思い出す。
> 月曜の朝、家族ドライブで妻に「これ読んで」とは言わない。代わりに家族ドライブの Ask に「寝付きをよくするには」と入れてみた。返ってきた citation は 📄一般的な記事ばかり。**自分のドライブの ⚡ は、ここには出ない。**
> その夜、家族ドライブで子どもの学校連絡メモを Ask して、逆の体験をする。「給食の旗当番」の citation に、**妻の書いた ⚡ が現れた**。知らなかった家族の知恵。思わず個人ドライブにメモを書き写す。
> **境界は壁ではなく、手で運ぶ価値のあるものを選別させる濾紙として機能していた**。

---

## 収束した体験論の核

### この機能が実装されたら生まれる体験
1. **「生活を撮る」こと自体がインデックス行為になる** — 書かないユーザーでも KB が育つ。HomeVault が他 KB に真似できない固有の強み
2. **⚡が citation に初めて混ざる瞬間の感動** — 「過去の自分に助けられた」という小さな温もり。家族ドライブでは「妻の知恵」として現れる
3. **HomeVault がファイル管理アプリでなくなる** — 1年後、Finder の代わりに Ask が第一動線になる
4. **境界は壁ではなく濾紙** — 個人ドライブと家族ドライブを往復する中で「手で運ぶ価値があるもの」だけが移る

### 最大の UX リスク（3つ）
1. **権威化された誤り** — 一人が主導する家族ドライブで、その人のメモが Wiki の事実として固定化される
2. **問いの露出** — 質問文は思考の露出なので家族に晒すべきでない。「問いは隠し、答えは署名する」
3. **使う人/使わない人の分断** — per-drive AI OFF を最後まで担保しないと家庭内で分断が起きる

### HomeVault の固有ポジション
- **Obsidian/Notion**: 書く人のためのツール
- **NotebookLM**: 持ち込んだ素材の臨時解析
- **HomeVault**: **家族の生活記録が勝手に「第二の脳」に育つ** + **個人ドライブは独立した vault として個人KB化**

二者が同じアプリの中に「別ドライブ」として両立することで、「家族の集合知」と「個人の Second Brain」を同じ UX・同じメンタルモデルで行き来できる。これが記事1/2 のコンセプトを HomeVault に取り込む最大の価値。

### 設計原則（体験から逆算した既定値）
| 項目 | 家族ドライブ既定 | 個人ドライブ既定 |
|---|---|---|
| ⚡ citation の可視性 | 署名付き共有（nickname 表示） | 本人のみ |
| Wiki 書き戻しの貢献者表示 | 公開（オプトアウト可） | 本人のみ |
| Ask 質問文の露出 | 非表示（問いは隠す） | 非表示 |
| distilled_notes の author meta | 必須（viewer_id + claim_type + endorsement） | author のみ |
| 子供アカウント | 親承認で昇格、他家族は非表示 | N/A |
| AI OFF で使い続ける自由 | per-drive policy で担保 | per-drive policy で担保 |

### 「育っていく」感の演出 (家族規模ではゲーミフィケーション回避)
- dashboard-widget に「この Wiki は今週 +3 件育ちました」程度の控えめなログ
- Ask 回答ヘッダに「過去の回答を3件再利用」
- ファイル詳細に「このファイルは Wiki の〇〇に引用されています」の逆リンク

### 最初の1週間のために
- **初回体験の速度と精度** を最優先（重いインデックスで期待値を折らない）
- **例示質問**を最初に提示して「検索窓を Ask として使う」文化を醸成
- 「まだ Wiki は育っていません。あと数回 Ask するとここが埋まります」のような**期待値管理のメッセージング**

---

**討議終了。これ以上の実装仕様には踏み込まない。**

---

# 追加討議 (Round C): 一人で使う体験に完全フォーカス

## Context

「家族共有」の議論が過剰だったため、**多くの HomeVault ユーザーは結局一人で使う**という現実を直視し、個人ユーザーが自分専用ドライブで「第二の脳」を育てる体験だけに絞って再議論。3エージェント（個人体験 / Second Brain 哲学 / 職種別リサーチャー）を cmux 独立ペインで2ラウンド討議。

---

## ラウンド1

### 個人体験: 一人の日常ユーザーの代弁

**朝・昼・夜の Ask シーン:**
- **朝 7:42、コーヒー片手**: 昨夜寝落ちしながら見た技術カンファ動画について「あの登壇者が言ってた "p99 が跳ねる原因" って何だっけ」→ Whisper 文字起こしから 03:14 の発話が引用付きで返る。動画を頭から見直さずに済む。朝の3分の嬉しさ。
- **昼 13:20、在宅ランチ**: 半年前のレシピ本 PDF、撮りためた料理写真、Apple Watch から流した音声メモ「あの店の麻婆豆腐、花椒多め」を横断して「最近気に入ってる辛い系の作り方」を聞く。**テキスト・画像・音声が同じ引用リストに混ざって返ってくる瞬間に「ああ、これは ChatGPT じゃ無理だ」と思う**。
- **夜 23:10、ベッドで寝る前**: 今日読んだ記事3本のスクショを raw に放り込み「今週の自分の関心トピックは何だった?」と聞く。回答を knowledge の今週ノートに1クリック書き戻し。**明日の自分への置き手紙**になる。

**HomeVault 固有の価値:**
> 「自分の記憶の物理的な厚み」が引けること。Notion は自分が書いた分しか返らないし、ChatGPT は自分のことを何も知らない。HomeVault は自分が見た動画の 06:42、自分が撮った写真の Exif 時刻、自分の声のメモを引用してくる。**"自分が過去に何に時間を使ったか" がエビデンス付きで返る唯一のアプリ**。これは検索でなく**自分史の参照**。

---

### Second Brain 哲学: 思考の複利化と自己との対話

**認知的価値の本質:**
> 通常の検索は「過去の自分の素材に再アクセス」させるだけだが、**WriteBack は「過去の自分の結論に再アクセス」させる**。これは決定的に違う。Matuschak の evergreen note が手作業で担ってきた「蒸留による思考の固定化」を、Ask の回答という形で無痛で発生させる点に革命がある。
> さらに深い価値は**「過去の自分を他者として再発見する」こと**。3年前の自分が残したスクショや動画講義は、当時の文脈ごと忘却されている。Ask で質問し、回答が WriteBack されるたびに、忘れていた自分の思考が現在の問いに応答する。これは記憶の想起ではなく、**自己との対話**。第二の脳は検索エンジンではなく、時間を超えた自分同士の会議室になる。

**HomeVault の哲学的ポジション:**
- Obsidian/Notion は「書くこと」から始まる。ChatGPT は「無文脈」から始まる。NotebookLM は「アップロード」から始まる。すべて「意識的に第二の脳を作ろう」とした瞬間に起動する
- **HomeVault は違う。生活の副産物としてすでに素材が蓄積されている**。録画、スクショ、ダウンロードした PDF、写真──これらは Second Brain のために集めたものではない。「気づいたら第二の脳の素材が TB 単位で揃っていた」という**事後性**こそが哲学的優位
- Obsidian は文字の帝国、NotebookLM もテキスト中心。HomeVault は Whisper/CLIP/BLIP で**「書かれなかった知識」**（講義の口頭説明、ホワイトボード写真、作業記録動画）を第二の脳に繰り込む。**書く前の自分、書けなかった自分を救済できる**のは HomeVault だけ

---

### 職種別リサーチャー: 5ペルソナの輝きどころ

| # | ペルソナ | 典型ドライブ | Ask が効く瞬間 |
|---|---|---|---|
| 1 | **研究者 / 博士課程** | `paper-archive/`、実験ログ、会議録画、`writing/` | 「2023年春の fMRI 前処理で使った motion correction のパラメータ」→ 録画の transcript + 自分のメモ PDF から引用付きで返る。**論文混入を防ぐ捏造対策は学術用途で必須** |
| 2 | **フリーランス動画編集者** | プロジェクト素材、レビュー動画、契約書、BGM | 「〇〇社との契約で著作権譲渡の範囲」→ 該当条項を引用。**クライアントレビュー動画の transcript で「赤味を抑えて」と言った箇所をタイムコード込みで特定** |
| 3 | **独立系ソフトウェアエンジニア** | `tech-books/`、カンファ録画、設計メモ、副業/本業で分離 | 「過去の自分が CQRS について書いたもの」を日付順に引用。**「自分の技術観の変遷」をドライブ全体から自動抽出**（2020年と2026年で言ってること違うのが可視化） |
| 4 | **個人投資家** | 決算資料 PDF（200社×5年）、IR 動画、投資日誌 | 「経営者が在庫積み増しに言及した回」を動画 transcript 串刺しで抽出。**銘柄ドライブごとに「論点マップ」が自動生成** |
| 5 | **翻訳者 / リサーチャー** | 原書、既訳書、過去訳稿、著者インタビュー動画 | 「Dasein を過去案件でどう訳したか」→ 案件ごとの訳語と選択理由が引用で出る。**翻訳の一貫性問題は「記憶の外部化」が全て** |

**横断的観察:**
- **Ask の核心価値**: キーワード思い出せない自然文検索 + 捏造対策された引用（幻覚は全員にとって致命的）
- **Wiki の核心価値**: **Obsidian 挫折層が主要市場**──自分で整理する時間がない人の「事後整理の自動化」
- **per-drive policy 活用**: 研究者=自分データ ON / 共有受領データ OFF、エンジニア=副業 ON / 本業 OFF（業務分離に必須）
- **ローカル LLM 要件**: 契約書・決算前情報・研究データ・訳稿は外部 API に出せない。**ollama 前提の設計が差別化**
- **使わない機能**: 横断検索・共有・コメント。全員「一人で完結する知的生産基盤」として評価
- **刺さらないペルソナ**: カジュアル動画視聴者、スマホ完結層、クラウド同期で満足している一般ユーザー

**ポジショニング**: 「情報過多と闘う専門家のための思考外部化装置」

---

## ラウンド2: 深掘りと反証

### 個人体験 → 毎日の習慣トリガー設計

> **Wiki に行く動線を作るのではなく、ファイルを開く動線に Wiki を混ぜる。**

**ファイル管理アプリ出自の強み = 「用事がある」**
- Second Brain 専用アプリ (Notion/Obsidian) は開く理由を自分で作らないと死ぬ
- HomeVault は「動画を見る」「写真を確認する」「PDF を読む」という用事で必ず開く。Ask/Wiki はその動線に**寄生**できる

**毎日の動線:**
- **朝 7:30**: スマホで昨夜 NAS 自動同期の写真を確認 → 一覧の上部に「今週の写真から作った要約」カードが1枚だけ常駐。写真確認のついでに Second Brain に触れる
- **昼 13:00**: PC で動画を1本見る → 視聴完了画面に「この動画と関連する過去の3本」「Ask: この内容を過去のメモと比較する」。1クリックで Ask が走り、approve で Wiki に追記。視聴のついで
- **夜 23:30**: スマホで「今日アップロードしたファイル」通知を1日1回まとめて受信 → 最下部に「今日の3行サマリを Wiki に書きますか?」。寝る前のスクロールのついで

**勝手に再訪される仕掛け:**
- Wiki を独立した目的地にしない。ファイル一覧・ファイル詳細・検索結果のフッタに常に「関連 Wiki ページ」リンクを薄く
- Ask 結果は明示 approve しない限り Wiki に出ないが、**approve した瞬間からそのファイルを次回開いたとき必ず Wiki スニペットが上に出る**
- 書いた知見がファイルに紐付いて何度も目に入る──これが複利の起点

---

### Second Brain 哲学 → raw は捨てられるか

**結論: 動画・画像の raw は蒸留しても捨てられない。これは技術的制約ではなく哲学的必然。**

**蒸留物と原素材の非対称性:**
- テキスト note の蒸留はほぼ可逆。元記事を捨てても、自分の言葉で書き直した evergreen note があれば思考は再起動できる。だから Obsidian 民の vault は**軽くなる**──原素材を捨てる勇気が PKM 成熟の証とされてきた
- だが動画・画像は違う。Whisper の文字起こしや BLIP のキャプションは**情報の射影であって等価物ではない**。講義動画の「教師が黒板の前で一瞬見せた困り顔」「画面越しに伝わる熱量」「撮影時の部屋の光」──**テキストに落ちた瞬間に死ぬ情報の層**がある

**HomeVault のドライブが「重くなる」ことの肯定:**
- Obsidian 的軽量化の美学は「概念だけが知」という前提に立つ。HomeVault はこの前提を拒否する
- raw は**概念の母体**であると同時に、**未来の自分がまだ引き出していない問いの貯蔵庫**
- 3年後の自分は今とは違う問いを動画にぶつける。蒸留済み Wiki には存在しない答えが、raw からまた生まれる
- **重くなっていくのは退化ではなく、未来の問いへの投資**

**精神衛生における raw の役割:**
- 蒸留は概念の介護、raw は情動の保存
- 動画は「その日の自分」を再生できるが、蒸留は「その日の自分が得た結論」しか返さない
- 個人の Second Brain が孤独な営みである以上、**過去の自分に会える場所としての raw** は手放せない

> HomeVault のドライブは、軽くなるべき vault ではなく、**重くなり続ける記憶の地層**である。

---

### 職種別 → ダークシナリオ & 最も輝く組み合わせ

**ダークシナリオ: Wiki の権威化で思考が死ぬ**
> 主人公は技術ブロガー兼独立エンジニア（42歳）。3年使い込んで `tech-notes/` の Wiki は見事に育った。「マイクロサービスについての自分の結論」「Rust 採用判断の履歴」がきれいに索引化されている。
> 転落: ある日、同業者から新アーキテクチャの相談を受け、反射的に Ask に投げる。Wiki が過去の自分の結論を引用付きで返す。彼はそれを編集してブログに出す。翌月も、翌々月も同じループ。**気づけば彼の「意見」は全て3年前の自分のコピーになっている**。
> Wiki は反証を拾わない──なぜなら彼は「反証になる新情報」を raw/ に入れる前に Ask で「自分はどう考えていたか」を確認するからだ。引用付き回答が**権威性を偽装**し、「これは自分の思考だ」と錯覚させる。蒸留された Wiki が硬化し、raw/ の新しい矛盾を**異物として排除する抗体のように働く**。月1ヘルスチェックも「矛盾なし」と誤判定する──Wiki 内部で閉じて整合しているから。
> 彼は賢くなったのではなく、**過去の自分に閉じ込められた**。

**UX 上の示唆**: Ask の回答には必ず raw/ の未蒸留ソースも併記し、Wiki の結論には**書かれた日付**と**情報源の古さ**を強制表示。**蒸留と発酵を区別する UI** が要る。

**最も輝く組み合わせ: 在野のアマチュア地域史研究家**
- ドライブ: `archives/`（古文書スキャン+OCR）、`oral/`（古老への聞き取り音声・動画）、`fieldwork/`（現地写真・碑文）、`manuscript/`（執筆中の郷土史本）
- Ask: 「享保期のこの村の検地記録で石高の記述」を自然文で横断検索。**聞き取り音声の transcript と古文書 OCR が同じ引用リストに並ぶのが HomeVault 独自の強み**
- 1年後の成熟形: Wiki が人物・地名・年代の**三次元索引**として発酵。執筆中の章に不足する一次資料を Ask が指摘
- > **孤独な10年仕事を、HomeVault が共著者として伴走する──これが個人 KB の理想形**

---

## 収束: 一人利用での体験設計原則

### 生まれる体験の核
1. **自分史の参照装置**: ChatGPT は自分を知らず、Notion は書いた分しか返らない。HomeVault だけが**自分の動画の 06:42、写真の Exif 時刻、声のメモ**を引用付きで返す
2. **時間を超えた自分との対話**: WriteBack は「過去の自分の結論」を現在の問いにぶつける仕組み。記憶の想起ではなく**自己との会議室**
3. **書かなかった自分の救済**: ホワイトボード写真、雑談録画、一瞬の困り顔──**テキストに落ちる前の知識**を第二の脳に繰り込める唯一の基盤
4. **ファイルを開く動線に Wiki が寄生する**: 毎日の「用事がある」アプリだから、Second Brain 専用アプリのように使うのを忘れない

### 設計原則
- **raw は捨てない思想を UI で肯定する**: 「重くなる vault」として positive framing。ストレージ警告を安易に出さない
- **Wiki スニペットはファイル側に付く**: Wiki をトップレベル目的地にしない。ファイル詳細のフッタに薄く
- **Ask 回答に情報源の古さを強制表示**: 権威化を防ぐ。「この結論は 2023 年に書かれました。raw/ には 2025 年の相反する記録があります」
- **approve 後の複利**: approve した Wiki スニペットが、関連ファイルを次に開いたときに必ず目に入る
- **ローカル LLM 第一**: 研究データ・契約書・投資日誌は外部 API に出せない。ollama 前提が刺さる層の差別化軸
- **per-drive policy = 業務分離装置**: 副業 ON / 本業 OFF のような「プロジェクト空間の切替」として売れる

### ダークシナリオの教訓
- **Wiki の硬化 = 過去の自分への幽閉**: 蒸留文を「発酵中」「成熟」のように状態化する UI。raw の新情報と蒸留の齟齬を検出するヘルスチェック
- **ホーダー化対策**: ただし「重くなる vault」を肯定する以上、「削除勧奨」ではなく「**未訪問 raw に Ask の問いを投げてみますか?**」のような発酵促進 UI
- **ローカル LLM の遅さ**: 初回体験を壊す。「今だけクラウド LLM を試す」のような段階的オプトイン

### HomeVault の個人 KB としての固有ポジション
| | Obsidian | Notion | ChatGPT | NotebookLM | **HomeVault** |
|---|---|---|---|---|---|
| 起動条件 | 書く | 書く | 無文脈 | アップロード | **生活の副産物が自動集積** |
| 一等素材 | テキスト | テキスト | チャット | アップロード全般 | **動画・写真・音声・PDF** |
| vault の重さ | 軽くなる美学 | 軽くなる美学 | N/A | セッション限定 | **重くなる地層** |
| 自己対話 | 手作業 | 手作業 | 文脈なし | 限定的 | **WriteBack で無痛発生** |
| 市場 | 書く人 | 書く人 | 一般 | 臨時解析 | **Obsidian 挫折層 + 情報過多の専門家** |

### 最もクリティカルな単一洞察
> **HomeVault は「Obsidian 挫折層」の最後の砦である。**
> 書く文化を持たないが情報だけは溜め込んできた人たちにとって、「Ask で引けて、approve するだけで Wiki が育つ」という低摩擦経路だけが Second Brain を成立させる。この層は数としては Obsidian ユーザーより遥かに多い。

---

**討議終了。実装は行わない。**
