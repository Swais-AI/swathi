"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const speechLang = {
  English: "en-IN",
  Hindi: "hi-IN",
  Telugu: "te-IN"
};

const searchSelector = [
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
  ".workspace .quiz-option span"
].join(",");

function isSkippable(element) {
  return (
    element.closest(".topbar") ||
    element.closest(".sidebar") ||
    element.closest(".notice-dropdown") ||
    element.closest(".chapter-audio-controls") ||
    element.matches("input, select, textarea")
  );
}

function clearHighlights() {
  document.querySelectorAll(".voice-search-highlight").forEach((element) => {
    element.classList.remove("voice-search-highlight");
  });
}

function highlightMatches(query) {
  clearHighlights();

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return;

  const firstMatch = Array.from(document.querySelectorAll(searchSelector)).find((element) => {
    if (isSkippable(element)) return false;
    return element.textContent.toLowerCase().includes(normalizedQuery);
  });

  if (firstMatch) {
    firstMatch.classList.add("voice-search-highlight");
    firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function getReadablePageText() {
  const workspace = document.querySelector(".workspace");
  if (!workspace) return "";

  const clone = workspace.cloneNode(true);
  clone.querySelectorAll(".topbar, .sidebar, script, style, .notice-dropdown").forEach((node) => node.remove());
  return clone.textContent.replace(/\s+/g, " ").trim().slice(0, 12000);
}

function getSelectedSpeechLanguage() {
  const selectedLanguage = document.querySelector(".language-select select")?.value || "English";
  return speechLang[selectedLanguage] || "en-IN";
}

export default function VoiceTextTools() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [audioActive, setAudioActive] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    highlightMatches(query);

    return () => {
      clearHighlights();
    };
  }, [query, pathname]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handleAudio() {
    if (!("speechSynthesis" in window)) {
      return;
    }

    if (audioActive) {
      window.speechSynthesis.cancel();
      setAudioActive(false);
      return;
    }

    const text = query.trim() || getReadablePageText();
    if (!text) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSelectedSpeechLanguage();
    utterance.rate = 0.92;
    utterance.onend = () => setAudioActive(false);
    utterance.onerror = () => setAudioActive(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setAudioActive(true);
  }

  function handleMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = getSelectedSpeechLanguage();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setQuery(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="voice-search-bar">
      <span className="search-icon" aria-hidden="true" />
      <input
        type="search"
        value={query}
        placeholder="Search or speak..."
        aria-label="Search page content or use voice input"
        onChange={(event) => setQuery(event.target.value)}
      />
      <button className={`round-tool-button ${audioActive ? "active" : ""}`} type="button" aria-label={audioActive ? "Stop audio" : "Read aloud"} onClick={handleAudio}>
        <span className="audio-icon" aria-hidden="true" />
      </button>
      <button className={`round-tool-button mic ${listening ? "active" : ""}`} type="button" aria-label={listening ? "Stop voice input" : "Start voice input"} onClick={handleMic}>
        <span className="mic-icon" aria-hidden="true" />
      </button>
    </div>
  );
}
