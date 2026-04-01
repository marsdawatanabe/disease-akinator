// 目的: ユーザーが「はい/いいえ/わからない」で答えながらベイジアン推論で症状を絞り込める質問画面
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  createInitialState,
  updateProbabilities,
  selectNextQuestion,
  computeResults,
  shouldStop,
  serializeState,
  deserializeState,
  MAX_QUESTIONS,
  type BayesianState,
  type NextQuestion,
} from "@/lib/bayesian";
import type { Answer, AgeRange, Gender } from "@/types";
import diseasesData from "@/data/diseases.json";
import type { Disease } from "@/types";

// diseases.jsonの型アサーション（「前の質問に戻る」で使用）
const DISEASES_DB = (diseasesData as { diseases: Disease[] }).diseases;

// localStorageのキー定数
const SESSION_KEY = "akinator_session";
const BAYES_STATE_KEY = "akinator_bayes_state";
const RESULTS_KEY = "akinator_results";

// セッションデータの型定義（スタート画面が保存する形式）
interface SessionData {
  ageGroup: string;
  gender: string;
  startedAt: string;
}

// 円形プログレスリングコンポーネント
function CircularProgress({ value, total }: { value: number; total: number }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg
        className="w-24 h-24 -rotate-90"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {/* 背景の円 */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#E5E7EA"
          strokeWidth="8"
        />
        {/* 進捗の円 */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#005C55"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      {/* 中央テキスト */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-[#005C55]">{value}</span>
        <span className="text-xs text-[#3E4947]">/{total}</span>
      </div>
    </div>
  );
}

export default function QuestionsPage() {
  const router = useRouter();
  const [bayesState, setBayesState] = useState<BayesianState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<NextQuestion | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 目的: localStorageからセッション・ベイズ状態を復元または初期化する
  useEffect(() => {
    try {
      // ベイズ状態の復元を試みる（途中離脱→復帰対応）
      const savedBayes = localStorage.getItem(BAYES_STATE_KEY);
      if (savedBayes) {
        const restored = deserializeState(savedBayes);
        if (restored) {
          setBayesState(restored);
          setCurrentQuestion(selectNextQuestion(restored));
          setIsLoaded(true);
          return;
        }
      }

      // 新規: セッション情報（年齢・性別）を読み取って初期化
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        // セッションがない場合はスタート画面へ戻す
        router.push("/");
        return;
      }

      const session: SessionData = JSON.parse(raw);
      const ageRange = session.ageGroup as AgeRange;
      const gender =
        session.gender === "male"
          ? "male"
          : session.gender === "female"
          ? "female"
          : "other";

      const initialState = createInitialState(ageRange, gender as Gender);
      setBayesState(initialState);
      setCurrentQuestion(selectNextQuestion(initialState));
    } catch {
      // 復元失敗時はスタート画面へ
      router.push("/");
    }
    setIsLoaded(true);
  }, [router]);

  // 目的: ベイズ状態をlocalStorageに保存して途中離脱に備える
  const saveBayesState = useCallback((state: BayesianState) => {
    try {
      localStorage.setItem(BAYES_STATE_KEY, serializeState(state));
    } catch {
      // 保存失敗は無視して続行
    }
  }, []);

  // 目的: 結果画面に遷移する前に結果を計算してlocalStorageに保存する
  const navigateToResults = useCallback(
    (state: BayesianState) => {
      const results = computeResults(state);
      try {
        localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
        // ベイズ状態は結果確定後にクリア
        localStorage.removeItem(BAYES_STATE_KEY);
      } catch {
        // 保存失敗は無視
      }
      router.push("/results");
    },
    [router]
  );

  // 目的: ユーザーが回答を選択し、確率を更新して次の質問へ進む
  const handleAnswer = useCallback(
    (answer: Answer) => {
      if (!bayesState || !currentQuestion) return;

      // 回答前の確率をスナップショットとして履歴に追加
      const newProbabilitiesHistory = [
        ...bayesState.probabilitiesHistory,
        { ...bayesState.probabilities },
      ];

      // ベイズ更新
      const newProbs = updateProbabilities(
        bayesState.probabilities,
        currentQuestion.symptomId,
        currentQuestion.diseaseId,
        answer
      );

      const newState: BayesianState = {
        probabilities: newProbs,
        answers: {
          ...bayesState.answers,
          [currentQuestion.symptomId]: answer,
        },
        questionCount: bayesState.questionCount + 1,
        // 目的: 「前の質問に戻る」のために回答履歴を追記する
        answerHistory: [
          ...bayesState.answerHistory,
          { symptomId: currentQuestion.symptomId, answer },
        ],
        probabilitiesHistory: newProbabilitiesHistory,
      };

      // 収束判定
      if (shouldStop(newState)) {
        navigateToResults(newState);
        return;
      }

      // 未回答症状が尽きた場合も結果画面へ遷移する
      const nextQuestion = selectNextQuestion(newState);
      if (!nextQuestion) {
        navigateToResults(newState);
        return;
      }

      // 状態を保存して次の質問へ
      setBayesState(newState);
      saveBayesState(newState);
      setCurrentQuestion(nextQuestion);
    },
    [bayesState, currentQuestion, navigateToResults, saveBayesState]
  );

  // 目的: ユーザーが前の質問に戻る（最初の質問の場合は緊急チェックへ遷移）
  const handleBack = useCallback(() => {
    if (!bayesState) return;

    // 履歴が空 = 最初の質問 → 緊急チェックへ戻る
    if (bayesState.answerHistory.length === 0) {
      router.push("/emergency");
      return;
    }

    // 最後の回答をpopして前の状態を復元する
    const newHistory = [...bayesState.answerHistory];
    const lastEntry = newHistory.pop();
    if (!lastEntry) return;

    const newProbsHistory = [...bayesState.probabilitiesHistory];
    // probabilitiesHistoryの最後がこのステップ直前の確率スナップショット
    const restoredProbs = newProbsHistory.pop() ?? bayesState.probabilities;

    // answersからも最後の回答を削除
    const newAnswers = { ...bayesState.answers };
    delete newAnswers[lastEntry.symptomId];

    const restoredState: BayesianState = {
      probabilities: restoredProbs,
      answers: newAnswers,
      questionCount: bayesState.questionCount - 1,
      answerHistory: newHistory,
      probabilitiesHistory: newProbsHistory,
    };

    setBayesState(restoredState);
    saveBayesState(restoredState);

    // 戻った後の次の質問を再計算（popした症状IDの質問を復元する）
    // 目的: 元の質問を全疾患から検索して再表示する
    for (const disease of DISEASES_DB) {
      const symptom = disease.symptoms.find(
        (s) => s.id === lastEntry.symptomId
      );
      if (symptom) {
        setCurrentQuestion({
          symptomId: symptom.id,
          diseaseId: disease.id,
          question: symptom.question,
          explanation: symptom.explanation,
        });
        return;
      }
    }

    // 見つからない場合はselectNextQuestionにフォールバック
    setCurrentQuestion(selectNextQuestion(restoredState));
  }, [bayesState, router, saveBayesState]);

  // ロード前はスピナーを表示
  if (!isLoaded || !bayesState || !currentQuestion) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#005C55] border-t-transparent animate-spin" />
      </main>
    );
  }

  const progress = bayesState.questionCount + 1;
  const total = MAX_QUESTIONS;

  // 回答済みインジケーター用（最大15ドット）
  const dots = Array.from({ length: total }, (_, i) => i);

  // 目的: 戻るボタンのラベルを現在の状態に応じて切り替える
  const isFirstQuestion = bayesState.answerHistory.length === 0;
  const backButtonLabel = isFirstQuestion
    ? "← 緊急チェックに戻る"
    : "← 前の質問に戻る";

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="w-full max-w-md mx-auto flex flex-col gap-6">
        {/* 上部ナビゲーション */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-[#3E4947] text-sm font-medium hover:text-[#005C55] transition-colors"
            aria-label="前の画面に戻る"
          >
            <ChevronLeft className="w-5 h-5" />
            {backButtonLabel}
          </button>
        </div>

        {/* プログレスセクション */}
        <div className="flex flex-col items-center gap-3">
          <CircularProgress value={progress} total={total} />
          <p className="text-sm text-[#3E4947] font-medium">
            候補を絞り込んでいます…
          </p>
        </div>

        {/* 質問カード */}
        <Card>
          <CardContent>
            <p className="text-xs font-semibold text-[#005C55] uppercase tracking-wider mb-3">
              質問 {progress} / {total}
            </p>
            <h2
              className="text-2xl font-extrabold text-[#191C1E] leading-snug mb-6"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {currentQuestion.question}
            </h2>

            {/* 「なぜこの質問？」アコーディオン（DBのexplanationを表示） */}
            <Accordion type="single" collapsible>
              <AccordionItem value="reason">
                <AccordionTrigger className="text-[#005C55] text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4" />
                    なぜこの質問？
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-[#3E4947] text-sm leading-relaxed bg-[#F2F4F6] rounded-2xl p-4">
                    {currentQuestion.explanation}
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* 回答ボタン */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => handleAnswer("yes")}
            variant="default"
            className="w-full h-14 text-base font-bold"
          >
            はい
          </Button>
          <Button
            onClick={() => handleAnswer("no")}
            variant="outline"
            className="w-full h-14 text-base font-bold"
          >
            いいえ
          </Button>
          <Button
            onClick={() => handleAnswer("unknown")}
            variant="secondary"
            className="w-full h-14 text-base font-bold text-[#3E4947]"
          >
            わからない
          </Button>
        </div>

        {/* 回答済みインジケーター */}
        <div className="flex justify-center gap-2 mt-2">
          {dots.map((i) => {
            const isAnswered = i < bayesState.questionCount;
            const isCurrent = i === bayesState.questionCount;
            return (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  isCurrent
                    ? "bg-[#005C55]"
                    : isAnswered
                    ? "bg-[#0F766E]/50"
                    : "bg-[#E5E7EA]"
                }`}
                aria-label={`質問${i + 1}${isAnswered ? "（回答済み）" : ""}`}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
