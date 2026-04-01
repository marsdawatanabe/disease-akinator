// 目的: ユーザーが緊急症状の有無を確認し、119へ誘導または質問フローへ進める画面
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
// diseases.jsonをstatic importで読み込む
import diseasesData from "@/data/diseases.json";
import type { EmergencyCheck } from "@/types";

// DBから緊急チェック項目を取得
const EMERGENCY_SYMPTOMS = diseasesData.emergencyChecks as EmergencyCheck[];

export default function EmergencyPage() {
  const router = useRouter();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // 目的: ユーザーがチェックボックスをトグルできる
  const toggleItem = (id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 1つでもチェックされていれば緊急状態と判定
  const hasEmergency = checkedItems.size > 0;

  // 目的: ユーザーが「該当なし」を押して質問画面へ遷移する
  const handleProceed = () => {
    router.push("/questions");
  };

  return (
    <main className="min-h-screen px-4 py-10 bg-[#FFF5F5]">
      <div className="w-full max-w-md mx-auto flex flex-col gap-6">
        {/* ヘッダー */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#BA1A1A] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <h1
              className="text-2xl font-extrabold text-[#BA1A1A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              まず緊急症状を確認
            </h1>
          </div>
          <p className="text-[#3E4947] text-sm pl-1">
            以下の症状に1つでも当てはまる場合は、すぐに119番へ電話してください。
          </p>
        </div>

        {/* チェックリスト（DBデータを使用） */}
        <Card className="bg-white">
          <CardContent>
            <div className="flex flex-col gap-1">
              {EMERGENCY_SYMPTOMS.map((symptom) => (
                <label
                  key={symptom.id}
                  className={`flex items-start gap-3 p-3 rounded-2xl cursor-pointer transition-colors ${
                    checkedItems.has(symptom.id)
                      ? "bg-[#FFF0F0]"
                      : "hover:bg-[#F2F4F6]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(symptom.id)}
                    onChange={() => toggleItem(symptom.id)}
                    className="w-5 h-5 mt-0.5 shrink-0 accent-[#BA1A1A] cursor-pointer"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={`text-sm font-medium leading-relaxed ${
                        checkedItems.has(symptom.id)
                          ? "text-[#BA1A1A]"
                          : "text-[#191C1E]"
                      }`}
                    >
                      {symptom.label}
                    </span>
                    {/* チェック時に詳細説明を表示 */}
                    {checkedItems.has(symptom.id) && (
                      <span className="text-xs text-[#BA1A1A]/80 leading-relaxed">
                        {symptom.description}
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 緊急状態の場合: 119誘導カード */}
        {hasEmergency && (
          <Card className="bg-[#BA1A1A]">
            <CardContent>
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                  <Phone className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-white font-extrabold text-xl">
                    今すぐ119に電話してください
                  </p>
                  <p className="text-white/80 text-sm mt-1">
                    緊急の可能性があります。救急車を呼んでください。
                  </p>
                </div>
                <a
                  href="tel:119"
                  className="flex items-center justify-center gap-2 w-full h-14 rounded-full bg-white text-[#BA1A1A] font-extrabold text-xl shadow-lg active:scale-95 transition-transform"
                  aria-label="119番に電話する"
                >
                  <Phone className="w-5 h-5" />
                  119 に電話する
                </a>
                <p className="text-white/60 text-xs">
                  ※ タップすると電話アプリが起動します
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 該当なし → 質問へ進む */}
        {!hasEmergency && (
          <Button
            onClick={handleProceed}
            className="w-full h-14 text-base font-bold"
          >
            <span className="flex items-center gap-2">
              上記の症状は該当なし
              <ChevronRight className="w-5 h-5" />
            </span>
          </Button>
        )}

        {/* 緊急状態でも「続行」できる脱出口 */}
        {hasEmergency && (
          <button
            onClick={handleProceed}
            className="text-center text-sm text-[#3E4947] underline underline-offset-2"
          >
            緊急ではないと思う → このまま質問を続ける
          </button>
        )}
      </div>
    </main>
  );
}
