// 目的: ユーザーが「はい/いいえ/わからない」で答えながらGemini AIが診断を進める質問画面
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
import type { SimpleState, ResultItem } from "@/types";

// localStorageのキー定数
const SESSION_KEY = "akinator_session";
const AKINATOR_STATE_KEY = "akinator_state";
const RESULTS_KEY = "akinator_results";

// Q&A最大数（プログレス表示用）
const MAX_QUESTIONS = 15;

// 目的: セッション情報（スタート画面が保存する形式）の型定義
interface SessionData {
  ageGroup: string;
  gender: string;
  startedAt: string;
}

// 目的: APIから返ってくる現在の質問情報の型定義
interface CurrentQuestion {
  question: string;
  explanation: string;
}

// 目的: 円形プログレスリングでユーザーに進捗状況を視覚的に伝える
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

  // 目的: Gemini全面移行後のシンプルな状態管理（ベイズ推論不使用）
  const [state, setState] = useState<SimpleState>({
    answers: [],
    questionCount: 0,
    questionHistory: [],
  });

  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

  // 目的: セッション属性をAPIに渡すために保持する
  const [sessionInfo, setSessionInfo] = useState<{ ageRange: string; gender: string } | null>(null);

  // 目的: Gemini APIを呼び出して次の質問または診断結果を取得する
  const fetchNextQuestion = useCallback(
    async (
      currentState: SimpleState,
      session: { ageRange: string; gender: string } | null
    ): Promise<{ type: "question"; question: string; explanation: string } | { type: "result"; results: ResultItem[] } | null> => {
      try {
        const res = await fetch("/api/next-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: currentState.answers,
            ageRange: session?.ageRange ?? "21-40",
            gender: session?.gender ?? "unspecified",
          }),
        });

        if (!res.ok) return null;

        const data = await res.json();

        if (data.type === "question" || data.type === "result") {
          return data;
        }
        return null;
      } catch {
        // API障害時はnullを返して呼び出し元でハンドリング
        return null;
      }
    },
    []
  );

  // 目的: localStorageからセッション・状態を復元または初期化してAPIで最初の質問を取得する
  useEffect(() => {
    const init = async () => {
      try {
        // セッション情報を読み取る
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) {
          router.push("/");
          return;
        }

        const parsed: SessionData = JSON.parse(raw);
        const session = { ageRange: parsed.ageGroup, gender: parsed.gender };
        setSessionInfo(session);

        // 途中離脱からの復帰: 保存済み状態があれば復元する
        const savedState = localStorage.getItem(AKINATOR_STATE_KEY);
        if (savedState) {
          const restored: SimpleState = JSON.parse(savedState);
          setState(restored);

          // 復元後は最後の質問をquestionHistoryから再表示する
          if (restored.questionHistory.length > 0) {
            const lastQ = restored.questionHistory[restored.questionHistory.length - 1];
            setCurrentQuestion(lastQ);
            setIsLoaded(true);
            return;
          }
        }

        // 初回: APIを呼んで最初の質問を取得する
        setIsLoadingQuestion(true);
        const initialState: SimpleState = { answers: [], questionCount: 0, questionHistory: [] };
        const response = await fetchNextQuestion(initialState, session);
        setIsLoadingQuestion(false);

        if (!response || response.type !== "question") {
          // 最初の質問が取得できない場合はスタートに戻す
          router.push("/");
          return;
        }

        setCurrentQuestion({ question: response.question, explanation: response.explanation });
      } catch {
        router.push("/");
        return;
      }

      setIsLoaded(true);
    };

    init();
  }, [router, fetchNextQuestion]);

  // 目的: 状態をlocalStorageに保存して途中離脱に備える
  const saveState = useCallback((newState: SimpleState) => {
    try {
      localStorage.setItem(AKINATOR_STATE_KEY, JSON.stringify(newState));
    } catch {
      // 保存失敗は無視して続行
    }
  }, []);

  // 目的: 診断結果をlocalStorageに保存して結果画面へ遷移する
  const navigateToResults = useCallback(
    (results: ResultItem[]) => {
      try {
        localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
        localStorage.removeItem(AKINATOR_STATE_KEY);
      } catch {
        // 保存失敗は無視
      }
      router.push("/results");
    },
    [router]
  );

  // 目的: ユーザーの回答をstateに追加してGemini APIで次の質問または診断結果を取得する
  const handleAnswer = useCallback(
    async (answer: "yes" | "no" | "unknown") => {
      if (!currentQuestion) return;

      // 目的: 回答をQ&A履歴に追記して新しい状態を作る
      const newAnswers = [
        ...state.answers,
        { question: currentQuestion.question, answer },
      ];
      const newQuestionHistory = [
        ...state.questionHistory,
        { question: currentQuestion.question, explanation: currentQuestion.explanation },
      ];
      const newState: SimpleState = {
        answers: newAnswers,
        questionCount: state.questionCount + 1,
        questionHistory: newQuestionHistory,
      };

      setState(newState);
      saveState(newState);

      // 目的: AI質問選択中のローディング表示を出してAPIを呼ぶ
      setIsLoadingQuestion(true);
      const response = await fetchNextQuestion(newState, sessionInfo);
      setIsLoadingQuestion(false);

      if (!response) {
        // API障害時はそのままローディングを外すだけ（操作可能な状態を維持）
        return;
      }

      if (response.type === "result") {
        // 目的: Geminiが診断十分と判断したら結果画面へ遷移する
        navigateToResults(response.results);
        return;
      }

      if (response.type === "question") {
        setCurrentQuestion({ question: response.question, explanation: response.explanation });
      }
    },
    [state, currentQuestion, sessionInfo, fetchNextQuestion, saveState, navigateToResults]
  );

  // 目的: ユーザーが前の質問に戻る（最初の質問なら緊急チェックへ遷移）
  const handleBack = useCallback(() => {
    // 履歴が空 = 最初の質問 → 緊急チェックへ戻る
    if (state.questionHistory.length === 0) {
      router.push("/emergency");
      return;
    }

    // 目的: 最後の回答と質問履歴をpopして前の状態に戻す
    const newAnswers = state.answers.slice(0, -1);
    const newQuestionHistory = state.questionHistory.slice(0, -1);
    const prevQuestion = state.questionHistory[state.questionHistory.length - 1];

    const restoredState: SimpleState = {
      answers: newAnswers,
      questionCount: state.questionCount - 1,
      questionHistory: newQuestionHistory,
    };

    setState(restoredState);
    saveState(restoredState);

    // 目的: 戻った先の質問を再表示する（APIを呼び直さずquestionHistoryを使う）
    setCurrentQuestion(prevQuestion);
  }, [state, router, saveState]);

  // ロード前はスピナーを表示
  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#005C55] border-t-transparent animate-spin" />
      </main>
    );
  }

  const progress = state.questionCount + 1;
  const total = MAX_QUESTIONS;

  // 回答済みインジケーター用（最大15ドット）
  const dots = Array.from({ length: total }, (_, i) => i);

  // 目的: 戻るボタンのラベルを現在の状態に応じて切り替える
  const isFirstQuestion = state.questionHistory.length === 0;
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
            {isLoadingQuestion ? (
              // 目的: AI質問選択中のローディング表示
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-6 h-6 rounded-full border-[3px] border-[#005C55] border-t-transparent animate-spin" />
                <p className="text-sm text-[#3E4947]">AIが次の質問を考えています…</p>
              </div>
            ) : currentQuestion ? (
              <>
                <h2
                  className="text-2xl font-extrabold text-[#191C1E] leading-snug mb-6"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {currentQuestion.question}
                </h2>

                {/* 「なぜこの質問？」アコーディオン（Geminiのexplanationを表示） */}
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
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* 回答ボタン */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => handleAnswer("yes")}
            variant="default"
            className="w-full h-14 text-base font-bold"
            disabled={isLoadingQuestion || !currentQuestion}
          >
            はい
          </Button>
          <Button
            onClick={() => handleAnswer("no")}
            variant="outline"
            className="w-full h-14 text-base font-bold"
            disabled={isLoadingQuestion || !currentQuestion}
          >
            いいえ
          </Button>
          <Button
            onClick={() => handleAnswer("unknown")}
            variant="secondary"
            className="w-full h-14 text-base font-bold text-[#3E4947]"
            disabled={isLoadingQuestion || !currentQuestion}
          >
            わからない
          </Button>
        </div>

        {/* 回答済みインジケーター */}
        <div className="flex justify-center gap-2 mt-2">
          {dots.map((i) => {
            const isAnswered = i < state.questionCount;
            const isCurrent = i === state.questionCount;
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
