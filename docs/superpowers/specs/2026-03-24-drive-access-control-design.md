# ドライブアクセス制御 設計書

## 概要

Video Share にドライブ単位のプライバシー保護機能を追加する。保護ドライブはロック解除するまで存在自体がAPIレスポンスから除外され、UIにも表示されない。

## 背景

家庭内LANで家族がアクセスする可能性があるため、特定のドライブを特定のパスワードを知っている人だけに見せたい。保護レベルは「開発者ツールで簡単には突破できない」程度（APIレベルで検証）。

## 設計

### アクセスモデル: 独立型グループ

```
drives.json:
  "家族ビデオ"  → access_group: なし（公開）
  "映画"       → access_group: "family"
  "仕事"       → access_group: "private"

passwords.json:
  パスワードA → groups: ["family"]          （映画だけ見える）
  パスワードB → groups: ["family", "private"] （映画＋仕事が見える）
```

- 各ドライブは最大1つの `access_group` に所属（または公開）
- 各パスワードは1つ以上のグループを解除できる
- 上位パスワードで複数グループをまとめて解除可能

### 認証フロー

```
ユーザー → /unlock にアクセス（URLは非公開、UIにリンクなし）
        → パスワード入力 + 「このデバイスを記憶する」チェック
        → POST /api/auth/unlock
        → Backend がパスワード照合
        → JWT Cookie 発行（HttpOnly, SameSite=Strict）
           - 記憶する: Max-Age=1年
           - 記憶しない: セッションCookie
        → / にリダイレクト
        → 以降のAPIリクエストにCookieが自動付与
        → Backend がJWTのgroupsでドライブをフィルタ
```

### JWT Cookie

- **名前**: `access_token`
- **ペイロード**: `{"groups": ["family", "private"], "iat": ..., "exp": ...}`
- **署名**: HMAC-SHA256（シークレットは `DATA_DIR/.jwt_secret` に自動生成・永続化）
- **属性**: `HttpOnly=True`, `SameSite=Strict`, `Secure=False`（LAN内HTTP前提）, `Path=/`

### 設定ファイル

**`passwords.json`**（git管理外、Docker :ro マウント）:
```json
[
  { "password": "family2024", "groups": ["family"] },
  { "password": "master-pw", "groups": ["family", "private"] }
]
```

**`drives.json`**（`access_group` フィールド追加）:
```json
[
  { "name": "家族ビデオ", "path": "/app/drives/family" },
  { "name": "映画", "path": "/app/drives/movies", "access_group": "family" },
  { "name": "仕事", "path": "/app/drives/work", "access_group": "private" }
]
```

`passwords.json` が存在しない場合、全ドライブが公開（既存動作と同じ）。

### API エンドポイント

新規:

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/auth/unlock | パスワード検証 → JWT Cookie 発行 |
| POST | /api/auth/lock | Cookie 削除 |
| GET | /api/auth/status | ロック解除状態の確認 |

既存エンドポイントの変更:
- `GET /api/drives`: Cookie の groups でフィルタ。`protected: bool` フィールド追加
- `/api/drives/{drive}/*`: `check_drive_access()` で未ロックドライブは 404
- `/api/files/{id}/*`: ファイルの所属ドライブを検証、未ロックなら 404

### UI

- `/unlock` ページ: パスワード入力 + 記憶チェックボックス。UIからのリンクなし
- サイドバー: 保護ドライブに鍵アイコン表示
- サイドバー: ロック解除中は手動ロックボタン表示（押下でCookie削除→リロード）

### セキュリティ

- パスワード照合: `hmac.compare_digest()` でタイミング攻撃対策
- 保護ドライブ: 全APIで 404 返却（403 ではない）→ 存在漏洩なし
- ファイルエンドポイント: ID直指定でもドライブのアクセス権を検証
- JWT 署名でCookie改ざんを検知
- `passwords.json` はネットワークに露出しない（Docker内、APIエンドポイントなし）
