# ポーカー大会、適法性と面白さの両立は可能か

賞金の原資をスポンサーに置き、参加者同士でお金を取り合わない大会設計を、関門ごとに考えるゲームです。借りるのはゴルフやマラソンの構造であって、事業モデルではありません。法的助言ではありません。

**正本:** `docs/questions.json`（GitHub Pages もローカルサーバも、ここだけを読む）

## 起動

```bash
python3 server.py
```

ブラウザで http://127.0.0.1:8765 を開く。

## RAG用データの生成

```bash
python3 scripts/build_rag.py   # docs/questions.json → data/questions_rag.jsonl
```

手で `questions_rag.jsonl` を編集しないこと。正本は常に `docs/questions.json`。

## データの置き場所

| ファイル | 役割 |
|---|---|
| `docs/questions.json` | 設問・選択肢・設計者の選択・解説の正本 |
| `data/answers.jsonl` | 1行1回答。`session_id`, `question_id`, `selected`, `is_match`, `timestamp` のみ |
| `data/questions_rag.jsonl` | RAG投入用。`scripts/build_rag.py` で生成 |

保存するのはセッションID・設問ID・選択肢・比較結果・時刻のみ。IPアドレス、User-Agent、リファラ、個人を特定できる情報は保存しません。保持期間は集計公開後24か月、または保存開始から24か月のいずれか早い時点です。

## 公開前TODO

- 顧問弁護士（久保弁護士）のリーガルレビューを通すこと
- q00（判例射程）を追加する場合は、公開前に射程を確認すること
- q11：解釈運用基準の引用は、特定遊興飲食店営業に関する節の記載。一般化してよいか
- 導入の風営法23条2項引用の表現
- q13 / q14 の実質論の書き方
- 回答分布の公開タイミングと文面
