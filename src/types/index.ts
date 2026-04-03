// 目的: アプリ全体で使用する型定義を一元管理する

// 疾患データの症状
export interface Symptom {
  id: string;
  question: string;
  weight: number;
  explanation: string;
}

// 疾患データ
export interface Disease {
  id: string;
  name: string;
  department: string;
  description: string;
  baseProbability: { male: number; female: number };
  ageModifier: Record<string, number>;
  symptoms: Symptom[];
}

// 緊急チェック項目
export interface EmergencyCheck {
  id: string;
  label: string;
  description: string;
  action: string;
}

// diseases.jsonのルート構造
export interface DiseaseDB {
  diseases: Disease[];
  emergencyChecks: EmergencyCheck[];
}

// 回答の型
export type Answer = "yes" | "no" | "unknown";

// 性別の型
export type Gender = "male" | "female" | "other";

// 年齢レンジの型
export type AgeRange = "0-10" | "11-20" | "21-40" | "41-60" | "61+";

// 目的: Gemini API全面移行後の質問画面状態型（ベイズ推論の代替）
export interface SimpleState {
  // Q&A履歴（APIに毎回渡す）
  answers: Array<{ question: string; answer: "yes" | "no" | "unknown" }>;
  // 回答済み質問数
  questionCount: number;
  // 「前の質問に戻る」用に質問文とexplanationを保持する
  questionHistory: Array<{ question: string; explanation: string }>;
}

// 結果の各候補アイテム
export interface ResultItem {
  diseaseId?: string;
  name: string;
  department: string;
  description: string;
  relevance: number; // 0-100%
  matchedSymptoms: string[]; // 「はい」と答えた症状の質問文リスト
}
