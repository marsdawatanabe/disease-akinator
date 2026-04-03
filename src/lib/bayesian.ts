// 目的: ユーザーの回答からベイズ推論で疾患の確率を更新し、最適な次の質問と結果を返す

import diseasesData from "@/data/diseases.json";
import type { Disease, Answer, AgeRange, Gender, ResultItem } from "@/types";

// diseases.jsonの型アサーション
const DB = diseasesData as { diseases: Disease[]; emergencyChecks: unknown[] };

// ベイジアンエンジンの状態
export interface BayesianState {
  // 各疾患IDに対する現在の確率（正規化済み 0〜1）
  probabilities: Record<string, number>;
  // 回答済みの症状ID → 回答内容
  answers: Record<string, Answer>;
  // 回答した質問数
  questionCount: number;
  // 目的: 「前の質問に戻る」機能のために回答履歴を保持する
  answerHistory: Array<{ symptomId: string; answer: Answer }>;
  // 目的: 「前の質問に戻る」機能のために各ステップの確率スナップショットを保持する
  probabilitiesHistory: Array<Record<string, number>>;
}

// 次の質問情報
export interface NextQuestion {
  symptomId: string;
  diseaseId: string;
  question: string;
  explanation: string;
}

// 最大質問数
const MAX_QUESTIONS = 15;

// 収束判定: トップ候補の確率がこの閾値以上になれば終了
const CONVERGENCE_THRESHOLD = 0.75;

// 目的: 最低限この回数の質問に回答するまで収束判定をスキップする（早期終了防止）
const MIN_QUESTIONS_BEFORE_CONVERGENCE = 3;

// 目的: 確率が0にならないようにする最小値（0除算防止）
const MIN_PROBABILITY = 0.001;

/**
 * 目的: 年齢・性別から全疾患の初期事前確率を計算する
 */
export function initializeProbabilities(
  ageRange: AgeRange,
  gender: Gender
): Record<string, number> {
  const probs: Record<string, number> = {};

  for (const disease of DB.diseases) {
    // 性別に基づく基礎確率（other は male/female の平均を使用）
    let base: number;
    if (gender === "male") {
      base = disease.baseProbability.male;
    } else if (gender === "female") {
      base = disease.baseProbability.female;
    } else {
      base = (disease.baseProbability.male + disease.baseProbability.female) / 2;
    }

    // 年齢修正係数を乗算（ageModifierにないキーは1.0とする）
    const modifier = disease.ageModifier[ageRange] ?? 1.0;
    // 最小値クランプで0除算を防止
    probs[disease.id] = Math.max(MIN_PROBABILITY, base * modifier);
  }

  // 正規化して確率の合計を1にする
  return normalizeProbabilities(probs);
}

/**
 * 目的: 初期状態を生成する（履歴フィールドを含む）
 */
export function createInitialState(
  ageRange: AgeRange,
  gender: Gender
): BayesianState {
  return {
    probabilities: initializeProbabilities(ageRange, gender),
    answers: {},
    questionCount: 0,
    answerHistory: [],
    probabilitiesHistory: [],
  };
}

/**
 * 目的: 確率マップを正規化する（合計を1にする）。NaN/0除算のガード付き
 */
function normalizeProbabilities(
  probs: Record<string, number>
): Record<string, number> {
  const normalized: Record<string, number> = {};

  // NaNガード: NaNを最小値に置換
  for (const [id, p] of Object.entries(probs)) {
    normalized[id] = isNaN(p) || p < 0 ? MIN_PROBABILITY : p;
  }

  const total = Object.values(normalized).reduce((sum, p) => sum + p, 0);
  if (total === 0 || isNaN(total)) return normalized;

  for (const id of Object.keys(normalized)) {
    normalized[id] = normalized[id] / total;
  }
  return normalized;
}

/**
 * 目的: 回答1件に基づいて尤度比ベースのベイズ更新を行い、新しい確率マップを返す
 *
 * 尤度比ベースのベイズ更新:
 *   ポイント: 「はい」で確率が上がり、「いいえ」で確率が下がる必要がある
 *
 *   その症状を持つ疾患（weightが定義されている）:
 *     「はい」→ P(D) × (1 + weight × 1.5)  ← 1を超える係数で確率を上げる（緩やかに）
 *     「いいえ」→ P(D) × (1 - weight × 0.5) ← 1未満の係数で確率を下げる（完全排除は避ける）
 *   その症状を持たない疾患:
 *     「はい」→ P(D) × 0.6  ← その疾患にない症状がある = 下げる（穏やかに）
 *     「いいえ」→ P(D) × 1.0  ← 変化なし（持っていない症状がないのは中立）
 *   「わからない」→ 確率を変更しない
 */
export function updateProbabilities(
  currentProbs: Record<string, number>,
  symptomId: string,
  _diseaseId: string,
  answer: Answer
): Record<string, number> {
  if (answer === "unknown") {
    return currentProbs;
  }

  const updated: Record<string, number> = { ...currentProbs };

  for (const disease of DB.diseases) {
    const symptom = disease.symptoms.find((s) => s.id === symptomId);
    const currentP = currentProbs[disease.id] ?? MIN_PROBABILITY;

    if (symptom) {
      // 目的: 症状を持つ疾患の確率を回答に応じて増減する
      if (answer === "yes") {
        // 「はい」→ 尤度比で確率を上げる（1 + weight×1.5 なので weight=0.5 で 1.75倍、weight=1.0 で 2.5倍）
        updated[disease.id] = currentP * (1 + symptom.weight * 1.5);
      } else {
        // 「いいえ」→ 症状がないので確率を下げる（weight=1.0 で 0.5倍、weight=0.3 で 0.85倍）
        updated[disease.id] = currentP * Math.max(0.1, 1 - symptom.weight * 0.5);
      }
    } else {
      // 目的: 該当症状を持たない疾患の確率を調整する
      if (answer === "yes") {
        // 「はい」→ この疾患にない症状をユーザーが持っている = この疾患の可能性を下げる（穏やかに）
        updated[disease.id] = currentP * 0.6;
      } else {
        // 「いいえ」→ この疾患にない症状がない = 中立（変化なし）
        updated[disease.id] = currentP;
      }
    }
  }

  return normalizeProbabilities(updated);
}

/**
 * 目的: 情報エントロピー計算のヘルパー関数
 * H = -Σ p_i × log2(p_i)
 */
function calculateEntropy(probs: Record<string, number>): number {
  let entropy = 0;
  for (const p of Object.values(probs)) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * 目的: 症状の事前出現確率を計算する（現在の確率分布に基づく加重平均）
 * P(symptom=yes) = Σ P(disease) × disease.has_symptom × weight
 */
function estimateSymptomProbability(
  probs: Record<string, number>,
  symptomId: string
): number {
  let pYes = 0;
  for (const disease of DB.diseases) {
    const symptom = disease.symptoms.find((s) => s.id === symptomId);
    if (symptom) {
      pYes += (probs[disease.id] ?? 0) * symptom.weight;
    }
  }
  // 最小0.05、最大0.95にクランプ
  return Math.max(0.05, Math.min(0.95, pYes));
}

/**
 * 目的: 全疾患のエントロピー変化に基づく情報利得最大化により、次に聞くべき最適な症状質問を選ぶ
 *
 * 各未回答の症状について「はい時」と「いいえ時」の確率分布のエントロピーを計算し
 * 情報利得 = 現在のH - P(yes)×H(yes) - P(no)×H(no) が最大の質問を選ぶ
 * P(yes)/P(no)は症状の出現確率から動的に計算（50/50固定ではない）
 */
export function selectNextQuestion(
  state: BayesianState
): NextQuestion | null {
  const currentEntropy = calculateEntropy(state.probabilities);

  let bestScore = -Infinity;
  let bestQuestion: NextQuestion | null = null;
  const processedSymptomIds = new Set<string>();

  for (const disease of DB.diseases) {
    for (const symptom of disease.symptoms) {
      if (state.answers[symptom.id] !== undefined) continue;
      if (processedSymptomIds.has(symptom.id)) continue;
      processedSymptomIds.add(symptom.id);

      // 目的: この症状の事前出現確率を現在の疾患分布から推定する
      const pYes = estimateSymptomProbability(state.probabilities, symptom.id);
      const pNo = 1 - pYes;

      const probsIfYes = updateProbabilities(
        state.probabilities,
        symptom.id,
        disease.id,
        "yes"
      );
      const probsIfNo = updateProbabilities(
        state.probabilities,
        symptom.id,
        disease.id,
        "no"
      );

      const entropyIfYes = calculateEntropy(probsIfYes);
      const entropyIfNo = calculateEntropy(probsIfNo);

      // 目的: 症状出現確率で加重した期待情報利得を計算する
      const infoGain = currentEntropy - pYes * entropyIfYes - pNo * entropyIfNo;

      if (infoGain > bestScore) {
        bestScore = infoGain;
        bestQuestion = {
          symptomId: symptom.id,
          diseaseId: disease.id,
          question: symptom.question,
          explanation: symptom.explanation,
        };
      }
    }
  }

  return bestQuestion;
}

/**
 * 目的: 現在の確率分布から上位5件の結果を生成する（回答品質チェック付き）
 *
 * 「はい」「いいえ」の回答が合計3件未満の場合はfallbackフラグをつける
 */
export function computeResults(
  state: BayesianState
): (ResultItem & { fallback?: boolean })[] {
  // 回答品質チェック: 「はい」「いいえ」の有効回答数を数える
  const effectiveAnswerCount = Object.values(state.answers).filter(
    (a) => a === "yes" || a === "no"
  ).length;
  const isFallback = effectiveAnswerCount < 3;

  // 確率降順でソート
  const sorted = Object.entries(state.probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // 最高確率を取得してパーセンテージ正規化に使う
  const topProb = sorted[0]?.[1] ?? 1;

  return sorted.map(([diseaseId, prob]) => {
    const disease = DB.diseases.find((d) => d.id === diseaseId);
    if (!disease) {
      return {
        diseaseId,
        name: diseaseId,
        department: "不明",
        description: "",
        relevance: Math.round((prob / topProb) * 100),
        matchedSymptoms: [],
        fallback: isFallback,
      };
    }

    // 「はい」と答えた症状のうち、この疾患が持つものを列挙
    const matchedSymptoms: string[] = [];
    for (const [symptomId, answer] of Object.entries(state.answers)) {
      if (answer === "yes") {
        const symptom = disease.symptoms.find((s) => s.id === symptomId);
        if (symptom) {
          matchedSymptoms.push(symptom.question);
        }
      }
    }

    // 関連度: 上位疾患を基準に相対スコアを計算（最低5%、最大85%に制限して誤解を防ぐ）
    const relativeScore = Math.min(85, Math.max(5, Math.round((prob / topProb) * 85)));

    return {
      diseaseId: disease.id,
      name: disease.name,
      department: disease.department,
      description: disease.description,
      relevance: relativeScore,
      matchedSymptoms,
      fallback: isFallback,
    };
  });
}

/**
 * 目的: 収束判定を行う（診断終了すべきかを返す）
 */
export function shouldStop(state: BayesianState): boolean {
  // 質問数が上限に達した
  if (state.questionCount >= MAX_QUESTIONS) return true;

  // 目的: 最低質問数に達するまでは収束判定をスキップして早期終了を防ぐ
  if (state.questionCount < MIN_QUESTIONS_BEFORE_CONVERGENCE) return false;

  // トップ候補の確率が収束閾値を超えた
  const topProb = Math.max(...Object.values(state.probabilities));
  if (topProb >= CONVERGENCE_THRESHOLD) return true;

  return false;
}

/**
 * 目的: BayesianStateをlocalStorageに保存するためのシリアライズ用変換
 */
export function serializeState(state: BayesianState): string {
  return JSON.stringify(state);
}

/**
 * 目的: localStorageからBayesianStateを復元する（旧フォーマット互換対応）
 */
export function deserializeState(raw: string): BayesianState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BayesianState>;
    // 旧フォーマット（履歴フィールドなし）への後方互換対応
    return {
      probabilities: parsed.probabilities ?? {},
      answers: parsed.answers ?? {},
      questionCount: parsed.questionCount ?? 0,
      answerHistory: parsed.answerHistory ?? [],
      probabilitiesHistory: parsed.probabilitiesHistory ?? [],
    };
  } catch {
    return null;
  }
}

// MAX_QUESTIONS を外部から参照できるようにエクスポート
export { MAX_QUESTIONS };
