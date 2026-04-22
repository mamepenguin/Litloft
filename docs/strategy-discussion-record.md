# HomeVault 方針議論記録（2026-04-17）

第三者 AI との戦略ディスカッション（`third-party-ai-discussion.md`）を元に、5ペルソナで実施した内部議論の記録。

## 議論の形式

- **Round 1**: 各ペルソナが独立にポジション表明（並列実行）
- **Round 2**: 他者意見と直接反論を提示され、立場を修正（並列実行）
- **Round 3**: オーケストレータ（Claude）による集約

## 参加ペルソナ

| ペルソナ | 役割 | subagent_type |
|---|---|---|
| アーキテクト | システム設計・File-first 哲学の守備範囲 | architect |
| セキュリティエンジニア | 認証・認可・脅威モデル | security-reviewer |
| UX デザイナー | UI/UX パターン・家電的操作感 | UX Architect |
| Intelligence Lead | RAG・AI・eval 基盤 | Backend Architect |
| Reality Checker | 懐疑的評価・過剰設計の警戒 | Reality Checker |

---

## Round 1: 各ペルソナの独立ポジション

### アーキテクト
- **最優先**: Profile+PIN 移行時の `viewer_id` マイグレーション設計
- **最大リスク**: Personalized RAG がドライブ境界を侵食
- **推奨**: `current_profile_only` フィルタ追加 / profile テーブル新設 / 境界線明文化

### セキュリティエンジニア
- **最優先**: Profile_JWT と Folder_JWT の鍵・クレーム完全分離
- **最大リスク**: 4桁 PIN のオンライン総当たり
- **推奨**: Argon2id + ペッパー / プロファイル単位ロックアウト / Folder_JWT 短命化

### UX デザイナー
- **最優先**: Ask 引用 → ソース行ジャンプの双方向リンク
- **最大リスク**: Profile+PIN 導入で「家電的」感覚が損なわれる
- **推奨**: Netflix 風プロファイル選択 / 遅延 PIN（帰属が要る操作時のみ）/ アンビエント表示

### Intelligence Lead
- **最優先**: Ask 双方向リンク（citations → 該当秒数/行ジャンプ）
- **最大リスク**: Personalized RAG のドライブ境界越え
- **推奨**: `current_profile_only` フィルタ / transcript_refine デフォルト false 維持 / eval N=5 → N=20

### Reality Checker
- **最優先**: 外部 AI の称賛を設計判断の根拠にしない
- **最大リスク**: Profile+PIN のマイグレーション負債
- **推奨（やらない系）**: Profile+PIN やらない / Personalized RAG やらない / 双方向リンクのみ実装

---

## Round 2: 立場の変化（重要）

### 大きな収斂

#### 1. PIN 要否で Security が転向
Round 1 では「4桁 PIN は危険だが Argon2id で対応可」だった Security が、Reality Checker の「LAN 内脅威モデルでの PIN の利得は薄い」に **屈服**:

> PIN は採用しない。認証手段は PIN に限らない。代替は **Profile_JWT を HttpOnly Cookie で 24h、書き込み時のみ WebAuthn/Passkey または端末バインド token で昇格**。LAN 内なら Passkey は現実的。

#### 2. Reality Checker が author_display 案を撤回
UX と Security の「AuthN ゼロ、成りすまし改ざんし放題」に押され、Round 1 の「comment.author_display 任意入力で 90% 解決」を撤回:

> author_display はプロファイル設定済みなら viewer_id 紐付け表示、未設定なら "ゲスト" 固定（任意入力を撤回）。

#### 3. Intelligence が Personalized RAG を「凍結」に格下げ
Reality Checker の「eval N=5 で個人軸を足せば評価不能」に押され、優先順位を入れ替え:

> Personalized RAG は仕様凍結。eval 通過後に解凍。土台が沈んだ上に階は足さない。

#### 4. アーキテクトが「viewer_id 最優先」を撤回
Reality Checker「eval 拡充が先」に説得され:

> Round 1 の「viewer_id 最優先」は誤り、**計測器が先**に動いた。優先順位: (1) 双方向リンク (2) eval N=20 (3) Profile テーブル + 遅延 PIN + JWT 鍵分離 (4) Personalized RAG は eval 整備後に再評価。

### 収束した合意

| 論点 | 合意内容 |
|---|---|
| Ask 双方向リンク | 全員一致で最優先 |
| 共通 `SourceAnchor` 型 | UX + Intelligence 合意。`{ file_id, kind, locator }` で kind 別レンダラを差し替え |
| eval 基盤拡充 | N=20〜30 に。新機能より先 |
| Personalized RAG | **今はやらない**（仕様凍結、eval 通過後に解凍） |
| transcript_refine | デフォルト false 維持 |
| `current_profile_only` × `current_drive_only` | AND で適用（二重ガード） |
| JWT 鍵・クレーム完全分離 | Profile_JWT と Folder_JWT で `aud`/`typ` 強制 |
| 旧 viewer_id 履歴 | 無記名プールに落とす（初回 PIN 登録者に紐付けはなりすまし経路） |
| コマンドパレット | 保留（Reality Checker の切り捨て案を UX が受諾） |
| ペイン分割の汎用化 | 保留（Knowledge の既存実装を流用するに留める） |

### 残された対立: 認証手段の形式

唯一収束しなかった論点。3案が並立:

| 案 | 提唱者 | 特徴 |
|---|---|---|
| **遅延 PIN** | UX, Reality Checker | 帰属が要る操作時のみ PIN 要求。opt-in（未設定プロファイルは PIN なし）。Argon2id + プロファイル単位ロックアウト |
| **Passkey/WebAuthn 昇格** | Security | 書き込み時のみ端末バインド昇格。PIN は使わない。LAN 内で Passkey は現実的 |
| **端末バインド token** | Security（代替案） | 初回登録端末のみに発行、LAN/家庭内の前提を最大限利用 |

合意: **どの案でも「書き込み操作で AuthN を強制」は譲らない**。形式は実装フェーズで決定。

---

## 最終的な方針（4-Phase Roadmap）

### Phase 1: 基礎整備（即時）
1. **双方向リンク実装** — 共通 `SourceAnchor { file_id, kind, locator }` 型 + kind 別レンダラ（video=秒、md=行、image=bbox）
2. **eval 基盤 N=20〜30 拡充** — Ask 精度を測れる計測器を先に作る
3. **transcript_refine はデフォルト false 維持** — Whisper 品質天井に達している現状での改変リスク回避

### Phase 2: 認証基盤の設計（並行）
4. **Profile テーブル新設** — PIN の有無に関わらず、profile_id を FK として扱える DB 構造へ
5. **`viewer_id` → `profile_id` マイグレーション設計** — 旧履歴は無記名プール落とし、新 profile は空から開始
6. **JWT 鍵・クレーム完全分離設計** — Profile_JWT / Folder_JWT を別鍵・別デコーダ・`aud`/`typ` 強制

### Phase 3: AuthN 実装（Phase 1 完了後）
7. **書き込み操作での昇格認証** — 形式は PoC で決定（Passkey / 遅延 PIN / 端末 token の比較）
8. **`current_profile_only` × `current_drive_only` AND フィルタ** — intelligence manifest に追加

### Phase 4: Personalized RAG の解凍（eval 通過後）
9. **Personalized RAG 仕様の再検討** — eval が N=30 で安定したら解凍

### やらない / 保留
- 外部 AI が提案したコマンドパレット（Cmd+K）
- ペイン分割の汎用化
- フルスクラッチのログイン機能（重厚すぎる）
- Google カレンダー的な予定機能
- 細かい ToDo 管理
- リアルタイムチャット

---

## オーケストレータ（Claude）による総評

### この議論の質

- **外部 AI が「芸術作品」と称賛した案が、Reality Checker により的確に削られた**。PIN 必須・Personalized RAG 即時実装・コマンドパレットの 3 つは全て「今はやらない/凍結」に。これは内部批判が健全に機能した結果。
- **Security が Reality Checker に屈した瞬間がハイライト**。家庭内 LAN の脅威モデルを直視すれば、4桁 PIN は脅威ベクトルに対して過剰なコストを支払う。Passkey への転換は現実解。
- **eval 拡充が優先順位のトップに来たこと** は最大の収穫。第三者 AI の議論では触れられなかったが、機能追加より計測基盤という順序が正しい。

### この議論で残った知的負債

- **認証形式の最終決定は PoC を待つ**。Passkey の実装コスト（特に iOS Safari の WebAuthn）、遅延 PIN の UX 摩擦、端末 token の「端末紛失時復旧」を実際に試さないと判断不能。
- **「ドライブ横断機能の廃止方針」と「Personalized RAG（profile 軸）」の整合性** は、Phase 4 解凍時に再度議論が必要。記憶 `project_drive_boundary.md` との衝突が理論上残る。
- **`SourceAnchor` 型の詳細設計** — video 秒数と Markdown 行番号はまだ安定インデックスだが、画像領域（bbox）は BLIP キャプションの変更で位置がずれる。reindex 時の locator 更新戦略が未定。

### 次にやるべき1手

**双方向リンク (SourceAnchor) の実装と eval 基盤拡充を並行で開始する**。Phase 1 は独立に進行可能で、認証議論の結論を待つ必要がない。認証は Phase 2 の設計フェーズで PoC を起こしながら詰める。

---

## 参考

- `docs/third-party-ai-discussion.md` — 外部 AI との議論記録（本議論の起点）
- `.claude/rules/design-decisions.md` — 既存の設計判断
- 記憶: `project_intelligence_axis.md`, `project_drive_boundary.md`, `feedback_intelligence_eval_loop.md`, `project_whisper_quality_ceiling.md`
