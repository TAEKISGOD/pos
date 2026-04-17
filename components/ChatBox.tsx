"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, Loader2, ChevronDown, Check, XCircle, Copy, AlertTriangle } from "lucide-react";
import { useDateContext } from "@/lib/date-context";
import { Resizable } from "re-resizable";
import { FuzzyMatchReview, FuzzyResult, ResolvedItem, FuzzyContext, FuzzyMode } from "@/components/FuzzyMatchReview";

type ChatMode = "chat" | "recipe" | "inventory";

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
  fuzzyResults?: FuzzyResult[] | null;
  fuzzyCategories?: { id: string; name: string }[] | null;
  fuzzyProducts?: { id: string; name: string; unit: string; categoryId: string; categoryName: string }[] | null;
  fuzzyContext?: FuzzyContext | null;
  fuzzyMode?: FuzzyMode;
  fuzzyStatus?: "pending" | "confirmed" | "rejected";
  isError?: boolean;
  errorType?: string;
  errorDetails?: { failedItem?: string; suggestion?: string; availableOptions?: string[] };
  isHint?: boolean; // 모드 전환 힌트 (localStorage 저장 제외)
}

// 다중 메뉴 데이터 타입
interface MenuFuzzyData {
  menuName: string;
  recipeType: "menu" | "sauce";
  glassware?: string | null;
  garnish?: string | null;
  note?: string | null;
  results: FuzzyResult[];
  context: FuzzyContext;
  categories: { id: string; name: string }[];
  products: { id: string; name: string; unit: string; categoryId: string; categoryName: string }[];
}

interface ChatBoxProps {
  storeId: string;
  userId: string;
}

const MODE_LABELS: Record<ChatMode, string> = {
  chat: "일반채팅",
  recipe: "레시피입력",
  inventory: "현재재고입력",
};

const MODE_ICONS: Record<ChatMode, string> = {
  chat: "💬",
  recipe: "📝",
  inventory: "📦",
};

const MODE_COLORS: Record<ChatMode, string> = {
  chat: "bg-muted/50",
  recipe: "bg-orange-50 dark:bg-orange-950/30",
  inventory: "bg-blue-50 dark:bg-blue-950/30",
};

const MODE_HINTS: Record<ChatMode, string> = {
  chat: "💬 일반채팅 모드입니다.\n매장 데이터에 대해 무엇이든 물어보세요.",
  recipe: "📝 레시피입력 모드입니다.\n@메뉴명 으로 시작하면 여러 메뉴를 한 번에 등록할 수 있어요.",
  inventory: "📦 현재재고입력 모드입니다.\n\"제품명 잔량 숫자\" 형식으로 입력하세요.",
};

const WELCOME_CONTENT = `안녕하세요! OnIS 도우미입니다.

모드: [💬 일반채팅] [📝 레시피입력] [📦 현재재고입력]
탭 클릭 또는 # 명령어로 전환됩니다.

━━━━━━━━━━━━━━━━━━
📝 레시피입력 (#레시피입력)
   @메뉴명 으로 시작 → 재료 나열
   여러 메뉴도 한 번에 가능합니다.

   예) @잭콕
       잭다니얼 30
       펩시라임제로 120

📦 현재재고입력 (#현재재고입력)
   제품 잔량·가격·단위 수정

   예) 올리브유 잔량 250
       진간장 가격 8000으로 변경

💬 일반채팅 (#/)
   등록된 데이터 조회·질문

   예) 잭콕 레시피 알려줘
       자체소스 종류 뭐 있지?

━━━━━━━━━━━━━━━━━━
💡 @메뉴명 으로 구분하면 여러 메뉴 동시 등록 가능`;

// 구조화된 입력 감지
function isStructuredInput(text: string, chatMode: ChatMode): boolean {
  if (chatMode === "inventory") {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return false;
    // "제품명 숫자" or "제품명 숫자g" or "제품명 숫자ml" 등 단위 접미사 허용
    const pattern = /^.+\s+\d+[a-zA-Z]*$/;
    const matchCount = lines.filter((l) => pattern.test(l.trim())).length;
    // 1줄이라도 패턴 매칭되면 구조화 입력으로 인식
    return matchCount >= 1;
  }
  if (chatMode === "recipe") {
    return /\d+/.test(text) && text.length > 5;
  }
  return false;
}

// sessionStorage helpers (새로고침/탭 닫기 시 리셋)
function loadMessages(storeId: string): Message[] | null {
  try {
    const raw = sessionStorage.getItem(`onis-chat-history-${storeId}`);
    if (!raw) return null;
    const arr = JSON.parse(raw) as { role: string; content: string }[];
    return arr.map((m) => ({
      role: m.role as Message["role"],
      content: m.content,
    }));
  } catch { return null; }
}

function saveMessages(storeId: string, messages: Message[]) {
  try {
    const serializable = messages
      .filter((m) => !m.isHint)
      .map((m) => ({ role: m.role, content: m.content }));
    sessionStorage.setItem(`onis-chat-history-${storeId}`, JSON.stringify(serializable));
  } catch { /* ignore */ }
}

function loadMode(storeId: string): ChatMode | null {
  try {
    const raw = sessionStorage.getItem(`onis-chat-mode-${storeId}`);
    if (raw === "chat" || raw === "recipe" || raw === "inventory") return raw;
    return null;
  } catch { return null; }
}

function saveMode(storeId: string, mode: ChatMode) {
  try { sessionStorage.setItem(`onis-chat-mode-${storeId}`, mode); } catch { /* ignore */ }
}

function loadChatSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem("onis-chat-size");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveChatSize(size: { width: number; height: number }) {
  try { localStorage.setItem("onis-chat-size", JSON.stringify(size)); } catch { /* ignore */ }
}

function isGuideDismissed(): boolean {
  try { return localStorage.getItem("onis-guide-dismissed") === "true"; } catch { return false; }
}

function setGuideDismissed(v: boolean) {
  try { localStorage.setItem("onis-guide-dismissed", v ? "true" : "false"); } catch { /* ignore */ }
}

export function ChatBox({ storeId, userId }: ChatBoxProps) {
  const { selectedDate } = useDateContext();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [chatSize, setChatSize] = useState({ width: 420, height: 540 });

  // 다중 메뉴 순차 처리
  const [multiMenus, setMultiMenus] = useState<MenuFuzzyData[]>([]);
  const [currentMenuIdx, setCurrentMenuIdx] = useState(0);
  const [multiMenuResults, setMultiMenuResults] = useState<{ menuName: string; success: boolean; message: string }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 초기 로드: localStorage에서 복원
  useEffect(() => {
    const saved = loadMessages(storeId);
    if (saved && saved.length > 0) {
      setMessages(saved);
    } else {
      setMessages([{ role: "assistant", content: WELCOME_CONTENT }]);
    }
    const savedMode = loadMode(storeId);
    if (savedMode) setMode(savedMode);
    const savedSize = loadChatSize();
    if (savedSize) setChatSize(savedSize);
    setGuideOpen(!isGuideDismissed());
  }, [storeId]);

  // 메시지 변경 시 localStorage 저장 + 스크롤
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(storeId, messages);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, storeId]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const addSystemMessage = useCallback((content: string, isHint = false) => {
    setMessages((prev) => [...prev, { role: "system", content, isHint }]);
  }, []);

  const handleModeSwitch = useCallback((newMode: ChatMode, command?: string) => {
    setMode(newMode);
    saveMode(storeId, newMode);
    if (command) {
      setMessages((prev) => [...prev, { role: "user", content: command }]);
    }
    addSystemMessage(MODE_HINTS[newMode], true);
  }, [storeId, addSystemMessage]);

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
      // sauce 커맨드를 recipe로 리다이렉트
      setInput("");
      handleModeSwitch("recipe", trimmed);
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

    // 구조화된 입력 → fuzzy-match API
    if ((mode === "inventory" || mode === "recipe") && isStructuredInput(trimmed, mode)) {
      const userMsg: Message = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat/fuzzy-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, storeId, userId, mode }),
        });

        const data = await res.json();

        if (!res.ok) {
          // 에러 응답 처리
          const errorMsg: Message = {
            role: "assistant",
            content: data.error || "오류가 발생했습니다.",
            isError: true,
            errorType: data.errorType,
            errorDetails: data.details,
          };
          setMessages((prev) => [...prev, errorMsg]);
          return;
        }

        // 레시피 모드: 다중 메뉴 처리
        if (mode === "recipe" && data.menus) {
          const menuData: MenuFuzzyData[] = data.menus.map((m: MenuFuzzyData) => ({
            ...m,
            categories: data.categories,
            products: data.products || [],
          }));

          if (menuData.length === 0) {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: "입력에서 메뉴명을 찾지 못했습니다. @메뉴명 형식으로 시작해 주세요.",
              isError: true,
              errorType: "parse_failed",
            }]);
            return;
          }

          if (menuData.length >= 2) {
            // 다중 메뉴: 순차 처리 모드 진입
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: `총 ${menuData.length}개의 레시피가 감지되었습니다.\n하나씩 확인하며 진행하겠습니다.`,
            }]);
            setMultiMenus(menuData);
            setCurrentMenuIdx(0);
            setMultiMenuResults([]);

            // 첫 번째 메뉴 표시
            const first = menuData[0];
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: `진행 중: 1/${menuData.length} - ${first.menuName}${first.glassware ? ` (잔: ${first.glassware})` : ""}`,
              fuzzyResults: first.results,
              fuzzyCategories: first.categories,
              fuzzyProducts: first.products,
              fuzzyContext: first.context,
              fuzzyMode: first.recipeType === "sauce" ? "sauce" : "recipe",
              fuzzyStatus: "pending",
            }]);
          } else {
            // 단일 메뉴
            const menu = menuData[0];
            const modeLabel = menu.recipeType === "sauce" ? "소스 레시피" : "레시피";
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: `${menu.menuName} ${modeLabel} ${menu.results.length}개 항목을 파싱했습니다. 매칭 결과를 확인해주세요.${menu.glassware ? `\n잔: ${menu.glassware}` : ""}${menu.garnish ? `\n가니시: ${menu.garnish}` : ""}${menu.note ? `\n참고: ${menu.note}` : ""}`,
              fuzzyResults: menu.results,
              fuzzyCategories: menu.categories,
              fuzzyProducts: menu.products,
              fuzzyContext: menu.context,
              fuzzyMode: menu.recipeType === "sauce" ? "sauce" : "recipe",
              fuzzyStatus: "pending",
            }]);
          }
          return;
        }

        // 재고 모드: 기존 방식
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `${data.results.length}개 재고 항목을 파싱했습니다. 매칭 결과를 확인해주세요.`,
          fuzzyResults: data.results,
          fuzzyCategories: data.categories,
          fuzzyProducts: data.products || [],
          fuzzyMode: "inventory",
          fuzzyStatus: "pending",
        }]);
      } catch {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: "서버와 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          isError: true,
          errorType: "network_error",
        }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 일반 글자 수 제한
    if (trimmed.length > 2000) {
      setMessages((prev) => [...prev, { role: "assistant", content: "메시지는 2000자 이내로 입력해주세요." }]);
      return;
    }

    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-10);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, storeId, userId, mode, history, date: selectedDate.toISOString().slice(0, 10) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.error || "오류가 발생했습니다.",
          isError: true,
          errorType: data.errorType,
        }]);
        return;
      }

      if (data.action?.actions?.length > 0) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.reply,
          action: data.action,
          actionStatus: "pending",
        }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "서버와 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        isError: true,
        errorType: "network_error",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFuzzyConfirm = async (msgIndex: number, items: ResolvedItem[], fuzzyContext?: FuzzyContext) => {
    const msg = messages[msgIndex];
    const fuzzyMode = msg.fuzzyMode || "inventory";

    setLoading(true);
    setSaving(true);

    try {
      if (fuzzyMode === "inventory") {
        const dateStr = selectedDate.toISOString().slice(0, 10);
        const res = await fetch("/api/chat/bulk-inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            date: dateStr,
            items: items.map((item) => ({
              productId: item.productId,
              inputName: item.inputName,
              value: item.value,
              isNew: item.isNew,
              newProductName: item.productName,
              newProductUnit: item.newUnit,
              newProductCategoryId: item.newCategoryId,
            })),
          }),
        });

        const data = await res.json();
        setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, fuzzyStatus: "confirmed" as const } : m));

        if (data.success) {
          const successCount = data.results.filter((r: { success: boolean }) => r.success).length;
          const failCount = data.results.length - successCount;
          let resultMsg = `\✅ ${successCount}개 항목 저장 완료`;
          if (failCount > 0) {
            const failedNames = data.results
              .filter((r: { success: boolean }) => !r.success)
              .map((r: { name: string; message: string }) => `${r.name}: ${r.message}`)
              .join("\n");
            resultMsg += `\n\⚠\️ ${failCount}개 실패:\n${failedNames}`;
          }
          setMessages((prev) => [...prev, { role: "assistant", content: resultMsg }]);
          window.dispatchEvent(new Event("onis-data-updated"));
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: data.error || "저장 실패",
            isError: true,
            errorType: data.errorType || "db_error",
          }]);
        }
      } else if (fuzzyMode === "recipe" || fuzzyMode === "sauce") {
        // 레시피 또는 소스: 벌크 액션으로 1회 처리
        const isMenuRecipe = fuzzyMode === "recipe";
        const menuName = isMenuRecipe
          ? (fuzzyContext?.menuName || msg.fuzzyContext?.menuName || "")
          : "";
        const sauceProduct = !isMenuRecipe
          ? (fuzzyContext?.sauceMatched || msg.fuzzyContext?.sauceMatched)
          : null;

        if (!isMenuRecipe && !sauceProduct) {
          setMessages((prev) => [...prev, { role: "assistant", content: "소스 제품을 선택해주세요." }]);
          setLoading(false);
          setSaving(false);
          return;
        }

        // 새 제품이 있으면 먼저 생성
        for (const item of items) {
          if (item.isNew) {
            await fetch("/api/chat/bulk-inventory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storeId,
                date: selectedDate.toISOString().slice(0, 10),
                items: [{
                  inputName: item.inputName,
                  value: 0,
                  isNew: true,
                  newProductName: item.productName,
                  newProductCategoryId: item.newCategoryId,
                }],
              }),
            });
          }
        }

        // 벌크 액션 1회 호출
        const bulkAction = isMenuRecipe
          ? {
              type: "update_menu_recipes",
              params: {
                menuName,
                recipes: items.map((item) => ({
                  productName: item.productName,
                  amount: item.value,
                  ...(item.tolerancePercent ? { tolerancePercent: item.tolerancePercent } : {}),
                })),
              },
            }
          : {
              type: "update_sauce_recipes",
              params: {
                sauceName: sauceProduct!.name,
                recipes: items.map((item) => ({
                  ingredientName: item.productName,
                  amount: item.value,
                })),
              },
            };

        const res = await fetch("/api/chat/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: bulkAction, storeId }),
        });

        const data = await res.json();
        const allSuccess = data.success && (!data.details?.failed || data.details.failed.length === 0);

        setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, fuzzyStatus: "confirmed" as const } : m));

        const label = isMenuRecipe ? `${menuName} 레시피` : `${sauceProduct!.name} 소스 레시피`;

        // 실패 항목 메시지 구성
        const failedMsg = data.details?.failed?.length
          ? "\n" + data.details.failed.map((f: { productName: string; reason: string }) => `  ${f.productName}: ${f.reason}`).join("\n")
          : "";

        // 다중 메뉴 모드인 경우 결과 누적
        if (multiMenus.length > 0) {
          const newResults = [...multiMenuResults, { menuName: multiMenus[currentMenuIdx].menuName, success: allSuccess, message: allSuccess ? "저장 완료" : (data.message || "일부 실패") }];
          setMultiMenuResults(newResults);

          const nextIdx = currentMenuIdx + 1;
          if (nextIdx < multiMenus.length) {
            setCurrentMenuIdx(nextIdx);
            const next = multiMenus[nextIdx];
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: `✅ ${multiMenus[currentMenuIdx].menuName} 완료\n\n진행 중: ${nextIdx + 1}/${multiMenus.length} - ${next.menuName}${next.glassware ? ` (잔: ${next.glassware})` : ""}`,
              fuzzyResults: next.results,
              fuzzyCategories: next.categories,
              fuzzyProducts: next.products,
              fuzzyContext: next.context,
              fuzzyMode: next.recipeType === "sauce" ? "sauce" : "recipe",
              fuzzyStatus: "pending",
            }]);
          } else {
            // 전부 완료
            const summary = newResults.map((r) => r.success ? `✅ ${r.menuName} (저장 완료)` : `⚠️ ${r.menuName}: ${r.message}`).join("\n");
            const successCount = newResults.filter((r) => r.success).length;
            const failCount = newResults.length - successCount;
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: `${summary}\n\n총 ${newResults.length}개 중 ${successCount}개 완료${failCount > 0 ? `, ${failCount}개 실패` : ""}`,
            }]);
            setMultiMenus([]);
            setCurrentMenuIdx(0);
            setMultiMenuResults([]);
            window.dispatchEvent(new Event("onis-data-updated"));
          }
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: allSuccess
              ? `✅ ${data.message || `${label} 저장 완료`}`
              : `⚠️ ${data.message || `${label} 일부 실패`}${failedMsg}`,
          }]);
          if (allSuccess) window.dispatchEvent(new Event("onis-data-updated"));
        }
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "저장 중 오류가 발생했습니다.",
        isError: true,
        errorType: "db_error",
      }]);
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const handleFuzzyCancel = (msgIndex: number) => {
    setMessages((prev) =>
      prev.map((m, i) => i === msgIndex ? { ...m, fuzzyStatus: "rejected" as const } : m)
    );

    // 다중 메뉴 모드에서 취소 시 다음으로 건너뛰기
    if (multiMenus.length > 0) {
      const newResults = [...multiMenuResults, { menuName: multiMenus[currentMenuIdx].menuName, success: false, message: "건너뛰" }];
      setMultiMenuResults(newResults);

      const nextIdx = currentMenuIdx + 1;
      if (nextIdx < multiMenus.length) {
        setCurrentMenuIdx(nextIdx);
        const next = multiMenus[nextIdx];
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `\⏭\️ ${multiMenus[currentMenuIdx].menuName} 건너뛰\n\n진행 중: ${nextIdx + 1}/${multiMenus.length} - ${next.menuName}`,
          fuzzyResults: next.results,
          fuzzyCategories: next.categories,
          fuzzyContext: next.context,
          fuzzyMode: next.recipeType === "sauce" ? "sauce" : "recipe",
          fuzzyStatus: "pending",
        }]);
      } else {
        const summary = newResults.map((r) => r.success ? `\✅ ${r.menuName}` : `\⏭\️ ${r.menuName} (건너뛰)`).join("\n");
        setMessages((prev) => [...prev, { role: "assistant", content: `완료:\n${summary}` }]);
        setMultiMenus([]);
        setCurrentMenuIdx(0);
        setMultiMenuResults([]);
      }
    } else {
      setMessages((prev) => [...prev, { role: "assistant", content: "취소되었습니다." }]);
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
          body: JSON.stringify({ action: { ...act, params: { ...act.params, date: selectedDate.toISOString().slice(0, 10) } }, storeId }),
        });

        const data = await res.json();
        if (data.success) {
          results.push(data.message);
        } else {
          results.push(data.error || "실패");
          allSuccess = false;
        }
      }

      setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "confirmed" as const } : m));
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: allSuccess ? `\✅ ${results.join("\n")}` : `\⚠\️ 일부 실패:\n${results.join("\n")}`,
      }]);

      if (allSuccess) window.dispatchEvent(new Event("onis-data-updated"));
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "실행 중 오류가 발생했습니다.",
        isError: true,
        errorType: "db_error",
      }]);
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const handleRejectAction = (msgIndex: number) => {
    setMessages((prev) => prev.map((m, i) => i === msgIndex ? { ...m, actionStatus: "rejected" as const } : m));
    setMessages((prev) => [...prev, { role: "assistant", content: "취소되었습니다." }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === "inventory" || mode === "recipe") {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    } else {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleCopyInput = (text: string) => {
    navigator.clipboard.writeText(text);
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
    recipe: "@메뉴명 재료 용량... (Ctrl+Enter)",
    inventory: "제품명 잔량 (여러 줄 → Ctrl+Enter)",
  };

  const maxLength = 3000;

  // 인사말 메시지인지 확인
  const isWelcomeMsg = (msg: Message) => msg.role === "assistant" && msg.content === WELCOME_CONTENT;

  return (
    <>
    {saving && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
        <div className="bg-background rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      </div>
    )}
    <Resizable
      size={{ width: chatSize.width, height: chatSize.height }}
      onResizeStop={(_e, _dir, _ref, d) => {
        const newSize = { width: chatSize.width + d.width, height: chatSize.height + d.height };
        setChatSize(newSize);
        saveChatSize(newSize);
      }}
      minWidth={320}
      minHeight={400}
      maxWidth={typeof window !== "undefined" ? window.innerWidth * 0.9 : 800}
      maxHeight={typeof window !== "undefined" ? window.innerHeight * 0.9 : 800}
      enable={{ top: true, left: true, topLeft: true, right: false, bottom: false, bottomRight: false, bottomLeft: false, topRight: false }}
      className="fixed bottom-6 right-6 z-50"
      style={{ position: "fixed", bottom: 24, right: 24 }}
      handleStyles={{
        top: { cursor: "n-resize", height: 6, top: 0, left: 12, right: 12 },
        left: { cursor: "w-resize", width: 6, top: 12, bottom: 12, left: 0 },
        topLeft: { cursor: "nw-resize", width: 10, height: 10, top: 0, left: 0 },
      }}
      handleClasses={{
        top: "hover:bg-primary/20 rounded-t transition-colors",
        left: "hover:bg-primary/20 rounded-l transition-colors",
        topLeft: "hover:bg-primary/20 rounded-tl transition-colors",
      }}
    >
    <div className="w-full h-full bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* 헤더: 3탭 모드 전환 */}
      <div className={`border-b ${MODE_COLORS[mode]}`}>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">OnIS 도우미</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* 모드 탭 */}
        <div className="flex px-2 pb-1.5 gap-1">
          {(["chat", "recipe", "inventory"] as ChatMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeSwitch(m)}
              className={`flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {MODE_ICONS[m]} {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i}>
            {/* 인사말: 접기/펼치기 */}
            {isWelcomeMsg(msg) ? (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                  <div className="font-medium">안녕하세요! OnIS 도우미입니다.</div>
                  {guideOpen ? (
                    <>
                      <pre className="whitespace-pre-wrap text-xs mt-2 font-sans leading-relaxed">{msg.content.split("\n").slice(1).join("\n")}</pre>
                      <button
                        onClick={() => { setGuideOpen(false); setGuideDismissed(true); }}
                        className="text-[10px] text-primary mt-1 hover:underline"
                      >
                        사용법 접기 \▲
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setGuideOpen(true); setGuideDismissed(false); }}
                      className="text-[10px] text-primary mt-1 hover:underline"
                    >
                      사용법 보기 \▼
                    </button>
                  )}
                </div>
              </div>
            ) : msg.role === "system" ? (
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
                      : msg.isError
                        ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
                        : "bg-muted text-foreground"
                  }`}
                >
                  {msg.isError && (
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium uppercase">{msg.errorType || "error"}</span>
                    </div>
                  )}
                  {msg.content}
                  {msg.isError && msg.errorDetails?.suggestion && (
                    <div className="mt-1.5 text-xs opacity-80 border-t border-red-200 dark:border-red-700 pt-1">
                      ❓ {msg.errorDetails.suggestion}
                    </div>
                  )}
                  {msg.isError && (
                    <button
                      onClick={() => handleCopyInput(msg.content)}
                      className="mt-1 flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100"
                    >
                      <Copy className="h-3 w-3" /> 복사
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 퍼지 매칭 리뷰 패널 */}
            {msg.fuzzyResults && msg.fuzzyStatus === "pending" && (
              <div className="mt-2 ml-1 max-w-[95%]">
                <FuzzyMatchReview
                  results={msg.fuzzyResults}
                  categories={msg.fuzzyCategories || []}
                  products={msg.fuzzyProducts || []}
                  mode={msg.fuzzyMode}
                  context={msg.fuzzyContext || undefined}
                  onConfirm={(items, ctx) => handleFuzzyConfirm(i, items, ctx)}
                  onCancel={() => handleFuzzyCancel(i)}
                  disabled={loading}
                />
              </div>
            )}
            {msg.fuzzyResults && msg.fuzzyStatus === "confirmed" && (
              <div className="text-xs text-muted-foreground mt-1 ml-1">적용 완료</div>
            )}
            {msg.fuzzyResults && msg.fuzzyStatus === "rejected" && (
              <div className="text-xs text-muted-foreground mt-1 ml-1">취소됨</div>
            )}

            {/* 기존 액션 미리보기 */}
            {msg.action && msg.actionStatus === "pending" && (
              <div className="mt-2 ml-1 max-w-[90%]">
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
                        {msg.action.actions[0]?.type === "update_inventory" && (
                          <>
                            <th className="px-2 py-1.5 text-left font-medium">제품명</th>
                            <th className="px-2 py-1.5 text-right font-medium">잔량(g)</th>
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
                                <td className="px-2 py-1 text-right font-mono">{act.params.tolerancePercent || "-"}</td>
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
                          {act.type === "update_inventory" && (
                            <>
                              <td className="px-2 py-1">{act.params.productName}</td>
                              <td className="px-2 py-1 text-right font-mono">{act.params.remaining ?? "-"}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => handleConfirmAction(i)} disabled={loading}>
                    <Check className="h-3 w-3" /> 확인
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleRejectAction(i)} disabled={loading}>
                    <XCircle className="h-3 w-3" /> 취소
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
            rows={mode === "chat" ? 2 : 3}
            maxLength={maxLength}
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
            {mode === "chat"
              ? "#레시피입력 · #현재재고입력 · #/"
              : "Ctrl+Enter 전송 · #/ 돌아가기"}
          </div>
          <div className="text-xs text-muted-foreground">
            {input.length}/{maxLength}
          </div>
        </div>
      </div>
    </div>
    </Resizable>
    </>
  );
}
