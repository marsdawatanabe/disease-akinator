# コーダー完了報告

## ステータス
完了 (TypeScriptエラーなし)

## 実施内容 — Gemini API全面移行

### 1. `/src/app/api/next-question/route.ts` — 全面書き換え
- ベイズ推論・diseases.json依存を完全除去
- リクエストボディを `{ answers, ageRange, gender }` に変更
- Geminiへのプロンプトをルール・出力形式付きで構築する `buildPrompt()` を実装
- Geminiレスポンスから `type: "question"` / `type: "result"` のJSONを抽出する `extractJson()` を実装（コードブロックあり・なし両対応）
- model: gemini-2.5-flash / temperature: 0.3 / maxOutputTokens: 1500 / thinkingBudget: 0
- エラー時は `{ type: "error", message: "..." }` を返す

### 2. `/src/app/questions/page.tsx` — 全面書き換え
- ベイズモジュール・diseases.jsonのimportをすべて削除
- `BayesianState` → `SimpleState` に置き換え
- localStorageキーを `"akinator_bayes_state"` → `"akinator_state"` に変更
- 初期化時にAPIを呼んで最初の質問を取得
- 回答後にAPIを呼んで `type: "question"` なら次の質問、`type: "result"` なら /results に遷移
- 「前の質問に戻る」: `questionHistory` からpopして前の質問を再表示（APIを呼び直さない）
- `CircularProgress` コンポーネントはそのまま残存
- MAX_QUESTIONS=15 のままプログレス表示に使用

### 3. `/src/app/results/page.tsx` — 軽微な修正
- `ResultItemWithFallback` 型を削除（Geminiの結果をそのまま使うため不要）
- `BAYES_STATE_KEY` → `AKINATOR_STATE_KEY ("akinator_state")` に変更
- `isFallback` 判定: `fallback` フラグの代わりに `answerCount <= 2` で判定
- `handleRestart` のlocalStorage削除キーを更新

### 4. `/src/types/index.ts` — 更新
- `QuestionState` 型を削除
- `SimpleState` 型を追加してexport
- `ResultItem.diseaseId` をoptional (`diseaseId?`) に変更（GeminiはdiseaseIdを返さないため）

## 変更していないもの
- `src/lib/bayesian.ts` — 削除せず残存（参照なし）
- `src/data/diseases.json` — 削除せず残存（emergency/page.tsxが使用）
- `src/app/emergency/page.tsx` — 変更なし
- `src/app/page.tsx` — 変更なし
- 既存UIデザイン（色・フォント・レイアウト）— 変更なし

## 検証
- `npx tsc --noEmit` → エラーなし
