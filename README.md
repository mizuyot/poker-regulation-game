# 規制内最大化ゲーム

ポーカー大会の設計方針を選択肢にし、設計者の考えと業界の認識がどこで割れるかを可視化するゲームです。法的助言ではありません。

**公開URL:** https://mizuyot.github.io/poker-regulation-game/

## 起動

macOS 標準の Python 3 だけで動きます。追加パッケージは不要です。

```bash
cd /Users/yotamizuno/poker-regulation-game
python3 server.py
```

ブラウザで http://127.0.0.1:8765 を開く。

## データの置き場所

| ファイル | 役割 |
|---|---|
| `questions.json` | 設問・選択肢・設計者の選択・解説。実装と分離してあるので、このファイルだけ差し替えれば設問を変えられる |
| `data/answers.jsonl` | 1行1回答。`session_id`, `question_id`, `selected`, `is_match`, `timestamp` のみ |

IPアドレス、User-Agent、リファラ、個人を特定できる情報は保存しません。保持期間は集計公開後24か月、または保存開始から24か月のいずれか早い時点です。

## 公開前に残っていること

- 顧問弁護士（久保弁護士）のリーガルレビュー
- 資金フローの説明と実際が食い違っていないことの確認（固有名詞は出していない）
- 回答分布の公開タイミングと文面
