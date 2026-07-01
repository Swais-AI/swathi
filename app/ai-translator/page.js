"use client";

import { useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();

const languages = [
  "English",
  "Hindi",
  "Telugu",
  "Tamil",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Bengali"
];

const sampleText = "Democracy means that people choose their representatives through regular elections.";

async function fetchWithTimeout(url, options = {}, timeoutMs = 35000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function AiTranslatorPage() {
  const [sourceLanguage, setSourceLanguage] = useState("Auto Detect");
  const [targetLanguage, setTargetLanguage] = useState("Hindi");
  const [text, setText] = useState(sampleText);
  const [translatedText, setTranslatedText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTranslate() {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setError("Please enter text to translate.");
      setStatus("");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Translating text...");
    setTranslatedText("");

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/ai/translate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmedText,
          source_language: sourceLanguage === "Auto Detect" ? null : sourceLanguage,
          target_language: targetLanguage
        })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to translate text.");
      }

      setTranslatedText(data.translated_text || "");
      setStatus("Translation ready.");
    } catch (translateError) {
      setError(translateError.name === "AbortError" ? "Translation timed out. Please try again." : translateError.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!translatedText || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(translatedText);
    setStatus("Translated text copied.");
  }

  function handleSpeak() {
    if (!translatedText || !("speechSynthesis" in window)) {
      setError("Text to voice is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(translatedText));
  }

  function handleStopSpeech() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <article className="module-card translator-card">
            <div className="card-title-row">
              <div>
                <h2>AI Translator</h2>
                <p>Translate study text into another language script.</p>
              </div>
              <span className="status-pill in-progress">AI Tool</span>
            </div>

            <div className="translator-grid">
              <section className="translator-panel">
                <div className="translator-controls">
                  <label>
                    <span>Source</span>
                    <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>
                      <option value="Auto Detect">Auto Detect</option>
                      {languages.map((language) => (
                        <option value={language} key={language}>{language}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Target</span>
                    <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                      {languages.map((language) => (
                        <option value={language} key={language}>{language}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste study text here" />
              </section>

              <section className="translator-panel output">
                <div className="translator-output-head">
                  <strong>Translated Text</strong>
                  <div>
                    <button className="soft-button" type="button" onClick={handleCopy} disabled={!translatedText}>Copy</button>
                    <button className="soft-button" type="button" onClick={handleSpeak} disabled={!translatedText}>Speak</button>
                    <button className="soft-button" type="button" onClick={handleStopSpeech}>Stop</button>
                  </div>
                </div>
                <div className="translator-output" aria-live="polite">
                  {translatedText || "Translation will appear here."}
                </div>
              </section>
            </div>

            {error && <div className="learning-status error" role="alert">{error}</div>}
            {status && <div className="learning-status success" role="status">{status}</div>}

            <div className="quiz-submit-row">
              <button className="primary-button" type="button" onClick={handleTranslate} disabled={loading}>
                {loading ? "Translating..." : "Translate"}
              </button>
            </div>
          </article>

          <div className="note-box">Use AI Translator for study notes, chapter paragraphs, and assignment instructions.</div>
        </div>
      </section>
    </DashboardShell>
  );
}
