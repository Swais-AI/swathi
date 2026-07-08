"use client";

import { useEffect, useMemo, useState } from "react";
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
        <select
          value={selectedClass}
          aria-label="Select class"
          onChange={(event) => setSelectedClass(event.target.value)}
          disabled={loadingClasses}
        >
          <option value="" disabled>
            {loadingClasses ? "Loading Classes..." : "Select Class..."}
          </option>
          {classes.map((classItem) => {
            const sectionLabel = classItem.section_name ? ` - ${classItem.section_name}` : "";
            const yearLabel = classItem.academic_year ? ` (${classItem.academic_year})` : "";
            return (
              <option value={classItem.class_id} key={classItem.class_id}>
                {classItem.class_name}{sectionLabel}{yearLabel}
              </option>
            );
          })}
        </select>
        <select
          value={selectedSubject}
          aria-label="Select subject"
          onChange={(event) => setSelectedSubject(event.target.value)}
          disabled={!selectedClass || loadingSubjects}
        >
          <option value="" disabled>
            {loadingSubjects ? "Loading Subjects..." : "Select Subject..."}
          </option>
          {subjects.map((subject) => (
            <option value={subject.subject_id} key={subject.subject_id}>
              {subject.subject_name}
            </option>
          ))}
        </select>
        <select
          value={selectedChapter}
          aria-label="Select chapter"
          onChange={(event) => {
            setSelectedChapter(event.target.value);
            setChapterContent(null);
          }}
          disabled={!selectedSubject || loadingChapters}
        >
          <option value="" disabled>
            {loadingChapters ? "Loading Chapters..." : "Select Book Title..."}
          </option>
          {chapters.map((chapter) => (
            <option value={chapter.chapter_content_id} key={chapter.chapter_content_id}>
              {chapter.content_title}
            </option>
          ))}
        </select>
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
