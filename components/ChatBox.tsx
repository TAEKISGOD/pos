"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, Loader2, ChevronDown, Check, XCircle } from "lucide-react";

type ChatMode = "chat" | "recipe" | "sauce" | "inventory";

interface Action {
  description: string;
  actions: {
    type: string;
    params: Record<string, string | number>;
  }[];
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  action?: Action | null;
  actionStatus?: "pending" | "confirmed" | "rejected";
}

interface ChatBoxProps {
  storeId: string;
  userId: string;
}

const MODE_LABELS: Record<ChatMode, string> = {
  chat: "일반 채팅",
  recipe: "레시피 입력",
  sauce: "자체소스 레시피",
  inventory: "현재재고 수정",
};

const MODE_COLORS: Record<ChatMode, string> = {
  chat: "bg-muted/50",
  recipe: "bg-orange-50 dark:bg-orange-950/30",
  sauce: "bg-green-50 dark:bg-green-950/30",
  inventory: "bg-blue-50 dark:bg-blue-950/30",
};

const MODE_BADGE_COLORS: Record<ChatMode, string> = {
  chat: "bg-gray-200 text-gray-700",
  recipe: "bg-orange-200 text-orange-800",
  sauce: "bg-green-200 text-green-800",
  inventory: "bg-blue-200 text-blue-800",
};

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content: `안녕하세요! OnIS 도우미입니다.

아래 명령어로 모드를 전환할 수 있어요:

#레시피입력
→ 메뉴별 레시피를 자연어로 입력하면 자동 반영

#자체소스레시피입력
→ 자체소스 레시피를 자연어로 입력하면 자동 반영

#현재재고입력
→ 현재재고 탭의 제품 정보를 수정

#/
→ 일반 채팅 모드로 돌아오기

일반 채팅에서는 매장 데이터 조회나 질문이 가능합니다.`,
};

export function ChatBox({ storeId, userId }: ChatBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const addSystemMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: "system", content }]);
  };

  const handleModeSwitch = (newMode: ChatMode, command: string) => {
    setMode(newMode);
    setMessages((prev) => [...prev, { role: "user", content: command }]);

    if (newMode === "chat") {
      addSystemMessage("일반 채팅 모드로 전환되었습니다. 무엇이든 물어보세요!");
    } else if (newMode === "recipe") {
      addSystemMessage(
        "📝 레시피 입력 모드\n\n메뉴명과 재료를 입력하면 메뉴별 레시피 탭에 반영됩니다.\n\n예: \"김치찌개: 김치 150g, 돼지고기 100g, 두부 반모, 대파 30g\"\n\n일반 채팅으로 돌아가려면 #/ 를 입력하세요."
      );
    } else if (newMode === "sauce") {
      addSystemMessage(
        "🧪 자체소스 레시피 입력 모드\n\n소스명과 재료를 입력하면 자체소스 레시피 탭에 반영됩니다.\n\n예: \"양념소스: 간장 500, 설탕 200, 고춧가루 100\"\n\n일반 채팅으로 돌아가려면 #/ 를 입력하세요."
      );
    } else if (newMode === "inventory") {
      addSystemMessage(
        "📦 현재재고 수정 모드\n\n제품명과 변경할 값을 입력하면 현재재고 탭에 반영됩니다.\n\n예: \"김치 수량 5, 잔량 200\"\n예: \"대파 가격 3000으로 변경\"\n\n일반 채팅으로 돌아가려면 #/ 를 입력하세요."
      );
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // 모드 전환 명령어 체크
    if (trimmed === "#레시피입력") {
      setInput("");
      handleModeSwitch("recipe", trimmed);
      return;
    }
    if (trimmed === "#자체소스레시피입력") {
      setInput("");
      handleModeSwitch("sauce", trimmed);
      return;
    }
    if (trimmed === "#현재재고입력") {
      setInput("");
      handleModeSwitch("inventory", trimmed);
      return;
    }
    if (trimmed === "#/") {
      setInput("");
      handleModeSwitch("chat", trimmed);
      return;
    }

    if (trimmed.length > 500) {
      setMessages((prev) => [...prev, { role: "assistant", content: "메시지는 500자 이내로 입력해주세요." }]);
      return;
    }

    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 대화 히스토리 구성 (system 메시지 제외, 최근 10개까지)
      const history = [...messages, userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-10);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, storeId, userId, mode, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "오류가 발생했습니다." }]);
        return;
      }

      if (data.action?.actions?.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply,
            action: data.action,
            actionStatus: "pending",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "네트워크 오류가 발생했습니다." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg.action) return;

    setLoading(true);
    setSaving(true);

    try {
      const results: string[] = [];
      let allSuccess = true;

      for (const act of msg.action.actions) {
        const res = await fetch("/api/chat/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: act, storeId }),
        });

        const data = await res.json();
        if (data.success) {
          results.push(data.message);
        } else {
          results.push(data.error || "실패");
          allSuccess = false;
        }
      }

      setMessages((prev) =>
        prev.map((m, i) =>
          i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m
        )
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: allSuccess
            ? `✅ ${results.join("\n")}`
            : `⚠️ 일부 실패:\n${results.join("\n")}`,
        },
      ]);

      if (allSuccess) {
        window.dispatchEvent(new Event("onis-data-updated"));
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "실행 중 오류가 발생했습니다." }]);
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const handleRejectAction = (msgIndex: number) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex ? { ...m, actionStatus: "rejected" as const } : m
      )
    );
    setMessages((prev) => [...prev, { role: "assistant", content: "취소되었습니다." }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:shadow-xl transition-all hover:scale-105"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  const placeholders: Record<ChatMode, string> = {
    chat: "질문을 입력하세요...",
    recipe: "메뉴명: 재료 용량, 재료 용량...",
    sauce: "소스명: 재료 용량, 재료 용량...",
    inventory: "제품명 수량 5, 잔량 200...",
  };

  return (
    <>
    {/* 저장중 오버레이 */}
    {saving && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
        <div className="bg-background rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      </div>
    )}
    <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[520px] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${MODE_COLORS[mode]}`}>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">OnIS 도우미</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${MODE_BADGE_COLORS[mode]}`}>
            {MODE_LABELS[mode]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setIsOpen(false);
              setMode("chat");
              setMessages([WELCOME_MESSAGE]);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "system" ? (
              <div className="flex justify-center">
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap max-w-[90%]">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            )}

            {msg.action && msg.actionStatus === "pending" && (
              <div className="mt-2 ml-1 max-w-[90%]">
                {/* 미리보기 표 */}
                <div className="border rounded-md overflow-hidden text-xs mb-2">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/80">
                        {msg.action.actions[0]?.type === "update_menu_recipe" && (
                          <>
                            <th className="px-2 py-1.5 text-left font-medium">메뉴</th>
                            <th className="px-2 py-1.5 text-left font-medium">제품명</th>
                            <th className="px-2 py-1.5 text-right font-medium">사용량</th>
                            {msg.action.actions.some((a) => a.params.tolerancePercent) && (
                              <th className="px-2 py-1.5 text-right font-medium">오차%</th>
                            )}
                          </>
                        )}
                        {msg.action.actions[0]?.type === "update_product" && (
                          <>
                            <th className="px-2 py-1.5 text-left font-medium">제품명</th>
                            <th className="px-2 py-1.5 text-left font-medium">항목</th>
                            <th className="px-2 py-1.5 text-right font-medium">값</th>
                          </>
                        )}
                        {msg.action.actions[0]?.type === "update_menu_code" && (
                          <>
                            <th className="px-2 py-1.5 text-left font-medium">메뉴</th>
                            <th className="px-2 py-1.5 text-right font-medium">상품코드</th>
                          </>
                        )}
                        {msg.action.actions[0]?.type === "update_sauce_recipe" && (
                          <>
                            <th className="px-2 py-1.5 text-left font-medium">소스</th>
                            <th className="px-2 py-1.5 text-left font-medium">재료</th>
                            <th className="px-2 py-1.5 text-right font-medium">사용량</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {msg.action.actions.map((act, j) => (
                        <tr key={j} className={j % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                          {act.type === "update_menu_recipe" && (
                            <>
                              <td className="px-2 py-1">{act.params.menuName}</td>
                              <td className="px-2 py-1">{act.params.productName}</td>
                              <td className="px-2 py-1 text-right font-mono">{act.params.amount}</td>
                              {msg.action!.actions.some((a) => a.params.tolerancePercent) && (
                                <td className="px-2 py-1 text-right font-mono">
                                  {act.params.tolerancePercent || "-"}
                                </td>
                              )}
                            </>
                          )}
                          {act.type === "update_product" && (
                            <>
                              <td className="px-2 py-1">{act.params.productName}</td>
                              <td className="px-2 py-1">
                                {{ name: "제품명", unit: "단위", price: "가격" }[String(act.params.field)] || act.params.field}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">{act.params.value}</td>
                            </>
                          )}
                          {act.type === "update_menu_code" && (
                            <>
                              <td className="px-2 py-1">{act.params.menuName}</td>
                              <td className="px-2 py-1 text-right font-mono">{act.params.productCode}</td>
                            </>
                          )}
                          {act.type === "update_sauce_recipe" && (
                            <>
                              <td className="px-2 py-1">{act.params.sauceName}</td>
                              <td className="px-2 py-1">{act.params.ingredientName}</td>
                              <td className="px-2 py-1 text-right font-mono">{act.params.amount}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* 확인/취소 버튼 */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleConfirmAction(i)}
                    disabled={loading}
                  >
                    <Check className="h-3 w-3" />
                    확인
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleRejectAction(i)}
                    disabled={loading}
                  >
                    <XCircle className="h-3 w-3" />
                  취소
                </Button>
                </div>
              </div>
            )}
            {msg.action && msg.actionStatus === "confirmed" && (
              <div className="text-xs text-muted-foreground mt-1 ml-1">적용 완료</div>
            )}
            {msg.action && msg.actionStatus === "rejected" && (
              <div className="text-xs text-muted-foreground mt-1 ml-1">취소됨</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[mode]}
            rows={2}
            maxLength={500}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-between mt-1">
          <div className="text-[10px] text-muted-foreground">
            #레시피입력 · #자체소스레시피입력 · #현재재고입력 · #/
          </div>
          <div className="text-xs text-muted-foreground">
            {input.length}/500
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
