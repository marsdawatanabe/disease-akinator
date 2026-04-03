// 目的: Gemini APIに質問選択と診断結果生成をすべて委ねるAPI Route
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// 目的: リクエストボディの型定義
interface RequestBody {
  answers: Array<{ question: string; answer: "yes" | "no" | "unknown" }>;
  ageRange: string;
  gender: string;
}

// 目的: Geminiが返す質問オブジェクトの型
interface GeminiQuestion {
  type: "question";
  question: string;
  explanation: string;
}

// 目的: Geminiが返す診断結果の各候補アイテムの型
interface GeminiResultItem {
  name: string;
  department: string;
  description: string;
  relevance: number;
  matchedSymptoms: string[];
}

// 目的: Geminiが返す診断結果オブジェクトの型
interface GeminiResult {
  type: "result";
  results: GeminiResultItem[];
}

// 目的: GeminiへのプロンプトをQ&A履歴と属性情報から組み立てる
function buildPrompt(body: RequestBody): string {
  const { answers, ageRange, gender } = body;

  // 目的: 性別を日本語に変換する
  const genderLabel =
    gender === "male" ? "男性" : gender === "female" ? "女性" : "未指定";

  // 目的: Q&A履歴を箇条書き形式に整形する
  const answerHistory =
    answers.length === 0
      ? "(まだ回答なし)"
      : answers
          .map(({ question, answer }) => {
            const label =
              answer === "yes"
                ? "はい"
                : answer === "no"
                ? "いいえ"
                : "わからない";
            return `- ${question}: ${label}`;
          })
          .join("\n");

  return `あなたは症状チェッカーAIです。ユーザーの年齢・性別・回答履歴をもとに、次に聞くべき症状質問を1つ選ぶか、十分な情報が集まったら診断結果を出してください。

## ルール
1. 質問は必ず「はい/いいえ/わからない」で答えられる形式にすること
   - 良い例:「吐き気はありますか？」「頭痛はありますか？」「38度以上の熱はありますか？」
   - 悪い例:「痛いですか？それとも痛くないですか？」「どこが痛みますか？」「いつから症状がありますか？」
   - 「AですかBですか」「いつ」「どこ」「どのくらい」のような選択式・自由回答式は絶対に禁止
   - 1つの質問で1つの症状だけを聞くこと
2. 質問には必ず「なぜこの質問をするのか」の簡単な説明をつけること
3. 最大15問まで。3問以上回答があり十分に絞り込めたら早めに診断結果を出してよい
4. 診断結果を出す時は、疾患候補を最大5つ、関連度（最大85%）付きで返すこと
5. 各疾患には受診すべき科、簡単な説明、ユーザーの回答と一致した症状を含めること
6. 100%や確定診断のような表現は絶対に使わないこと
7. 日本語で回答すること

## ユーザー情報
- 年齢: ${ageRange}
- 性別: ${genderLabel}

## これまでの回答
${answerHistory}

## 出力形式
まだ質問が必要な場合:
\`\`\`json
{
  "type": "question",
  "question": "質問文",
  "explanation": "なぜこの質問をするか"
}
\`\`\`

診断結果を出す場合:
\`\`\`json
{
  "type": "result",
  "results": [
    {
      "name": "疾患名",
      "department": "受診すべき科",
      "description": "疾患の簡単な説明",
      "relevance": 75,
      "matchedSymptoms": ["一致した症状1", "一致した症状2"]
    }
  ]
}
\`\`\``;
}

// 目的: GeminiのレスポンステキストからJSONブロックを抽出してパースする
function extractJson(text: string): GeminiQuestion | GeminiResult | null {
  // コードブロック内のJSONを優先して抽出する
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.type === "question" || parsed.type === "result") {
      return parsed as GeminiQuestion | GeminiResult;
    }
    return null;
  } catch {
    // コードブロックなしで生のJSONが返ってきた場合のフォールバック
    const rawMatch = text.match(/\{[\s\S]*?"type"\s*:\s*"(?:question|result)"[\s\S]*?\}/);
    if (!rawMatch) return null;
    try {
      const parsed = JSON.parse(rawMatch[0]);
      if (parsed.type === "question" || parsed.type === "result") {
        return parsed as GeminiQuestion | GeminiResult;
      }
    } catch {
      // パース失敗は無視
    }
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { type: "error", message: "APIキーが設定されていません" },
        { status: 500 }
      );
    }

    const prompt = buildPrompt(body);

    // 目的: Gemini 2.5 Flashで質問または診断結果を生成する
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text ?? "";
    const parsed = extractJson(text);

    if (!parsed) {
      console.error("Gemini JSON parse error. Raw text:", text);
      return NextResponse.json(
        { type: "error", message: "AIの応答を解析できませんでした" },
        { status: 500 }
      );
    }

    // 目的: Geminiの応答をそのままクライアントに返す
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Gemini API error:", error);
    return NextResponse.json(
      { type: "error", message: "AI診断中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
