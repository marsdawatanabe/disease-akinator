// 目的: ユーザーが診断結果（受診科・疾患候補）を確認して次のアクションを取れる結果画面
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  ChevronRight,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ResultItem } from "@/types";

// localStorageのキー定数
const SESSION_KEY = "akinator_session";
const AKINATOR_STATE_KEY = "akinator_state";
const RESULTS_KEY = "akinator_results";

// 関連度バーコンポーネント
function RelevanceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-[#F2F4F6] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#005C55] to-[#0F766E] rounded-full transition-all duration-700"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-sm font-bold text-[#005C55] w-10 text-right">
        {value}%
      </span>
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);
  // 目的: Geminiが返した診断結果候補リストを保持する
  const [results, setResults] = useState<ResultItem[]>([]);
  // 目的: Q&A回答数を保持してフォールバック判定に使う
  const [answerCount, setAnswerCount] = useState(0);

  // 目的: ページロード時にlocalStorageから結果とQ&A数を読み込む
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESULTS_KEY);
      if (raw) {
        const parsed: ResultItem[] = JSON.parse(raw);
        setResults(parsed);
      } else {
        // 結果がない場合はスタート画面へ戻す
        router.push("/");
        return;
      }

      // 目的: akinator_stateが残っていればanswers数を取得してフォールバック判定に使う
      const stateRaw = localStorage.getItem(AKINATOR_STATE_KEY);
      if (stateRaw) {
        const stateData = JSON.parse(stateRaw);
        setAnswerCount(stateData?.answers?.length ?? 0);
      }
    } catch {
      router.push("/");
      return;
    }
    setIsLoaded(true);
  }, [router]);

  // 目的: ユーザーがやり直しボタンでセッションをリセットしてスタート画面へ戻る
  const handleRestart = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(AKINATOR_STATE_KEY);
      localStorage.removeItem(RESULTS_KEY);
    } catch {
      // localStorageが使えない環境では無視
    }
    router.push("/");
  };

  if (!isLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#005C55] border-t-transparent animate-spin" />
      </main>
    );
  }

  // 上位1件から受診科を取得
  const topResult = results[0];
  const recommendedDepartment = topResult?.department ?? "内科";

  // 目的: 回答が少ない場合（2問以下）にフォールバックメッセージを表示する
  const isFallback = answerCount <= 2;

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="w-full max-w-md mx-auto flex flex-col gap-6">
        {/* ヒーローカード: 受診科提示（上位1件の受診科を表示） */}
        <div
          className="rounded-3xl p-8 flex flex-col items-center text-center gap-4"
          style={{
            background: "linear-gradient(135deg, #005C55 0%, #0F766E 100%)",
          }}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">
              まず受診すべき科
            </p>
            <h1
              className="text-3xl font-extrabold text-white"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {recommendedDepartment}
            </h1>
          </div>
          <p className="text-white/80 text-sm max-w-xs">
            入力した症状をもとに分析しました。以下の疾患が候補として挙がっています。
          </p>
          {/* 目的: 相対スコアの意味をユーザーに正確に伝える免責テキスト */}
          <p className="text-white/50 text-xs">
            ※関連度はあなたの回答に基づく相対的な指標です
          </p>
        </div>

        {/* 目的: 免責事項を赤字で目立たせてユーザーに医師受診を促す */}
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <p className="text-sm font-bold text-red-600 leading-relaxed">
              この結果はあくまで目安です。必ず医師に相談してください。
            </p>
          </div>
        </div>

        {/* 目的: 有効回答が不足している場合にフォールバックメッセージを表示する */}
        {isFallback && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm text-amber-800 leading-relaxed">
              お答えいただいた情報では十分な判断ができませんでした。まず内科（かかりつけ医）を受診してください。
            </p>
          </div>
        )}

        {/* 疾患候補セクション（上位3〜5件を表示） */}
        <div className="flex flex-col gap-3">
          <h2
            className="text-lg font-bold text-[#191C1E] px-1"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            疾患候補
          </h2>

          {results.map((candidate, index) => (
            <Card key={candidate.diseaseId ?? candidate.name} className="bg-white">
              <CardContent>
                {/* 疾患名と関連度 */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    {/* 順位バッジ */}
                    <span className="w-6 h-6 rounded-full bg-[#005C55] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <h3 className="font-bold text-[#191C1E]">
                      {candidate.name}
                    </h3>
                  </div>
                  <span className="text-xs text-[#3E4947] bg-[#F2F4F6] px-2 py-1 rounded-full shrink-0">
                    {candidate.department}
                  </span>
                </div>

                {/* 関連度バー */}
                <RelevanceBar value={candidate.relevance} />

                {/* アコーディオン: 詳細展開 */}
                <Accordion type="single" collapsible className="mt-3">
                  <AccordionItem value="detail">
                    <AccordionTrigger className="text-[#005C55] text-sm font-medium py-2">
                      <span className="flex items-center gap-2">
                        <ChevronRight className="w-4 h-4" />
                        詳細を見る
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-3 mt-1">
                        {/* 疾患の概要説明 */}
                        <p className="text-sm text-[#3E4947] leading-relaxed">
                          {candidate.description}
                        </p>

                        {/* 回答との関連: 「はい」と答えた症状のうちこの疾患に該当するもの */}
                        {candidate.matchedSymptoms.length > 0 && (
                          <div className="bg-[#F2F4F6] rounded-2xl p-4">
                            <p className="text-xs font-bold text-[#191C1E] mb-2">
                              あなたの回答との一致
                            </p>
                            <ul className="flex flex-col gap-1">
                              {candidate.matchedSymptoms.map((symptom) => (
                                <li
                                  key={symptom}
                                  className="flex items-start gap-2 text-sm text-[#3E4947]"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#005C55] shrink-0 mt-1.5" />
                                  {symptom}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 一致症状がない場合 */}
                        {candidate.matchedSymptoms.length === 0 && (
                          <div className="bg-[#F2F4F6] rounded-2xl p-4">
                            <p className="text-xs text-[#3E4947]">
                              直接一致した症状はありませんが、全体の症状パターンから候補に挙がっています。
                            </p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 免責警告カード */}
        <Alert variant="warning">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            重要な注意事項
          </AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              このアプリが提供する情報は<strong>医療診断ではありません</strong>
              。あくまで参考情報として受診の際の参考にしてください。
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              <li>・ 正確な診断は必ず医師が行います</li>
              <li>・ 症状が重い場合は迷わず受診してください</li>
              <li>・ 緊急の場合は119番または救急外来へ</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* やり直しボタン: localStorageを全クリアしてスタートへ */}
        <Button
          onClick={handleRestart}
          variant="outline"
          className="w-full h-14 text-base font-bold"
        >
          <span className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            もう一度やり直す
          </span>
        </Button>

        {/* フッター免責 */}
        <p className="text-center text-xs text-[#3E4947] px-4 pb-4">
          © 病気アキネーター — 医療診断ツールではありません
        </p>
      </div>
    </main>
  );
}
