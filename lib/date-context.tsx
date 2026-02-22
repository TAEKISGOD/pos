"use client";

import { createContext, useContext } from "react";

interface DateContextType {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
}

export const DateContext = createContext<DateContextType>({
  selectedDate: new Date(),
  setSelectedDate: () => {},
});

export const useDateContext = () => useContext(DateContext);
