# HomeVault Design System

> Pinterest 着想のデザインシステム。  
> 実装言語: Next.js 16 (Tailwind CSS v4)。  
> jp-ui-contracts: base + saas プロファイル適用。

---

## 0. メタデータ

| 項目 | 値 |
|---|---|
| Locale | `ja-JP` |
| Profile | saas (メディアブラウザ) |
| Theme | Light / Dark / System の3モード |
| CSS | Tailwind CSS v4 + CSS Custom Properties |
| Font | System-UI CJK fallback stack (Pin Sans 相当) |
| Last updated | 2026-04-14 |

---

## 1. ビジュアルテーマ

**ウォームホワイトキャンバス**に**コーラルレッド**を単一アクセントとして使う、フラットでミニマルな設計。  
Pinterest のデザイン哲学（温かみのある中間色・ふっくらした角丸・影を使わない深度表現）を HomeVault のファイルブラウザUIに翻訳したもの。

**ライトモード**: 白キャンバス + プラムブラック文字 + コーラルレッドアクセント  
**ダークモード**: ウォームプラムダーク（`#1a0e10`）+ ブライトコーラル（`#e85d5e`）  
ダークモードは純黒ではなく赤みがかったプラム暗色を採用し、アクセントカラーとの統一感を維持する。

---

## 2. カラーシステム

### 2.1 CSS Custom Properties（設計トークン）

Tailwind `@theme inline` でユーティリティクラスとして使用可能（例: `bg-accent`, `text-text-muted`）。

#### ライトモード（`:root`, `[data-theme="light"]`）

| トークン | 値 | 用途 |
|---|---|---|
| `--bg-primary` | `#ffffff` | ページ背景 |
| `--bg-card` | `#ffffff` | カード背景 |
| `--bg-elevated` | `#f6f6f3` | 浮き上がったサーフェス（ツールバー等） |
| `--bg-sidebar` | `#ffffff` | サイドバー背景 |
| `--bg-border` | `rgba(145,145,140,0.2)` | ボーダー・区切り線 |
| `--text-primary` | `#211922` | プライマリテキスト（プラムブラック） |
| `--text-muted` | `#62625b` | 補助テキスト（オリーブグレー） |
| `--accent` | `#d63031` | ブランドアクセント（コーラルレッド）|
| `--accent-hover` | `#b52425` | アクセントホバー |
| `--accent-cta` | `#d63031` | CTAボタン（accent と同値） |
| `--accent-teal` | `#103c25` | 成功・自然系アクセント（グリーン） |
| `--sand` | `#e5e5e0` | セカンダリボタン背景（ウォームサンド） |
| `--sand-hover` | `#d5d5d0` | サンドホバー |
| `--warm-light` | `#e0e0d9` | サークルボタン・薄いバッジ背景 |
| `--warm-silver` | `#91918c` | ボーダー・無効テキスト（ウォームシルバー） |
| `--dark-surface` | `#33332e` | ダークセクション背景 |
| `--focus-ring` | `#435ee5` | フォーカスリング（ブルー） |
| `--danger` | `#9e0a0a` | 危険・エラー色 |
| `--danger-bg` | `rgba(230,0,35,0.08)` | エラー背景 |

#### ダークモード（`[data-theme="dark"]`）

| トークン | 値 | ライトとの差異 |
|---|---|---|
| `--bg-primary` | `#1a0e10` | ウォームプラムダーク |
| `--bg-card` | `#231216` | やや明るいプラム |
| `--bg-elevated` | `#2f191b` | サーフェス浮き上がり |
| `--bg-sidebar` | `#1a0e10` | bg-primary と同値 |
| `--bg-border` | `rgba(255,255,255,0.08)` | 白透過ボーダー |
| `--text-primary` | `#f5e6e8` | 温かみのある明るいテキスト |
| `--text-muted` | `#c4a0a4` | ピンクがかった補助テキスト |
| `--accent` | `#e85d5e` | ブライトコーラル |
| `--accent-hover` | `#f07070` | さらに明るいコーラル |
| `--accent-teal` | `#4caf80` | 明るいグリーン |
| `--sand` | `#3d2023` | ダーク版サンド |
| `--sand-hover` | `#4a2a2e` | ダーク版サンドホバー |
| `--warm-light` | `#3d2023` | sand と同値 |
| `--warm-silver` | `#7a6668` | くすんだピンクシルバー |
| `--dark-surface` | `#0d0608` | 最暗面 |
| `--focus-ring` | `#617bff` | 明るいブルー |
| `--danger` | `#ff8a8a` | 明るいコーラルエラー |
| `--danger-bg` | `rgba(255,45,66,0.12)` | エラー背景 |

#### システムモード（`[data-theme="system"]`）
`@media (prefers-color-scheme: light/dark)` でライト/ダーク値をそれぞれ適用。

### 2.2 カラー使用ルール

- **`--accent`** は CTAボタン・アイコンのブランドアクセントにのみ使用。乱用しない
- **`--sand`** はセカンダリボタン背景・タグ等の中間色として使用
- **`--danger`** はエラー・削除・危険操作にのみ使用。`--accent` の赤と混同しない
- **`--text-muted`** のコントラストは読める範囲に保つ。薄くしすぎない
- 色だけで状態を伝えない（アイコン・テキストを併用）

---

## 3. タイポグラフィ

### 3.1 フォントスタック

```css
--font-sans: -apple-system, system-ui, "Segoe UI", Roboto, "Oxygen-Sans",
  "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", Ubuntu, Cantarell,
  "Fira Sans", "Droid Sans", "Helvetica Neue", Helvetica,
  "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", Arial, sans-serif;
```

- 和文フォントは明示的に fallback に含める（ブラウザ既定に丸投げしない）
- macOS・Windows 両環境で安定した日本語描画を確保

### 3.2 タイプスケール

| ロール | サイズ | ウェイト | 行間 | 備考 |
|---|---|---|---|---|
| Body | 継承 (16px ベース) | 400 | 1.6 | body 既定 |
| H1 | — | 700 | 1.35 (`:lang(ja)`) | — |
| H2 | — | 700 | 1.40 (`:lang(ja)`) | — |
| H3 | — | 600–700 | 1.45 (`:lang(ja)`) | — |
| Caption / Label | 11–12px | 400–500 | — | ナビ補助ラベル |
| Section header | 11px | 600 | — | UPPERCASE 英語固定ラベルのみ |

### 3.3 Japanese Typography Rules（jp-ui-contracts 準拠）

```css
/* html:lang(ja) ベースルール */
html:lang(ja) {
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
  font-kerning: auto;
  font-feature-settings: normal;
  text-autospace: normal; /* progressive enhancement */
}

/* 段落・リスト・定義リスト */
p, li, dd {
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
}

/* 見出し: 自然な折り返し */
:lang(ja) h1, :lang(ja) h2, :lang(ja) h3, :lang(ja) h4 {
  word-break: auto-phrase;
  overflow-wrap: anywhere;
}

/* フォーム要素: 本文から密度分離 */
:lang(ja) input, :lang(ja) textarea, :lang(ja) select {
  line-height: 1.5;
}
```

**禁止事項:**
- `word-break: break-all` を本文・UIラベルに全体適用しない（ログ・ハッシュ・URLなど機械的文字列には `overflow-wrap: anywhere` を使う → `break-anywhere` ユーティリティ）
- 本文に `letter-spacing: 0.02em` を超える値を理由なく設定しない
- i18n テキスト（日本語が出る箇所）に `tracking-wider` (`0.05em`) を適用しない

**許可されるもの:**
- 英語固定ラベル（"Drives", "Tags" 等）への `uppercase tracking-wider` → 問題なし
- ログ・ファイルパス等の機械的文字列への `break-anywhere` ユーティリティ

---

## 4. ボーダーラジウススケール

| クラス | 値 | 用途 |
|---|---|---|
| `rounded-full` | 9999px | アバター・サークルボタン・フィルターピル |
| `rounded-2xl` | 16px | **標準** — ボタン・入力欄・モーダル・バッジ |
| `rounded-xl` | 12px | カード・コンテナ・サブパネル |
| `rounded-lg` | 8px | アイコンコンテナ内部の小要素 |

- **原則**: 12px 未満を外部に露出しない。小要素のみ `rounded-lg`
- ホバー時の `scale()` トランスフォームは使用しない（Pinterestの静的な重さを維持）

---

## 5. コンポーネントスタイリング

### ボタン

**Primary（CTA）**
- Background: `bg-accent` (`#d63031` / `#e85d5e`)
- Text: `text-white`
- Hover: `hover:bg-accent-hover`
- Radius: `rounded-2xl`
- Padding: `px-4 py-2` 以上（日本語ラベルが窮屈にならない幅を確保）

**Secondary（Sand）**
- Background: `bg-sand`
- Text: `text-text-primary`
- Hover: `hover:bg-sand-hover`
- Radius: `rounded-2xl`

**Danger**
- Text: `text-danger`
- Hover Background: `hover:bg-danger/10` または `hover:bg-accent/10`
- Radius: `rounded-2xl`

**Ghost / Transparent**
- Background: transparent
- Radius: `rounded-2xl`

**Circle Action**
- Background: `bg-warm-light`
- Radius: `rounded-full`

### カード

- Radius: `rounded-xl` (12px)
- Background: `bg-bg-card`
- Shadow: 使用しない（フラット設計）
- ホバー: `hover:bg-bg-elevated` のようなサーフェス変化のみ。`scale()` は使わない

### 入力欄

- Radius: `rounded-2xl`
- Border: `border border-bg-border` または `border border-warm-silver/40`
- Focus: フォーカスリング `var(--focus-ring)` (#435ee5 / #617bff)
- Line-height: `:lang(ja)` ルールで自動適用 (1.5)

### モーダル・ダイアログ

- Radius: `rounded-2xl`
- Background: `bg-bg-card`
- ボタン配置: Cancel (`bg-sand`) → Confirm (`bg-accent`) の順

### サイドバー

- Background: `bg-bg-sidebar`
- アクティブリンク: `bg-bg-elevated rounded-2xl font-medium`
- セクションヘッダー: `text-[11px] font-semibold uppercase tracking-wider text-text-muted`（英語固定文字列のみ）

### コンテキストメニュー・ドロップダウン

- Radius: `rounded-2xl`
- Danger item: `text-danger hover:bg-accent/10`

### セクションヘッダーラベル（i18n）

- `tracking-wider` を **使用しない**（日本語が描画される）
- `text-sm font-semibold uppercase text-text-muted` に留める

---

## 6. 影・深度

| レベル | 処理 | 用途 |
|---|---|---|
| 0 (Flat) | 影なし | カード・ボタン（標準） |
| 1 (Elevated) | `bg-bg-elevated` サーフェス変化 | ツールバー・サブパネル |
| 2 (Overlay) | 最小 shadow + `bg-bg-card` | モーダル・ドロップダウン |

**Shadow Philosophy**: 影を使わず、サーフェスカラーの差と角丸で深度を表現する。

---

## 7. アニメーション

| ユーティリティ | 動き | 使用箇所 |
|---|---|---|
| `animate-fade-in` | 200ms fade | 一般的な要素出現 |
| `animate-fade-in-scale` | 200ms fade + scale 0.95→1 | モーダル・ダイアログ |
| `animate-slide-up` | 250ms slide（中央固定要素） | トースト |
| `animate-slide-up-bar` | 300ms cubic-bezier slide | 選択バー |
| `animate-pop` | 250ms scale 1→1.25→1 | ハート・お気に入りアイコン |

`@media (prefers-reduced-motion: reduce)` でアニメーション全停止。

---

## 8. テーマ切替

`localStorage('theme-preference')` → `document.documentElement.setAttribute('data-theme', t)` で SSR フラッシュを防ぐインラインスクリプトを `<head>` 先頭に配置。

- `'light'` → `[data-theme="light"]` ルールを適用
- `'dark'` → `[data-theme="dark"]` ルールを適用
- `'system'` → `@media (prefers-color-scheme: *)` ルールを適用

---

## 9. Do's and Don'ts

### Do
- ウォームニュートラル（`--sand`, `--warm-light`, `--warm-silver`）でオリーブ/サンドトーンを維持
- `--accent` はCTA・ブランド強調のみに使用
- `rounded-2xl` (16px) をボタン・入力欄の標準、`rounded-xl` (12px) をカードの標準とする
- 見出し・本文・フォームの行間を分離（jp-ui-contracts ルール）
- 日本語が出るi18n箇所に `tracking-wider` を使わない
- `overflow-wrap: anywhere` を長語・URLに使う（`break-all` ではなく `break-anywhere` ユーティリティ）
- プラムブラック（`#211922` / `#f5e6e8`）をプライマリテキストに使う

### Don't
- `word-break: break-all` を本文・UIラベルに全体適用しない
- `scale()` ホバーをカード・ボタンに使わない（静的な重さを維持）
- 追加ブランドカラーを導入しない（コーラルレッド + ウォームニュートラルが完全なパレット）
- 影（box-shadow）を装飾目的で使わない
- 12px 未満の border-radius をカード外部に使わない
- クールグレーを使わない（常にウォーム/オリーブトーン）
- ダークモードに純黒を使わない（ウォームプラムダーク `#1a0e10`）
