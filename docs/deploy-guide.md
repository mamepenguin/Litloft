# Video Share デプロイガイド

## 前提条件

- Docker および Docker Compose
- Git
- Mac mini (または Linux/macOS マシン)

## 初回セットアップ

### 1. リポジトリの取得

```bash
git clone <repository-url> ~/Sources/video_share
cd ~/Sources/video_share
```

### 2. ドライブ設定

`drives.json.example` をコピーして編集します。

```bash
cp drives.json.example drives.json
```

```json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "テレビ番組", "path": "/app/drives/tv", "readonly": true }
]
```

各フィールド:
- `name`: UIに表示されるドライブ名（パス区切り文字不可）
- `path`: コンテナ内のマウントパス
- `readonly` (任意): `true` でファイル操作（アップロード、削除等）を禁止
- `access_group` (任意): アクセス制御グループ名（後述）

### 3. docker-compose.yml のカスタマイズ

ドライブのボリュームマウントを追加します。

```yaml
services:
  backend:
    volumes:
      - ./drives.json:/app/drives.json:ro
      - /path/to/family-videos:/app/drives/family:ro
      - /path/to/tv-shows:/app/drives/tv:ro
      - ./data:/app/data
```

- 読み取り専用ドライブは `:ro` でマウント
- 書き込み可能なドライブはコンテナ内から書き込みが発生するため `:ro` を付けない

### 4. 起動

```bash
docker compose up -d --build
```

ブラウザで `http://<Mac miniのIP>:3000` にアクセスして動作確認。

## アクセス制御の設定

家族にドライブの存在を見せたくない場合、パスワードベースのアクセス制御を設定できます。

### 1. パスワード設定ファイルの作成

```bash
cp passwords.json.example passwords.json
```

```json
[
  { "password": "family-secret", "groups": ["family"] },
  { "password": "my-master-pw", "groups": ["family", "private"] }
]
```

各エントリ:
- `password`: ロック解除に使うパスワード
- `groups`: このパスワードで解除されるグループ名のリスト

### 2. ドライブにアクセスグループを設定

`drives.json` を編集して `access_group` を追加します。

```json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "映画", "path": "/app/drives/movies", "access_group": "family" },
  { "name": "仕事", "path": "/app/drives/work", "access_group": "private" }
]
```

この例では:
- 「家族ビデオ」: 誰でも見える
- 「映画」: `family-secret` または `my-master-pw` で見える
- 「仕事」: `my-master-pw` でのみ見える

### 3. docker-compose.yml にマウントを追加

`passwords.json` をコンテナにマウントします。backend の volumes セクションに追加:

```yaml
    volumes:
      - ./passwords.json:/app/passwords.json:ro   # この行を追加
```

### 4. コンテナ再起動

設定変更後はコンテナの再ビルド・再起動が必要です。

```bash
docker compose up -d --build
```

### 4. ロック解除の使い方

1. ブラウザで `http://<IP>:3000/unlock` にアクセス
2. パスワードを入力
3. 「Remember this device」にチェックを入れるとブラウザに記憶される（1年間有効）
4. 「Unlock」をクリックするとトップページにリダイレクトされ、保護ドライブが表示される

ロック解除中はサイドバーに「Lock」ボタンが表示されます。クリックすると即座にロックされます。

### パスワード未設定時の動作

`passwords.json` が存在しない場合、全ドライブが公開されます（アクセス制御なし）。
`access_group` が設定されたドライブがあっても、対応するパスワードが `passwords.json` にないと永久にアクセスできないため注意してください。

## 自動デプロイ（Git Push）

Mac mini に bare リポジトリを作成し、`post-receive` hook で自動デプロイできます。

### セットアップ

```bash
# bare リポジトリ作成
git init --bare ~/video-share.git

# hook を設置
cp ~/Sources/video_share/deploy/post-receive ~/video-share.git/hooks/post-receive
chmod +x ~/video-share.git/hooks/post-receive
```

### 開発マシンからデプロイ

```bash
git remote add deploy ssh://user@mac-mini/~/video-share.git
git push deploy main
```

`docker compose build` が成功した場合のみコンテナが再起動されます。ビルドに失敗した場合、現バージョンが維持されます。

## バックアップ

以下のファイル/ディレクトリをバックアップしてください:

| 対象 | 内容 |
|------|------|
| `data/` | SQLite DB (`videos.db`) + サムネイル画像 + JWT シークレット (`.jwt_secret`) |
| `drives.json` | ドライブ設定 |
| `passwords.json` | アクセス制御パスワード（設定している場合） |

ドライブのコンテンツ（動画ファイル等）は別途バックアップしてください。

```bash
# バックアップ例
tar czf video-share-backup-$(date +%Y%m%d).tar.gz data/ drives.json passwords.json
```

## トラブルシューティング

### ドライブが表示されない

1. `drives.json` の構文を確認: `python3 -c "import json; json.load(open('drives.json'))"`
2. docker-compose.yml でボリュームがマウントされているか確認
3. コンテナログを確認: `docker compose logs backend`

### 保護ドライブが /unlock しても見えない

1. `passwords.json` の `groups` と `drives.json` の `access_group` が一致しているか確認
2. ブラウザの Cookie が有効か確認（プライベートブラウジングでは「記憶する」が効かない場合あり）
3. コンテナを再起動して設定を再読み込み

### サムネイルが表示されない

- `data/thumbnails/` ディレクトリのパーミッションを確認
- `docker compose logs backend` で ffmpeg のエラーを確認

### ポート変更

`docker-compose.yml` の `ports` セクションを変更:

```yaml
  frontend:
    ports:
      - "8080:3000"  # 外部8080 → 内部3000
```
