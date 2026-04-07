# 重要な設計判断

コードを読むだけではわからない「なぜそうなっているか」をまとめたもの。
詳細な設計書は `docs/superpowers/specs/` にある。

## アクセス制御
- **保護ドライブの不可視性**: 未ロック時はAPI応答から完全除外（403ではなく404を返す）
- **`/unlock` ページ**: UIにリンクなし、URLを知っている人だけがアクセス
- **`passwords.json` 未配置時**: 全ドライブ公開（graceful degradation）
- **`passwords.json` 使用時**: `docker-compose.yml` の backend volumes に `./passwords.json:/app/passwords.json:ro` を追加する必要あり

## ドライブ設計原則
- 各ドライブは完全に独立（横断検索・横断お気に入り不要）
- ドライブ設定は `drives.json` で管理（DB外）。変更時はコンテナ再起動
- `drives.json` に `readonly: true` で書き込み禁止
- お気に入りURLは `?view=favorites` クエリパラメータ（フォルダ名との競合回避）

## ゴミ箱（ソフトデリート）
- **FSファイルはそのまま残す**: ゴミ箱に入れてもFSは変更しない。パージ時に初めて物理削除
- **自動パージ**: 30日経過でstartup時+24時間ごとに物理削除
- **既存クエリ**: 全てに `File.deleted_at.is_(None)` フィルタ追加済み
- **スキャナー**: ソフトデリート済みファイルはスキップ（removed扱いにしない）

## 視聴履歴・プロファイル
- **プロファイルとアクセス制御は独立**: JWT `hv_token` = ドライブアクセス制御、Cookie `hv_viewer` = 個人識別。直交する概念
- **ニックネーム方式**: アカウント不要。サーバー側でSHA-256ハッシュ→viewer_id
- **プロファイル未設定時**: localStorageフォールバック、サーバーへの保存なし（204返却）
- **プロファイル一覧API不在**: プライバシー保護（意図的な設計）

## WebSocket
- **選定理由**: 「backendは外部非公開」の設計方針維持。Next.js Custom Serverでプロキシ
- **未認証でも接続許可**: 全公開モード対応。保護ドライブ通知のみフィルタ
- **スキャナー連携**: `run_in_executor` → `call_soon_threadsafe` で非同期ブロードキャストに橋渡し

## HEIC画像対応
- **問題の本質**: Debian aptのffmpegはlibheif未対応でサムネイル真っ黒になる
- **解決**: `pillow-heif` + Pillow によるサーバーサイドJPEG変換（ffmpegは使わない）
