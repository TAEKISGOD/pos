"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { DateContext } from "@/lib/date-context";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { CalendarIcon, LogOut, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatBox } from "@/components/ChatBox";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [userId, setUserId] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const navLinks = [
    { href: "/dashboard", label: "재고 관리" },
    { href: "/dashboard/ordering", label: "발주 관리" },
    { href: "/dashboard/analytics", label: "대시보드" },
    { href: "/dashboard/menuboard", label: "메뉴판" },
    { href: "/dashboard/shop", label: "OnIS Shop" },
  ];

  useEffect(() => {
    const fetchStore = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: store } = await supabase
        .from("stores")
        .select("id, name")
        .eq("user_id", user.id)
        .single();
      if (user) setUserId(user.id);
      if (store) {
        setStoreName(store.name);
        setStoreId(store.id);
      }
    };
    fetchStore();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
      <div className="min-h-screen bg-muted/30">
        {/* 상단 헤더 */}
        <header className="border-b bg-background sticky top-0 z-50">
          <div className="flex items-center justify-between px-6 h-14">
            <div className="flex items-center gap-3">
              <Link href="/landing" className="font-serif font-bold text-lg tracking-tight" style={{ color: "#3a7d1e" }}>
                OnIS
              </Link>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-1.5">
                <Store className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{storeName}</span>
              </div>
            </div>
            <nav className="flex items-center">
              {navLinks.map((link) => {
                const isActive = link.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "px-4 h-14 inline-flex items-center text-sm font-medium border-b-2 transition-colors",
                      isActive
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate
                      ? format(selectedDate, "yyyy년 MM월 dd일", { locale: ko })
                      : "날짜 선택"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="p-6">
          {children}
        </main>

        {storeId && userId && <ChatBox storeId={storeId} userId={userId} />}
      </div>
    </DateContext.Provider>
  );
}
