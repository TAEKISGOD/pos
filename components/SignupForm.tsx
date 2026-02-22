"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { error: storeError } = await supabase.from("stores").insert({
        user_id: authData.user.id,
        name: storeName,
      });

      if (storeError) {
        setError("가게 정보 생성에 실패했습니다.");
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center">
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-lg shadow-black/5 border border-gray-100 p-8">
          <div className="text-center mb-8">
            <h1 className="font-serif text-3xl font-bold tracking-tight" style={{ color: "#3a7d1e" }}>
              OnIS
            </h1>
            <p className="text-sm text-gray-500 mt-1">프라이빗 재고 관리 시스템</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">가게 이름</Label>
              <Input
                id="storeName"
                type="text"
                placeholder="가게 이름"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                lang="ko"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="6자 이상"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11 rounded-lg"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full h-11 rounded-lg text-white font-medium"
              style={{ backgroundColor: "#3a7d1e" }}
              disabled={loading}
            >
              {loading ? "가입 중..." : "회원가입"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-medium hover:underline" style={{ color: "#3a7d1e" }}>
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
