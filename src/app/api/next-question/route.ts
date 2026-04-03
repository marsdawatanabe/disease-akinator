// 目的: Gemini APIを使って回答履歴から最適な次の質問を選択するAPI Route
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import diseasesData from "@/data/diseases.json";
import type { Disease, Answer } from "@/types";

const DB = diseasesData as { diseases: Disease[]; emergencyChecks: unknown[] };

// 目的: 全症状のID・質問文・所属疾患のマッピングを構築する
function buildSymptomIndex() {
  const symptoms: Array<{
    symptomId: string;
    question: string;
    explanation: string;
    diseaseId: string;
    diseaseName: string;
    weight: number;
  }> = [];

  for (const disease of DB.diseases) {
    for (const symptom of disease.symptoms) {
      symptoms.push({
        symptomId: symptom.id,
        question: symptom.question,
        explanation: symptom.explanation,
        diseaseId: disease.id,
        diseaseName: disease.name,
        weight: symptom.weight,
      });
    }
  }
  return symptoms;
}

const ALL_SYMPTOMS = buildSymptomIndex();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      answers,
      probabilities,
      ageRange,
      gender,
    }: {
      answers: Record<string, Answer>;
      probabilities: Record<string, number>;
      ageRange: string;
      gender: string;
      questionCount: number;
    } = body;

    // 目的: 回答済みの症状IDを除外して未回答の症状リストを作る
    const answeredIds = new Set(Object.keys(answers));
    const unansweredSymptoms = ALL_SYMPTOMS.filter(
      (s) => !answeredIds.has(s.symptomId)
    );
    // 目的: 同じsymptomIdの重複を除去する（複数疾患で共有される症状）
    const uniqueUnanswered = Array.from(
      new Map(unansweredSymptoms.map((s) => [s.symptomId, s])).values()
    );

    if (uniqueUnanswered.length === 0) {
      return NextResponse.json({ question: null });
    }

    // 目的: 現在の確率分布から上位10疾患を取得してAIに文脈を与える
    const topDiseases = Object.entries(probabilities)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id, prob]) => {
        const disease = DB.diseases.find((d) => d.id === id);
        return { id, name: disease?.name ?? id, probability: prob };
      });

    // 目的: 回答履歴を人間が読める形にまとめる
    const answerSummary = Object.entries(answers)
      .map(([symptomId, answer]) => {
        const symptom = ALL_SYMPTOMS.find((s) => s.symptomId === symptomId);
        const answerLabel =
          answer === "yes" ? "はい" : answer === "no" ? "いいえ" : "わからない";
        return `- ${symptom?.question ?? symptomId}: ${answerLabel}`;
      })
      .join("\n");

    // 目的: 未回答の症状リストをAIに渡す（最大30件に絞る）
    const candidateList = uniqueUnanswered
      .slice(0, 30)
      .map(
        (s) =>
          `symptomId: "${s.symptomId}" | 質問: "${s.question}" | 関連疾患: ${s.diseaseName} | 重要度: ${s.weight}`
      )
      .join("\n");

    const prompt = `あなたは症状チェッカーの質問選択AIです。ユーザーの回答履歴と現在の疾患確率分布を見て、次に聞くべき最適な質問を1つ選んでください。

## ユーザー情報
- 年齢: ${ageRange}
- 性別: ${gender === "male" ? "男性" : gender === "female" ? "女性" : "未指定"}

## これまでの回答
${answerSummary || "(まだ回答なし)"}

## 現在の疾患候補（確率上位）
${topDiseases.map((d) => `- ${d.name}: ${(d.probability * 100).toFixed(1)}%`).join("\n")}

## 未回答の質問候補
${candidateList}

## 選択基準
1. 現在の上位候補をさらに絞り込める質問を優先する
2. 「はい」でも「いいえ」でも情報が得られる質問が良い（片方の回答しか意味がない質問は避ける）
3. 似たような質問を連続で聞かない（回答済みの質問と被る内容は避ける）
4. ユーザーの年齢・性別に不自然な質問は避ける

## 出力形式
以下のJSON形式で**1つだけ**返してください。余計な説明は不要です。
\`\`\`json
{
  "symptomId": "選んだ症状のID",
  "reason": "この質問を選んだ理由（30字以内）"
}
\`\`\``;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // 目的: APIキーがない場合はフォールバックとしてエントロピーベースの選択に戻す
      return NextResponse.json({ question: null, fallbackToLocal: true });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text ?? "";

    // 目的: AIレスポンスからJSONを抽出する
    const jsonMatch = text.match(/\{[\s\S]*?"symptomId"\s*:\s*"([^"]+)"[\s\S]*?\}/);
    if (!jsonMatch || !jsonMatch[1]) {
      return NextResponse.json({ question: null, fallbackToLocal: true });
    }

    const selectedSymptomId = jsonMatch[1];

    // 目的: 選択された症状IDから質問情報を組み立てる
    const selectedSymptom = ALL_SYMPTOMS.find(
      (s) => s.symptomId === selectedSymptomId
    );
    if (!selectedSymptom) {
      return NextResponse.json({ question: null, fallbackToLocal: true });
    }

    // 目的: AIの選択理由をexplanationに組み込む
    const reasonMatch = text.match(/"reason"\s*:\s*"([^"]+)"/);
    const aiReason = reasonMatch?.[1] ?? "";
    const explanation = aiReason
      ? `${selectedSymptom.explanation}（AI判断: ${aiReason}）`
      : selectedSymptom.explanation;

    return NextResponse.json({
      question: {
        symptomId: selectedSymptom.symptomId,
        diseaseId: selectedSymptom.diseaseId,
        question: selectedSymptom.question,
        explanation,
      },
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    // 目的: API障害時はクライアント側のローカルロジックにフォールバック
    return NextResponse.json({ question: null, fallbackToLocal: true });
  }
}
