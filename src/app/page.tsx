// 目的: ユーザーが年齢・性別を入力して診断を開始できるスタート画面
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// 年齢グループの選択肢
const AGE_GROUPS = [
  { value: "0-10", label: "0〜10歳" },
  { value: "11-20", label: "11〜20歳" },
  { value: "21-40", label: "21〜40歳" },
  { value: "41-60", label: "41〜60歳" },
  { value: "61+", label: "61歳以上" },
];

// 性別の選択肢
const GENDERS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "unspecified", label: "回答しない" },
];

export default function StartPage() {
  const router = useRouter();
  const [selectedAge, setSelectedAge] = useState<string>("");
  const [selectedGender, setSelectedGender] = useState<string>("");

  // 目的: ユーザーが「はじめる」を押したとき、入力値をlocalStorageに保存して緊急チェック画面へ遷移する
  const handleStart = () => {
    if (!selectedAge || !selectedGender) return;

    // セッション情報をlocalStorageに保存
    localStorage.setItem(
      "akinator_session",
      JSON.stringify({
        ageGroup: selectedAge,
        gender: selectedGender,
        startedAt: new Date().toISOString(),
        answers: [],
      })
    );

    router.push("/emergency");
  };

  const isReady = selectedAge && selectedGender;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* ヘッダーセクション */}
        <div className="flex flex-col items-center gap-4 text-center">
          {/* 聴診器アイコン */}
          <div className="w-20 h-20 rounded-full bg-[#005C55] flex items-center justify-center shadow-lg">
            <Stethoscope className="w-10 h-10 text-white" />
          </div>

          {/* タイトル */}
          <div>
            <h1
              className="text-4xl font-extrabold text-[#191C1E] tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              病気アキネーター
            </h1>
            <p className="mt-2 text-[#3E4947] text-base">
              質問に答えるだけで考えられる病気を絞り込みます
            </p>
          </div>
        </div>

        {/* 説明カード */}
        <Card className="bg-[#F2F4F6]">
          <CardContent>
            <ul className="flex flex-col gap-3 text-[#3E4947] text-sm">
              <li className="flex items-start gap-3">
                <span className="text-[#005C55] font-bold mt-0.5">✓</span>
                <span>「はい・いいえ・わからない」で答えるだけ</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#005C55] font-bold mt-0.5">✓</span>
                <span>聞き漏らしがちな症状も丁寧に確認します</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[#005C55] font-bold mt-0.5">✓</span>
                <span>受診すべき科をガイドします</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* 年齢セレクター */}
        <Card>
          <CardContent>
            <p className="font-semibold text-[#191C1E] mb-3">年齢グループ</p>
            <div className="flex flex-wrap gap-2">
              {AGE_GROUPS.map((age) => (
                <button
                  key={age.value}
                  onClick={() => setSelectedAge(age.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedAge === age.value
                      ? "bg-[#005C55] text-white"
                      : "bg-[#F2F4F6] text-[#3E4947] hover:bg-[#E5E7EA]"
                  }`}
                  aria-pressed={selectedAge === age.value}
                >
                  {age.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 性別セレクター */}
        <Card>
          <CardContent>
            <p className="font-semibold text-[#191C1E] mb-3">性別</p>
            <div className="flex flex-col gap-3">
              {GENDERS.map((gender) => (
                <label
                  key={gender.value}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="gender"
                    value={gender.value}
                    checked={selectedGender === gender.value}
                    onChange={() => setSelectedGender(gender.value)}
                    className="w-5 h-5 accent-[#005C55]"
                  />
                  <span className="text-[#191C1E] font-medium">
                    {gender.label}
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 開始ボタン */}
        <Button
          onClick={handleStart}
          disabled={!isReady}
          className="w-full h-14 text-base font-bold"
          size="default"
        >
          はじめる →
        </Button>

        {/* 目的: 免責事項を赤字で目立たせてユーザーに医師受診を促す */}
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <p className="text-sm font-bold text-red-600 leading-relaxed">
              この結果はあくまで目安です。必ず医師に相談してください。
              緊急の場合は119番または救急外来を受診してください。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
