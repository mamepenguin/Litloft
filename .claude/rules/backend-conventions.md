# Backend 規約

## config インポート
`app.config` はモジュール参照で使う。テスト時のパス差し替えが効かなくなるため、直接importは禁止:
```python
# CORRECT
import app.config as config
config.DATA_DIR

# WRONG - テスト時にパッチが効かない
from app.config import DATA_DIR
```

## セキュリティパターン
- パストラバーサル防止: IDベースでDBからfile_path取得 → `os.path.realpath()` で正規化 → base_dir配下か検証
- スキャン排他制御: `asyncio.Lock` で同時実行防止、ロック中は 409 Conflict

## サムネイル生成
- 動画: ffmpegの`thumbnail=300`フィルタで代表フレーム自動選択（イントロ10%スキップ）
- 画像: Pillowリサイズ。HEICはffmpegではなくPillowで生成
- いずれも320x180 JPEG

## 同時実行制御パターン
- スプライトシート生成: `asyncio.Semaphore(2)` + in-progressセットで重複防止
- ZIP展開: `asyncio.Semaphore(3)` で同時展開制限
- 原子的ファイル書き出し: `.tmp` → `os.replace()` パターン

## 禁止事項
- LLMや文字列処理に言語依存のロジックを含めてはならない（"タイトル"で検索してタイトルを検出するなど）