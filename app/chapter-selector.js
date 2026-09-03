"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppSelect from "./app-select";
import { getApiBaseUrl } from "./api-base-url";

const API_BASE_URL = getApiBaseUrl();
const DEFAULT_CLASS_ID = process.env.NEXT_PUBLIC_DEFAULT_CLASS_ID || "18";
const DEFAULT_CLASS_LABEL = process.env.NEXT_PUBLIC_DEFAULT_CLASS_LABEL || "Class 8";

export default function ChapterSelector({ showReader = false }) {
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [chapterContent, setChapterContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const speechChunksRef = useRef([]);
  const speechIndexRef = useRef(0);

  const paragraphs = useMemo(() => {
    if (!chapterContent?.full_text_content) {
      return [];
    }

    return chapterContent.full_text_content
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }, [chapterContent]);

  const isPdfContent = Boolean(chapterContent?.view_url);

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        speechChunksRef.current = [];
        speechIndexRef.current = 0;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadClassesForStudent() {
      setLoadingClasses(true);
      setError("");

      try {
        const [classesResponse, studentResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/classes`),
          fetch(`${API_BASE_URL}/students/current`)
        ]);
        const classesData = await classesResponse.json().catch(() => ({}));
        const studentData = await studentResponse.json().catch(() => ({}));

        if (!classesResponse.ok) {
          throw new Error(typeof classesData.detail === "string" ? classesData.detail : "Unable to load classes.");
        }
        if (!studentResponse.ok) {
          throw new Error(typeof studentData.detail === "string" ? studentData.detail : "Unable to load student class.");
        }

        const availableClasses = Array.isArray(classesData.classes) ? classesData.classes : [];
        const currentClassId = studentData.student?.class_id || DEFAULT_CLASS_ID;
        const selectedClassId = availableClasses.some((classItem) => String(classItem.class_id) === String(currentClassId))
          ? String(currentClassId)
          : String(availableClasses[0]?.class_id || "");

        if (!cancelled) {
          setClasses(availableClasses);
          setSelectedClass(selectedClassId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load classes.");
          setClasses([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingClasses(false);
        }
      }
    }

    loadClassesForStudent();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSubjectsForClass() {
      if (!selectedClass) {
        setSubjects([]);
        setSelectedSubject("");
        setChapters([]);
        setSelectedChapter("");
        setLoadingSubjects(false);
        return;
      }

      setLoadingSubjects(true);
      setError("");
      setSubjects([]);
      setSelectedSubject("");
      setChapters([]);
      setSelectedChapter("");
      setChapterContent(null);

      try {
        const params = new URLSearchParams({ class_id: selectedClass });
        const response = await fetch(`${API_BASE_URL}/subjects?${params.toString()}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load subjects.");
        }

        if (!cancelled) {
          setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load subjects.");
          setSubjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    }

    loadSubjectsForClass();

    return () => {
      cancelled = true;
    };
  }, [selectedClass]);

  useEffect(() => {
    let cancelled = false;

    async function loadChaptersForSubject() {
      if (!selectedClass || !selectedSubject) {
        setChapters([]);
        setSelectedChapter("");
        return;
      }

      setLoadingChapters(true);
      setError("");
      setChapters([]);
      setSelectedChapter("");
      setChapterContent(null);

      try {
        const params = new URLSearchParams({
          class_id: selectedClass,
          subject_id: selectedSubject
        });
        const response = await fetch(`${API_BASE_URL}/chapter-content-list?${params.toString()}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load chapters.");
        }

        if (!cancelled) {
          setChapters(Array.isArray(data.chapters) ? data.chapters : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load chapters.");
          setChapters([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingChapters(false);
        }
      }
    }

    loadChaptersForSubject();

    return () => {
      cancelled = true;
    };
  }, [selectedSubject, selectedClass]);

  useEffect(() => {
    if (speechSupported) {
      speechChunksRef.current = [];
      speechIndexRef.current = 0;
      window.speechSynthesis.cancel();
      setIsReading(false);
      setIsPaused(false);
    }
  }, [chapterContent, speechSupported]);

  function buildSpeechChunks(text) {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
    const chunks = [];
    let currentChunk = "";

    sentences.forEach((sentence) => {
      const cleanSentence = sentence.trim();
      if (!cleanSentence) {
        return;
      }

      if ((currentChunk + " " + cleanSentence).trim().length > 1200) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = cleanSentence;
      } else {
        currentChunk = `${currentChunk} ${cleanSentence}`.trim();
      }
    });

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  function speakChunk(index) {
    if (!speechSupported || index >= speechChunksRef.current.length) {
      speechChunksRef.current = [];
      speechIndexRef.current = 0;
      setIsReading(false);
      setIsPaused(false);
      return;
    }

    speechIndexRef.current = index;
    const utterance = new SpeechSynthesisUtterance(speechChunksRef.current[index]);
    utterance.lang = "en-IN";
    utterance.rate = 0.92;
    utterance.pitch = 1;

    utterance.onend = () => {
      speakChunk(index + 1);
    };

    utterance.onerror = () => {
      speechChunksRef.current = [];
      speechIndexRef.current = 0;
      setIsReading(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function handleReadAloud() {
    if (!speechSupported || !chapterContent || isPdfContent) {
      return;
    }

    window.speechSynthesis.cancel();

    const textToRead = `${chapterContent.content_title}. ${chapterContent.full_text_content}`;
    speechChunksRef.current = buildSpeechChunks(textToRead);
    speechIndexRef.current = 0;

    setIsReading(true);
    setIsPaused(false);
    window.setTimeout(() => speakChunk(0), 0);
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
    speechChunksRef.current = [];
    speechIndexRef.current = 0;
    setIsReading(false);
    setIsPaused(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!showReader) {
      return;
    }

    if (!selectedSubject || !selectedChapter) {
      setError("Please select a subject and chapter.");
      setChapterContent(null);
      return;
    }

    setLoading(true);
    setError("");
    setChapterContent(null);

    try {
      const params = new URLSearchParams({
        chapter_content_id: selectedChapter
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
        <AppSelect
          value={selectedClass}
          options={classes.map((classItem) => {
            const sectionLabel = classItem.section_name ? ` - ${classItem.section_name}` : "";
            const yearLabel = classItem.academic_year ? ` (${classItem.academic_year})` : "";
            return { value: classItem.class_id, label: `${classItem.class_name}${sectionLabel}${yearLabel}` };
          })}
          ariaLabel="Select class"
          onChange={setSelectedClass}
          disabled={loadingClasses}
          placeholder={loadingClasses ? "Loading Classes..." : "Select Class..."}
          searchable
          className="chapter-app-select"
        />
        <AppSelect
          value={selectedSubject}
          options={subjects.map((subject) => ({ value: subject.subject_id, label: subject.subject_name }))}
          ariaLabel="Select subject"
          onChange={setSelectedSubject}
          disabled={!selectedClass || loadingSubjects}
          placeholder={loadingSubjects ? "Loading Subjects..." : "Select Subject..."}
          searchable
          className="chapter-app-select"
        />
        <AppSelect
          value={selectedChapter}
          options={chapters.map((chapter) => ({ value: chapter.chapter_content_id, label: chapter.content_title }))}
          ariaLabel="Select chapter"
          onChange={(value) => {
            setSelectedChapter(value);
            setChapterContent(null);
          }}
          disabled={!selectedSubject || loadingChapters}
          placeholder={loadingChapters ? "Loading Chapters..." : "Select Book Title..."}
          searchable
          className="chapter-app-select chapter-title-app-select"
        />
        <button type="submit" disabled={loading || loadingClasses || loadingSubjects || loadingChapters}>
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
                {!isPdfContent && (
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
                )}
              </div>
              {!isPdfContent && !speechSupported && (
                <p className="chapter-audio-note">Audio reading is not supported in this browser.</p>
              )}
              {isPdfContent ? (
                <div className="chapter-pdf-container">
                  <iframe
                    src={chapterContent.view_url}
                    title={`${chapterContent.content_title} PDF`}
                    className="chapter-pdf-frame"
                  />
                  <div className="chapter-pdf-actions">
                    <a href={chapterContent.view_url} target="_blank" rel="noopener noreferrer">
                      Open PDF in new tab
                    </a>
                    {chapterContent.download_url && (
                      <a href={chapterContent.download_url}>Download PDF</a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="chapter-text">
                  {paragraphs.length > 0 ? (
                    paragraphs.map((paragraph, index) => <p key={`${paragraph.slice(0, 18)}-${index}`}>{paragraph}</p>)
                  ) : (
                    <p>{chapterContent.full_text_content}</p>
                  )}
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </>
  );
}
