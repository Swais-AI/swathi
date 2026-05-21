"use client";

import { useEffect, useMemo, useState } from "react";

const chapterSubjects = ["Social Science", "Maths", "Hindi", "Telugu"];
const chapterLessons = ["Lesson 1", "Lesson 2", "Lesson 3", "Lesson 5", "Lesson 6", "Lesson 7", "Lesson 8", "Lesson 9", "Lesson 10"];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function ChapterSelector({ showReader = false }) {
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedLesson, setSelectedLesson] = useState("");
  const [chapterContent, setChapterContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const paragraphs = useMemo(() => {
    if (!chapterContent?.full_text_content) {
      return [];
    }

    return chapterContent.full_text_content
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }, [chapterContent]);

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (speechSupported) {
      window.speechSynthesis.cancel();
      setIsReading(false);
      setIsPaused(false);
    }
  }, [chapterContent, speechSupported]);

  function handleReadAloud() {
    if (!speechSupported || !chapterContent) {
      return;
    }

    window.speechSynthesis.cancel();

    const textToRead = `${chapterContent.content_title}. ${chapterContent.full_text_content}`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = "en-IN";
    utterance.rate = 0.92;
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsReading(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsReading(false);
      setIsPaused(false);
    };

    setIsReading(true);
    setIsPaused(false);
    window.speechSynthesis.speak(utterance);
  }

  function handlePauseResume() {
    if (!speechSupported || !isReading) {
      return;
    }

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }

  function handleStopReading() {
    if (!speechSupported) {
      return;
    }

    window.speechSynthesis.cancel();
    setIsReading(false);
    setIsPaused(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!showReader) {
      return;
    }

    if (!selectedSubject || !selectedLesson) {
      setError("Please select a subject and lesson.");
      setChapterContent(null);
      return;
    }

    setLoading(true);
    setError("");
    setChapterContent(null);

    try {
      const params = new URLSearchParams({
        subject: selectedSubject,
        lesson: selectedLesson
      });
      const response = await fetch(`${API_BASE_URL}/chapter-content?${params.toString()}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof data.detail === "string" ? data.detail : "No chapter content found for this selection.";
        throw new Error(message);
      }

      setChapterContent(data);
    } catch (fetchError) {
      setError(fetchError.message || "Unable to load chapter content. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="chapter-selector chapter-page-selector" aria-label="Chapter selection" onSubmit={handleSubmit}>
        <select value={selectedSubject} aria-label="Select subject" onChange={(event) => setSelectedSubject(event.target.value)}>
          <option value="" disabled>
            Select Subject...
          </option>
          {chapterSubjects.map((subject) => (
            <option value={subject} key={subject}>
              {subject}
            </option>
          ))}
        </select>
        <select value={selectedLesson} aria-label="Select lesson" onChange={(event) => setSelectedLesson(event.target.value)}>
          <option value="" disabled>
            Select Book Title...
          </option>
          {chapterLessons.map((lesson) => (
            <option value={lesson} key={lesson}>
              {lesson}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading}>
          {loading ? "Loading" : "Go"}
        </button>
      </form>

      {showReader && (
        <div className="chapter-content-area" aria-live="polite">
          {loading && (
            <article className="chapter-message-card">
              <div className="loading-line" />
              <p>Loading chapter content...</p>
            </article>
          )}

          {!loading && error && (
            <article className="chapter-message-card error">
              <h2>Content not available</h2>
              <p>{error}</p>
            </article>
          )}

          {!loading && chapterContent && (
            <article className="chapter-content-card">
              <div className="chapter-content-header">
                <h2>{chapterContent.content_title}</h2>
                <div className="chapter-audio-controls" aria-label="Chapter audio controls">
                  <button type="button" onClick={handleReadAloud} disabled={!speechSupported}>
                    {isReading ? "Restart Audio" : "Read Aloud"}
                  </button>
                  <button type="button" onClick={handlePauseResume} disabled={!speechSupported || !isReading}>
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                  <button type="button" onClick={handleStopReading} disabled={!speechSupported || !isReading}>
                    Stop
                  </button>
                </div>
              </div>
              {!speechSupported && <p className="chapter-audio-note">Audio reading is not supported in this browser.</p>}
              <div className="chapter-text">
                {paragraphs.length > 0 ? (
                  paragraphs.map((paragraph, index) => <p key={`${paragraph.slice(0, 18)}-${index}`}>{paragraph}</p>)
                ) : (
                  <p>{chapterContent.full_text_content}</p>
                )}
              </div>
            </article>
          )}
        </div>
      )}
    </>
  );
}
