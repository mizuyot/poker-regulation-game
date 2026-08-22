# ポーカー大会、適法性と面白さの両立は可能か

まず理想の大会を設計し、次にそれを実現するハードルを考えるゲームです。法的助言ではありません。

**正本:** `docs/questions.json`（GitHub Pages もローカルサーバも、ここだけを読む）

## 起動

```bash
python3 server.py
```

ブラウザで http://127.0.0.1:8765 を開く。

## RAG用データの生成

```bash
python3 scripts/build_rag.py   # docs/questions.json → data/questions_rag.jsonl と docs/index.html への埋め込み
```

手で `questions_rag.jsonl` を編集しないこと。正本は常に `docs/questions.json`。フィールドは `{id, section, prompt, choices, designerChoice, explanation, source_urls}`。

## データの置き場所

| ファイル | 役割 |
|---|---|
| `docs/questions.json` | 設問・選択肢・設計者の選択・解説の正本 |
| `data/answers.jsonl` | 1行1回答。`session_id`, `question_id`, `selected`, `is_match`, `timestamp` のみ。d1〜d7 は `is_match: null` |
| `data/questions_rag.jsonl` | RAG投入用。`scripts/build_rag.py` で生成 |

保存するのはセッションID・設問ID・選択肢・時刻のみ（ログ内部には比較結果 `is_match` も持つ）。IPアドレス、User-Agent、リファラ、個人を特定できる情報は保存しません。保持期間は集計公開後24か月、または保存開始から24か月のいずれか早い時点です。

## 公開前TODO

- 顧問弁護士（久保弁護士）のリーガルレビューを通すこと
- q00：偶然の輸贏判例の射程
- q11：解釈運用基準の引用は、特定遊興飲食店営業に関する節の記載。一般化してよいか
- hurdle3リード：風営法23条2項と類型の説明
- q13 / q14 の実質論の書き方
