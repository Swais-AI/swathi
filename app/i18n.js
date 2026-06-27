"use client";

import { createContext, useContext, useMemo, useState } from "react";

export const languageOptions = [
  { code: "English", label: "English", target: "English" },
  { code: "Hindi", label: "Hindi", target: "Hindi" },
  { code: "Telugu", label: "Telugu", target: "Telugu" }
];

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("English");

  const value = useMemo(() => ({
    language,
    setLanguage,
    languageOptions
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
