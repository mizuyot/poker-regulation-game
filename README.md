# ポーカー大会、適法性と面白さの両立は可能か

まず理想の大会を設計し、次にそれを実現するハードルを考えるゲームです。法的助言ではありません。

**正本:** `docs/questions.json`（GitHub Pages もローカルサーバも、ここだけを読む）

法令マップ（実現可能性バッジ・条文チップ）と現状整理ページを公開中。バッジ割当・現状整理の導出・未確認条文の逐語は、公開ブラッシュアップ完了後に久保弁護士のレビューへ回す。

## 起動

```bash
python3 server.py
```

ブラウザで http://127.0.0.1:8765 を開く。

## RAG用データの生成

```bash
python3 scripts/build_rag.py   # docs/questions.json → data/questions_rag.jsonl と docs/index.html への埋め込み
```

手で `questions_rag.jsonl` を編集しないこと。正本は常に `docs/questions.json`。フィールドは `{id, section, format, prompt, choices, designerChoice, explanation, source_urls, provisionIds}`。道の問いの `choices` には `tier`・`provisionIds`・`note` を含む。

## データの置き場所

| ファイル | 役割 |
|---|---|
| `docs/questions.json` | 設問・選択肢・設計者の選択・解説・条文マスタ・バッジ定義の正本 |
| `data/answers.jsonl` | ローカル用の控え。公開ページでは回答を送信しない |
| `data/questions_rag.jsonl` | RAG投入用。`scripts/build_rag.py` で生成 |

公開ページでは、回答はこの端末内でのみ処理され、送信されません（集計版は準備中）。集計の仕組みを整えたうえで、分布を公開する予定です。ローカル起動時のみ、同一オリジンの `api/answers` に匿名ログ（セッションID・設問ID・選択肢・時刻）を残します。

Part 1 の設問IDは v5.2 で `q01`・`d4` を廃止し `d0` に統合した。過去の JSONL にある `q01` / `d4` 行とは id が断絶する。

## 公開前TODO（リーガルレビュー）

公開ブラッシュアップ完了後、以下をまとめて久保弁護士のレビューに通すこと。

- 現状整理の導出ルール——特に「ノープライズなら賭博の論点は発生しない」という表示の妥当性
- d0統合後の診断（内容×原資）の表示文言一式
- 全バッジ割当（道の問いの選択肢ごとの green/amber/red）
- 186条・風営法2条1項の逐語
- 「偶然の輸贏」判例の射程
- q11：解釈運用基準の引用は、特定遊興飲食店営業に関する節の記載。一般化してよいか
- hurdle3リード：風営法23条2項と類型の説明
- q13 / q14 の実質論の書き方
