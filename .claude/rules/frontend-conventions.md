# Frontend 規約

## デザインシステム
- UI に関わる変更（色・タイポグラフィ・radius・テーブル・MarkdownPreview・長文プロース全般）は必ず `DESIGN.md` に従う
- 新しいカラートークン・radius 値・タイポグラフィスケールを追加する場合は、実装と同時に `DESIGN.md` を更新する（実装だけ先行させない）
- ハードコードで `max-width` や `font-size` を積む前に、`DESIGN.md` §3 / §5 に既存スケールがないか確認する

## Next.js 16
- `params` は `Promise` 型。Server Component では `await params`、Client Component では `use(params)` または `useParams()`
- トップページ (`/`) は Server Component で `http://backend:8000` に直接fetch
- ドライブ・ファイルページは Client Component で `/api/` (rewrites経由) にfetch

## i18n (next-intl)
- ルーティング方式: Cookie-only（`NEXT_LOCALE`）。URLにロケールプレフィックスなし
- Client Component: `useTranslations('namespace')`
- Server Component: `getTranslations('namespace')`

## 翻訳ファイルの管理方針

| ファイル | 役割 | git 管理 |
|---|---|---|
| `frontend/src/messages-core/{locale}.json` | コア定義（編集対象） | ✅ 管理する |
| `frontend/src/messages/{locale}.json` | マージ済み自動生成 | ❌ gitignore |
| `addons/{name}/frontend/messages/{locale}.json` | アドオン定義（編集対象） | ✅ 管理する（アドオン repo） |

- **コアの翻訳キーは `messages-core/` にのみ記載する**。`messages/` は `scripts/merge-addon-messages.mjs` が生成するため直接編集しない
- **アドオンの翻訳キーはそのアドオンの `frontend/messages/` にのみ記載する**。コア側に混入させない
- マージスクリプトは `messages-core/` + `src/addons/*/messages/` を deep merge して `messages/` を生成する（Dockerfile ビルド時・`pnpm dev` 前に実行）

## テストライブラリ制約
- Vitest 4はrolldownネイティブバインディング問題あり → **3.x を使うこと**
- jsdom 29はESM互換性問題あり → **25.x を使うこと**
