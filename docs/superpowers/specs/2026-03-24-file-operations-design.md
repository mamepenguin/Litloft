# Phase B: ファイル操作 — 設計書

## 概要

Phase A のファイル閲覧拡張に続き、ファイルの書き込み操作を追加する。

## 機能一覧

### アップロード
- チャンク分割アップロード（デフォルト5MB、最大2GB）
- D&D ゾーン + ファイル選択フォールバック
- ファイル単位の進捗バー、最大2並行
- 同名ファイルはエラーで拒否
- 動画/音声は自動で duration 取得、動画はサムネイル生成

### ダウンロード
- `GET /api/files/{id}/stream?download=true` で Content-Disposition: attachment 追加
- 既存のストリーミングエンドポイントを流用

### ファイル操作
- リネーム: FS + DB + サムネイルパス更新
- 移動: FS + DB (ドライブ間も対応)
- 削除: FS + DB + サムネイル削除

### フォルダ操作
- 作成: FS mkdir + EmptyFolder レコード
- リネーム: FS rename + 全 File の folder_path/file_path 一括 SQL UPDATE
- 削除: 空フォルダのみ（409 if non-empty）

## DB変更

### EmptyFolder テーブル
ファイルが1つもないフォルダの表示用。ファイルが追加されるとレコード削除。

| カラム | 型 | 制約 |
|--------|-----|------|
| id | INTEGER | PK, AUTO |
| drive | TEXT | NOT NULL |
| path | TEXT | NOT NULL |
| created_at | DATETIME | |

UNIQUE: (drive, path)

## API

### アップロード
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/drives/{drive}/upload/init | セッション開始 |
| POST | /api/drives/{drive}/upload/{id}/chunk | チャンク送信 |
| POST | /api/drives/{drive}/upload/{id}/complete | 完了・DB登録 |
| DELETE | /api/drives/{drive}/upload/{id} | キャンセル |

### ファイル操作
| メソッド | パス | 説明 |
|---------|------|------|
| PUT | /api/files/{id}/rename | リネーム |
| PUT | /api/files/{id}/move | 移動 |
| DELETE | /api/files/{id} | 削除 |

### フォルダ操作
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/drives/{drive}/folders | 作成 |
| PUT | /api/drives/{drive}/folders | リネーム |
| DELETE | /api/drives/{drive}/folders?path= | 削除 |

## Docker変更
- ドライブマウント: `:ro` → `:rw`
- drives.json: `readonly` フラグ（オプション）で個別制御

## セキュリティ
- パストラバーサル: `os.path.realpath()` + base_dir チェック（全書き込み操作）
- ファイル名サニタイズ: `<>:"/\|?*\x00` 禁止、`.` 始まり禁止
- readonly 強制: ドライブ単位で書き込み拒否（403）
- アップロード: file_size <= 2GB、一時ディレクトリ隔離、放置クリーンアップ
