# コーダー完了報告

## ステータス
完了 — npm run build 通過（エラー・警告ゼロ）

## 作成・変更したファイル

### 新規作成
- `src/types/index.ts` — 全型定義（Disease, Symptom, EmergencyCheck, DiseaseDB, Answer, Gender, AgeRange, QuestionState, ResultItem）
- `src/lib/bayesian.ts` — ベイジアン推論エンジン

### 変更
- `src/app/emergency/page.tsx` — DBデータ（emergencyChecks）に接続
- `src/app/questions/page.tsx` — ベイジアンエンジン接続・localStorage途中保存
- `src/app/results/page.tsx` — localStorage結果読み込み・実データ表示

## 実装内容

### ベイジアン推論エンジン（src/lib/bayesian.ts）
- `initializeProbabilities(ageRange, gender)` — 年齢・性別から事前確率を計算
- `createInitialState(ageRange, gender)` — 初期BayesianStateを生成
- `updateProbabilities(probs, symptomId, diseaseId, answer)` — ベイズ更新
  - はい: P(D) × (0.5 + weight × 0.5) で強化
  - いいえ: P(D) × (1 - weight × 0.5) で弱体化
  - わからない: 変更なし
- `selectNextQuestion(state)` — 情報利得最大化で次の質問を選択
- `computeResults(state)` — 上位5件のResultItemを生成
- `shouldStop(state)` — 収束判定（15問到達 or トップ確率≥0.6）

### 画面接続
- emergency: diseasesData.emergencyChecks を static import で表示、チェック時にdescriptionも表示
- questions: BayesianState を localStorage に都度保存（途中離脱→復帰対応）、selectNextQuestion で質問を動的選択、shouldStop で結果画面へ自動遷移
- results: localStorage の akinator_results を読み込み、上位1件の受診科をヒーローに表示、matchedSymptoms（回答との一致）をアコーディオン内に表示

### localStorage キー
| キー | 内容 |
|------|------|
| akinator_session | 年齢・性別・開始時刻 |
| akinator_bayes_state | 途中のベイズ状態（質問完了後クリア） |
| akinator_results | 最終結果（上位5件のResultItem） |

## 注意事項
- 既存UIデザイン（色・レイアウト・コンポーネント）は一切変更していない
- diseases.jsonは static import（fetchなし）
- "use client" は全ページに設定済み
