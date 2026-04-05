# HANDOVER — 病気アキネーター

## ステータス: デプロイ済み・運用中

## 本番URL
- https://disease-akinator.vercel.app
- GitHub: https://github.com/marsdawatanabe/disease-akinator

## 現在のアーキテクチャ
- **Next.js 16 (App Router)** + TypeScript + Tailwind CSS v4
- **Gemini 2.5 Flash** が質問選択・診断結果生成をすべて担当（APIキーはVercel環境変数に設定済み）
- ベイズ推論エンジンは廃止済み（src/lib/bayesian.ts は残っているが未使用）
- diseases.json は緊急チェック（emergency/page.tsx）のみで使用
- shadcn/ui コンポーネント（手動実装）: Button, Card, Accordion, Alert, Progress
- localStorage でセッション永続化

## 画面フロー
1. `/` — スタート画面（年齢・性別選択）→ 赤字免責あり
2. `/emergency` — 緊急チェック（8項目）→ チェック済み症状をlocalStorageに保存
3. `/questions` — AI質問画面（Gemini APIで質問選択、最大15問）
4. `/results` — 診断結果（Gemini生成、関連度最大85%）→ 赤字免責あり

## API構成
- `/api/next-question` (POST) — Gemini 2.5 Flashを呼び出し
  - リクエスト: answers(Q&A履歴), ageRange, gender, emergencySymptoms
  - レスポンス: `{type:"question", question, explanation}` or `{type:"result", results:[...]}`
  - エラー時: `{type:"error", message}`

## 環境変数
- `GEMINI_API_KEY` — .env.local（ローカル）とVercel環境変数（本番）の両方に設定済み

## 直前にやったこと
- Gemini全面移行（ベイズ推論→AI）
- 緊急チェックの選択症状をAI診断に引き継ぐ機能追加
- プロンプトに「はい/いいえで答えられる形式のみ」ルール追加（AかBか等を禁止）
- スタート画面・結果画面に赤字免責警告追加
- 収束速度の調整（最低3問、関連度上限85%）

## 既知の課題・次にやるべきこと
- src/lib/bayesian.ts と src/data/diseases.json の疾患データは未使用だが残っている（クリーンアップ可能）
- Gemini API障害時のフォールバックが弱い（nullを返すだけ）
- テストなし（Gemini依存のためE2Eテストが望ましい）
- デザインレビュー未実施（フェーズ4の3AI検証が途中）

## Git状態
- ブランチ: master
- リモート: origin/master と同期済み
- 未コミットの変更なし
