"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getApiBaseUrl } from "./api-base-url";
import { useLanguage } from "./i18n";

const API_BASE_URL = getApiBaseUrl();

const textSelector = [
  ".workspace h2",
  ".workspace h3",
  ".workspace p",
  ".workspace legend",
  ".workspace th",
  ".workspace td",
  ".workspace .study-row span",
  ".workspace .module-action",
  ".workspace .note-box",
  ".workspace .tip-box",
  ".workspace .status-pill",
  ".workspace .result-grid span",
  ".workspace .result-grid strong",
  ".workspace .test-row strong",
  ".workspace .test-row span",
  ".workspace .learner-row span",
  ".workspace .subject-row span",
  ".workspace .chapter-text p",
  ".workspace .chapter-content-header h2",
  ".workspace .quiz-option span"
].join(",");

function isSkippable(element) {
  return (
    element.closest(".topbar") ||
    element.closest(".sidebar") ||
    element.closest(".notice-dropdown") ||
    element.closest(".chapter-audio-controls") ||
    element.matches("input, select, textarea, button")
  );
}

function getTranslatableElements() {
  return Array.from(document.querySelectorAll(textSelector)).filter((element) => {
    const text = element.textContent.trim();
    return text && text.length <= 3000 && !isSkippable(element);
  });
}

function restoreEnglish() {
  document.querySelectorAll("[data-ai-original-text]").forEach((element) => {
    element.textContent = element.dataset.aiOriginalText;
    delete element.dataset.aiCurrentLanguage;
  });
}

async function translateChunk(texts, targetLanguage) {
  const response = await fetch(`${API_BASE_URL}/ai/translate-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts,
      source_language: "English",
      target_language: targetLanguage
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Unable to translate page content.");
  }

  return Array.isArray(data.translations) ? data.translations : [];
}

export default function LanguagePageTranslator() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const runIdRef = useRef(0);
  const observerTimerRef = useRef(null);

  useEffect(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    async function translatePage() {
      if (language === "English") {
        restoreEnglish();
        return;
      }

      window.setTimeout(async () => {
        const elements = getTranslatableElements();
        const pendingElements = elements.filter((element) => element.dataset.aiCurrentLanguage !== language);

        if (pendingElements.length === 0) return;

        try {
          for (let index = 0; index < pendingElements.length; index += 8) {
            if (runIdRef.current !== runId) return;

            const chunk = pendingElements.slice(index, index + 8);
            const texts = chunk.map((element) => {
              if (!element.dataset.aiOriginalText) {
                element.dataset.aiOriginalText = element.textContent.trim();
              }
              return element.dataset.aiOriginalText;
            });
            const translations = await translateChunk(texts, language);

            chunk.forEach((element, itemIndex) => {
              if (translations[itemIndex]) {
                element.textContent = translations[itemIndex];
                element.dataset.aiCurrentLanguage = language;
              }
            });
          }
        } catch {
          restoreEnglish();
        }
      }, 250);
    }

    translatePage();

    const workspace = document.querySelector(".workspace");
    const observer = new MutationObserver(() => {
      if (language === "English") return;

      window.clearTimeout(observerTimerRef.current);
      observerTimerRef.current = window.setTimeout(() => {
        translatePage();
      }, 500);
    });

    if (workspace) {
      observer.observe(workspace, {
        childList: true,
        subtree: true
      });
    }

    return () => {
      runIdRef.current += 1;
      window.clearTimeout(observerTimerRef.current);
      observer.disconnect();
    };
  }, [language, pathname]);

  return null;
}
