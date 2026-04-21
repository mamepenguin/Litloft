# Frontend 規約

## デザインシステム
- UI に関わる変更（色・タイポグラフィ・radius・テーブル・MarkdownPreview・長文プロース全般）は必ず `DESIGN.md` に従う
- 新しいカラートークン・radius 値・タイポグラフィスケールを追加する場合は、実装と同時に `DESIGN.md` を更新する（実装だけ先行させない）
- ハードコードで `max-width` や `font-size` を積む前に、`DESIGN.md` §3 / §4 に既存スケールがないか確認する

## Next.js 16
- `params` は `Promise` 型。Server Component では `await params`、Client Component では `use(params)` または `useParams()`
- トップページ (`/`) は Server Component で `http://backend:8000` に直接fetch
- ドライブ・ファイルページは Client Component で `/api/` (rewrites経由) にfetch

## i18n (next-intl)
- ルーティング方式: Cookie-only（`NEXT_LOCALE`）。URLにロケールプレフィックスなし
- Client Component: `useTranslations('namespace')`
- Server Component: `getTranslations('namespace')`

## テストライブラリ制約
- Vitest 4はrolldownネイティブバインディング問題あり → **3.x を使うこと**
- jsdom 29はESM互換性問題あり → **25.x を使うこと**
