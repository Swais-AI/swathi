"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const DEFAULT_CLASS_ID = process.env.NEXT_PUBLIC_DEFAULT_CLASS_ID || "18";

const learnerTracks = [
  {
    key: "Fast Reader",
    title: "Fast Reader Material",
    description: "Quick revision notes, challenge questions, and enrichment work.",
    markers: ["Short notes", "Timed quiz", "Advanced practice"]
  },
  {
    key: "Average Reader",
    title: "Average Reader Material",
    description: "Balanced chapter notes with guided checkpoints and practice.",
    markers: ["Section reading", "Key points", "Quiz correction"]
  },
  {
    key: "Slow Reader",
    title: "Slow Reader Material",
    description: "Smaller reading blocks, recap support, and retry guidance.",
    markers: ["Audio support", "Keyword help", "Step practice"]
  }
];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
  }

  return data;
}

function metricValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0";
  }

  return Number(value).toFixed(1).replace(/\.0$/, "");
}

export default function AiLearningPathPage() {
  const [student, setStudent] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [learningPath, setLearningPath] = useState(null);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [generatingPath, setGeneratingPath] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);

  const classification = performance?.classification || "Average Reader";
  const selectedTrack = useMemo(() => learnerTracks.find((track) => track.key === classification) || learnerTracks[1], [classification]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoadingPage(true);
      setError("");

      try {
        const [studentData, classesData] = await Promise.all([
          fetchJson(`${API_BASE_URL}/students/current`),
          fetchJson(`${API_BASE_URL}/classes`)
        ]);
        const currentStudent = studentData.student;
        const currentClassId = currentStudent?.class_id || DEFAULT_CLASS_ID;
        const availableClasses = Array.isArray(classesData.classes) ? classesData.classes : [];
        const classId = availableClasses.some((item) => String(item.class_id) === String(currentClassId))
          ? String(currentClassId)
          : String(availableClasses[0]?.class_id || "");

        const performanceData = await fetchJson(`${API_BASE_URL}/student-performance-summary?student_id=${currentStudent.student_id}`);

        if (!cancelled) {
          setStudent(currentStudent);
          setClasses(availableClasses);
          setSelectedClass(classId);
          setPerformance(performanceData);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load AI learning data.");
        }
      } finally {
        if (!cancelled) {
          setLoadingPage(false);
        }
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSubjects() {
      if (!selectedClass) {
        setSubjects([]);
        setSelectedSubject("");
        return;
      }

      setLoadingSubjects(true);
      setSubjects([]);
      setSelectedSubject("");
      setChapters([]);
      setSelectedChapter("");
      setGeneratedContent(null);

      try {
        const data = await fetchJson(`${API_BASE_URL}/subjects?class_id=${selectedClass}`);
        if (!cancelled) {
          setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load subjects.");
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    }

    loadSubjects();

    return () => {
      cancelled = true;
    };
  }, [selectedClass]);

  useEffect(() => {
    let cancelled = false;

    async function loadChapters() {
      if (!selectedClass || !selectedSubject) {
        setChapters([]);
        setSelectedChapter("");
        return;
      }

      setLoadingChapters(true);
      setChapters([]);
      setSelectedChapter("");
      setGeneratedContent(null);

      try {
        const params = new URLSearchParams({
          class_id: selectedClass,
          subject_id: selectedSubject
        });
        const data = await fetchJson(`${API_BASE_URL}/chapter-content-list?${params.toString()}`);
        if (!cancelled) {
          setChapters(Array.isArray(data.chapters) ? data.chapters : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load chapters.");
        }
      } finally {
        if (!cancelled) {
          setLoadingChapters(false);
        }
      }
    }

    loadChapters();

    return () => {
      cancelled = true;
    };
  }, [selectedClass, selectedSubject]);

  async function refreshPerformance() {
    if (!student?.student_id) {
      return;
    }

    setStatus("Refreshing performance summary...");
    setError("");

    try {
      const data = await fetchJson(`${API_BASE_URL}/student-performance-summary?student_id=${student.student_id}`);
      setPerformance(data);
      setStatus("Performance summary refreshed.");
    } catch (refreshError) {
      setError(refreshError.message || "Unable to refresh performance summary.");
    }
  }

  async function generateLearningPath() {
    if (!student || !performance) {
      return;
    }

    setGeneratingPath(true);
    setStatus("Generating AI learning path...");
    setError("");

    try {
      const data = await fetchJson(`${API_BASE_URL}/learning-path/generate-overall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: student.student_id,
          assignment_marks: performance.assignment_marks,
          quiz_score: performance.quiz_score,
          unit_test_marks: performance.unit_test_marks,
          retry_count: performance.retry_count
        })
      });
      setPerformance((current) => ({ ...(current || {}), ...data.metrics, classification: data.classification }));
      setLearningPath(data.learning_path);
      setStatus("AI learning path generated from overall performance.");
    } catch (generateError) {
      setError(generateError.message || "Unable to generate learning path.");
    } finally {
      setGeneratingPath(false);
    }
  }

  async function generateStudyContent() {
    if (!student || !selectedChapter) {
      setError("Please select a class, subject, and chapter before generating content.");
      return;
    }

    setGeneratingContent(true);
    setStatus("Generating AI study content...");
    setError("");

    try {
      const data = await fetchJson(`${API_BASE_URL}/ai/generate-study-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: student.student_id,
          chapter_content_id: Number(selectedChapter),
          classification
        })
      });
      setGeneratedContent(data);
      setStatus("AI study content generated for the selected chapter.");
    } catch (generateError) {
      setError(generateError.message || "Unable to generate study content.");
    } finally {
      setGeneratingContent(false);
    }
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <article className="module-card ai-learning-card">
            <div className="card-title-row">
              <div>
                <h2>AI Learning Path</h2>
                <p>Overall performance decides the learner path; selected chapter decides generated study content.</p>
              </div>
              <span className="status-pill completed">{classification}</span>
            </div>

            <div className="learning-track-grid">
              {learnerTracks.map((track) => (
                <section className={`learning-track ${classification === track.key ? "selected" : ""}`} key={track.key}>
                  <h3>{track.title}</h3>
                  <p>{track.description}</p>
                  <div className="track-marker-row">
                    {track.markers.map((marker) => <span key={marker}>{marker}</span>)}
                  </div>
                </section>
              ))}
            </div>

            <div className="result-grid">
              <div><span>Assignment Marks</span><strong>{metricValue(performance?.assignment_marks)}%</strong></div>
              <div><span>Quiz Result</span><strong>{metricValue(performance?.quiz_score)}%</strong></div>
              <div><span>Unit Test Marks</span><strong>{metricValue(performance?.unit_test_marks)}%</strong></div>
              <div><span>Retry Count</span><strong>{performance?.retry_count ?? 0}</strong></div>
            </div>

            <div className="learning-form-grid">
              <label>
                <span>Class</span>
                <select value={selectedClass} disabled={loadingPage} onChange={(event) => setSelectedClass(event.target.value)}>
                  <option value="" disabled>Select Class</option>
                  {classes.map((classItem) => (
                    <option value={classItem.class_id} key={classItem.class_id}>
                      {classItem.class_name}{classItem.section_name ? ` - ${classItem.section_name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Subject</span>
                <select value={selectedSubject} disabled={!selectedClass || loadingSubjects} onChange={(event) => setSelectedSubject(event.target.value)}>
                  <option value="" disabled>{loadingSubjects ? "Loading Subjects" : "Select Subject"}</option>
                  {subjects.map((subject) => (
                    <option value={subject.subject_id} key={subject.subject_id}>{subject.subject_name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Chapter</span>
                <select value={selectedChapter} disabled={!selectedSubject || loadingChapters} onChange={(event) => setSelectedChapter(event.target.value)}>
                  <option value="" disabled>{loadingChapters ? "Loading Chapters" : "Select Chapter"}</option>
                  {chapters.map((chapter) => (
                    <option value={chapter.chapter_content_id} key={chapter.chapter_content_id}>{chapter.content_title}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="quiz-submit-row">
              <button className="soft-button" type="button" onClick={refreshPerformance} disabled={loadingPage}>Refresh Performance</button>
              <button className="primary-button" type="button" onClick={generateLearningPath} disabled={!performance || generatingPath}>
                {generatingPath ? "Generating..." : "Generate Path"}
              </button>
              <button className="primary-button" type="button" onClick={generateStudyContent} disabled={!selectedChapter || generatingContent}>
                {generatingContent ? "Generating..." : "Generate Content"}
              </button>
            </div>

            {status && <div className="learning-status success" role="status">{status}</div>}
            {error && <div className="learning-status error" role="alert">{error}</div>}
          </article>

          {learningPath && (
            <article className="module-card generated-path-card">
              <div className="card-title-row">
                <div>
                  <h2>{learningPath.track_title}</h2>
                  <p>{learningPath.summary}</p>
                </div>
                <span className="status-pill in-progress">{learningPath.provider}</span>
              </div>
              <div className="learning-focus-box">
                <strong>Focus Area</strong>
                <p>{learningPath.focus_area}</p>
              </div>
              <ol className="learning-step-list">
                {(learningPath.steps || []).map((step) => <li key={step}>{step}</li>)}
              </ol>
              <div className="recommended-materials">
                <h3>Recommended Material</h3>
                {(learningPath.recommended_materials || []).map((material) => <span key={material}>{material}</span>)}
              </div>
            </article>
          )}

          {generatedContent && (
            <article className="module-card generated-content-preview-card">
              <div className="card-title-row">
                <div>
                  <h2>{generatedContent.chapter_title}</h2>
                  <p>AI generated study content for {generatedContent.classification}.</p>
                </div>
                <span className="status-pill not-started">Generated Content</span>
              </div>

              <div className="content-preview-layout">
                <section className="content-preview-main">
                  <div className="preview-section-head">
                    <span className="preview-icon notes" aria-hidden="true" />
                    <div>
                      <h3>Simple Notes</h3>
                      <p>{(generatedContent.generated_content?.simple_notes || []).join(" ")}</p>
                    </div>
                  </div>
                  <div className="learning-focus-box">
                    <strong>Recap</strong>
                    <p>{generatedContent.generated_content?.recap || "-"}</p>
                  </div>
                  <ol className="learning-step-list">
                    {(generatedContent.generated_content?.practice_questions || []).map((question) => <li key={question}>{question}</li>)}
                  </ol>
                </section>

                <aside className="content-preview-side">
                  <section>
                    <h3>Key Terms</h3>
                    <div className="preview-check-list">
                      {(generatedContent.generated_content?.key_terms || []).map((item) => (
                        <span key={`${item.term}-${item.meaning}`}>{item.term}: {item.meaning}</span>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
            </article>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
