"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import { getLoggedInUserEmail } from "../login-session";
import AppSelect from "../app-select";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";
import StudentAnalysisView from "./student-analysis-view";

const API_BASE_URL = getApiBaseUrl();
const MOCK_TEST_DURATION_SECONDS = 15 * 60;

const unitTest = {
  title: "Unit Test",
  subject: "Social Science",
  chapter: "Democratic India",
  question: "Explain why elections are important in a democratic country like India.",
  studentAnswer: "Elections are important because people can choose their leaders. If leaders do not work properly, citizens can vote for another leader in the next election.",
  aiAnswer: "Elections are important in democratic India because they give citizens the power to choose their representatives. Regular elections make leaders accountable to the people, protect public participation, and allow citizens to peacefully change the government when they are not satisfied."
};

function TeacherRemarkView() {
  return (
    <section className="module-card teacher-remark-empty" aria-live="polite">
      <div className="teacher-remark-icon" aria-hidden="true">&#9998;</div>
      <h2>No teacher remarks yet</h2>
      <p>Your teacher&apos;s feedback and remarks will appear here after an assessment is reviewed.</p>
    </section>
  );
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function formatMockTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function MockTestView() {
  const [mockTestChapters, setMockTestChapters] = useState([]);
  const [chapterId, setChapterId] = useState("");
  const [chapterTitle, setChapterTitle] = useState("Select Chapter");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [reviewed, setReviewed] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MOCK_TEST_DURATION_SECONDS);
  const [phase, setPhase] = useState("setup");
  const [loading, setLoading] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [error, setError] = useState("");
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const selectedChapter = useMemo(
    () => mockTestChapters.find((chapter) => String(chapter.chapter_id) === String(chapterId)) || null,
    [chapterId, mockTestChapters]
  );
  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () => questions.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0),
    [answers, questions]
  );
  const activeQuestion = questions[currentQuestion];

  useEffect(() => {
    let cancelled = false;

    async function loadMockTestChapters() {
      setLoadingChapters(true);
      setError("");

      try {
        const response = await fetch(`${API_BASE_URL}/quiz-chapters`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load mock-test chapters.");
        }

        const availableChapters = Array.isArray(data.chapters) ? data.chapters : [];
        if (!cancelled) {
          setMockTestChapters(availableChapters);
          const firstChapter = availableChapters[0];
          setChapterId(firstChapter ? String(firstChapter.chapter_id) : "");
          setChapterTitle(firstChapter?.content_title || "Select Chapter");
          if (availableChapters.length === 0) {
            setError("No linked chapter content is available for mock-test generation.");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load mock-test chapters.");
        }
      } finally {
        if (!cancelled) {
          setLoadingChapters(false);
        }
      }
    }

    loadMockTestChapters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "testing") return undefined;

    if (timeLeft <= 0) {
      setAutoSubmitted(true);
      setPhase("results");
      setShowSubmitConfirmation(false);
      return undefined;
    }

    const timerId = window.setTimeout(() => setTimeLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timerId);
  }, [phase, timeLeft]);

  async function generateMockTest() {
    if (!selectedChapter) {
      setError("Select a chapter before generating the mock test.");
      return;
    }

    setLoading(true);
    setError("");
    setQuestions([]);
    setAnswers({});
    setReviewed([]);
    setCurrentQuestion(0);
    setTimeLeft(MOCK_TEST_DURATION_SECONDS);
    setPhase("setup");
    setAutoSubmitted(false);

    try {
      const userEmail = await getLoggedInUserEmail();
      const response = await fetchWithTimeout(`${API_BASE_URL}/ai/generate-mock-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: Number(chapterId), user_email: userEmail })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to generate mock test.");
      }

      const generatedQuestions = Array.isArray(data.quiz) ? data.quiz : [];
      if (generatedQuestions.length !== 5) {
        throw new Error("AI must return exactly 5 valid questions. Please generate again.");
      }

      setQuestions(generatedQuestions);
      setChapterTitle(data.chapter_title || selectedChapter.content_title);
      setTimeLeft(Number(data.duration_minutes || 15) * 60);
      setPhase("testing");
    } catch (generationError) {
      setError(
        generationError.name === "AbortError"
          ? "AI question generation timed out. Please try again."
          : generationError.message
      );
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(optionIndex) {
    if (phase !== "testing") return;
    setAnswers((current) => ({ ...current, [currentQuestion]: optionIndex }));
  }

  function toggleReview() {
    setReviewed((current) => (
      current.includes(currentQuestion)
        ? current.filter((index) => index !== currentQuestion)
        : [...current, currentQuestion]
    ));
  }

  function submitMockTest() {
    setPhase("results");
    setShowSubmitConfirmation(false);
  }

  function resetMockTest() {
    setQuestions([]);
    setAnswers({});
    setReviewed([]);
    setCurrentQuestion(0);
    setTimeLeft(MOCK_TEST_DURATION_SECONDS);
    setPhase("setup");
    setError("");
    setAutoSubmitted(false);
    setShowSubmitConfirmation(false);
    setChapterTitle(selectedChapter.title);
  }

  const percentage = questions.length ? Math.round((score / questions.length) * 100) : 0;

  return (
    <section className="mock-test-view">
      {phase === "setup" && (
        <article className="module-card mock-test-setup-card">
          <div className="mock-test-setup-copy">
            <span className="mock-test-kicker">AI-powered practice exam</span>
            <h2>Generate a 5-Question Mock Test</h2>
            <p>AI will create exactly five multiple-choice questions from the selected chapter.</p>
          </div>

          <div className="mock-test-instructions">
            <div><strong>5</strong><span>Questions</span></div>
            <div><strong>15 min</strong><span>Duration</span></div>
            <div><strong>5</strong><span>Total Marks</span></div>
          </div>

          <label className="mock-test-chapter-field">
            <span>Select Chapter</span>
            <AppSelect
              value={chapterId}
              options={mockTestChapters.map((chapter) => ({
                value: chapter.chapter_id,
                label: chapter.content_title
              }))}
              onChange={(value) => {
                const nextChapter = mockTestChapters.find((chapter) => String(chapter.chapter_id) === String(value));
                setChapterId(String(value));
                setChapterTitle(nextChapter?.content_title || "Select Chapter");
                setError("");
              }}
              disabled={loading || loadingChapters || mockTestChapters.length === 0}
              placeholder={loadingChapters ? "Loading Chapters..." : "Select Chapter"}
              ariaLabel="Select mock test chapter"
              searchable
            />
          </label>

          {error && <div className="learning-status error" role="alert">{error}</div>}
          <div className="quiz-submit-row">
            <button className="primary-button" type="button" onClick={generateMockTest} disabled={loading || loadingChapters || !selectedChapter}>
              {loading ? "AI is generating 5 questions..." : "Generate Mock Test"}
            </button>
          </div>
          {loading && <p className="mock-generation-note">This may take a few seconds. Questions are generated only from the selected chapter content.</p>}
        </article>
      )}

      {(phase === "testing" || phase === "results") && (
        <div className="mock-test-layout">
          <article className="module-card mock-question-card">
            <div className="mock-question-head">
              <div>
                <span>Question {currentQuestion + 1} of 5</span>
                <h2>{chapterTitle}</h2>
              </div>
              <span className={`mock-timer ${timeLeft <= 120 && phase === "testing" ? "urgent" : ""}`}>
                {phase === "results" ? "Completed" : formatMockTimer(timeLeft)}
              </span>
            </div>

            {activeQuestion && (
              <fieldset className="quiz-question mock-question" disabled={phase === "results"}>
                <legend>{currentQuestion + 1}. {activeQuestion.question}</legend>
                <div className="quiz-options">
                  {activeQuestion.options.map((option, optionIndex) => {
                    const selected = answers[currentQuestion] === optionIndex;
                    const correct = phase === "results" && activeQuestion.answer === optionIndex;
                    const wrong = phase === "results" && selected && activeQuestion.answer !== optionIndex;

                    return (
                      <label
                        className={`quiz-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                        key={option}
                      >
                        <input
                          type="radio"
                          name={`mock-question-${currentQuestion}`}
                          checked={selected}
                          onChange={() => selectAnswer(optionIndex)}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
                {phase === "results" && (
                  <p className="quiz-explanation">
                    <strong>{answers[currentQuestion] === activeQuestion.answer ? "Correct. " : "Correct answer shown above. "}</strong>
                    {activeQuestion.explanation || "Review this topic in the chapter material."}
                  </p>
                )}
              </fieldset>
            )}

            <div className="mock-question-actions">
              <button className="soft-button" type="button" onClick={() => setCurrentQuestion((current) => Math.max(0, current - 1))} disabled={currentQuestion === 0}>Previous</button>
              {phase === "testing" && (
                <button className={`soft-button ${reviewed.includes(currentQuestion) ? "review-active" : ""}`} type="button" onClick={toggleReview}>
                  {reviewed.includes(currentQuestion) ? "Remove Review Mark" : "Mark for Review"}
                </button>
              )}
              <button className="soft-button" type="button" onClick={() => setCurrentQuestion((current) => Math.min(4, current + 1))} disabled={currentQuestion === 4}>Next</button>
            </div>
          </article>

          <aside className="module-card mock-test-sidebar">
            <h2>{phase === "results" ? "Mock Test Result" : "Question Palette"}</h2>
            <div className="mock-question-palette">
              {questions.map((question, index) => (
                <button
                  className={`${currentQuestion === index ? "current" : ""} ${answers[index] !== undefined ? "answered" : ""} ${reviewed.includes(index) ? "reviewed" : ""}`}
                  type="button"
                  onClick={() => setCurrentQuestion(index)}
                  key={question.question}
                  aria-label={`Open question ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            {phase === "testing" ? (
              <>
                <div className="mock-progress-details">
                  <div><span>Answered</span><strong>{answeredCount}/5</strong></div>
                  <div><span>For Review</span><strong>{reviewed.length}</strong></div>
                  <div><span>Unanswered</span><strong>{5 - answeredCount}</strong></div>
                </div>
                <button className="primary-button mock-submit-button" type="button" onClick={() => setShowSubmitConfirmation(true)}>Submit Mock Test</button>
              </>
            ) : (
              <>
                {autoSubmitted && <div className="submission-warning">Time completed, so the mock test was submitted automatically.</div>}
                <div className="mock-score">
                  <strong>{score} / 5</strong>
                  <span>{percentage}%</span>
                </div>
                <p className="mock-result-message">
                  {percentage >= 80 ? "Excellent work!" : percentage >= 60 ? "Good attempt—review the explanations." : "Keep practicing this chapter."}
                </p>
                <button className="primary-button mock-submit-button" type="button" onClick={resetMockTest}>Generate New Test</button>
              </>
            )}
          </aside>
        </div>
      )}

      {showSubmitConfirmation && (
        <div className="confirmation-backdrop" role="presentation">
          <section className="submission-confirmation" role="dialog" aria-modal="true" aria-labelledby="mock-submit-title">
            <div className="confirmation-icon">?</div>
            <h2 id="mock-submit-title">Submit Mock Test?</h2>
            <p>You answered {answeredCount} of 5 questions.</p>
            {answeredCount < 5 && <div className="submission-warning">{5 - answeredCount} question(s) are unanswered.</div>}
            <div className="confirmation-actions">
              <button className="soft-button" type="button" onClick={() => setShowSubmitConfirmation(false)}>Continue Test</button>
              <button className="primary-button" type="button" onClick={submitMockTest}>Submit Now</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default function AssessmentsPage() {
  const [activeOption, setActiveOption] = useState("unit-test");
  const [showEvaluation, setShowEvaluation] = useState(false);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "mock-test") {
      setActiveOption("mock-test");
    }
  }, []);

  function handleUnitTest() {
    setActiveOption("unit-test");
    setShowEvaluation(false);
  }

  function handleAiEvaluation() {
    setActiveOption("unit-test");
    setShowEvaluation(true);
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area assessment-content-area">
          <div className="module-action-grid assessment-option-grid">
            <button className={`module-action ${activeOption === "unit-test" ? "active" : ""}`} type="button" onClick={handleUnitTest}>Unit Test</button>
            <button
              className={`module-action ${activeOption === "mock-test" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveOption("mock-test");
                setShowEvaluation(false);
              }}
            >
              Mock Test
            </button>
            <button className={`module-action ${activeOption === "student-analysis" ? "active" : ""}`} type="button" onClick={() => setActiveOption("student-analysis")}>Student Analysis</button>
            <button className={`module-action ${activeOption === "teacher-remark" ? "active" : ""}`} type="button" onClick={() => setActiveOption("teacher-remark")}>Teacher Remark</button>
          </div>

          {activeOption === "unit-test" && (
            <div className="quiz-layout assessment-layout">
              <article className="module-card purple-module">
                <div className="card-title-row">
                  <h2>{unitTest.title}</h2>
                  <span className={`status-pill ${showEvaluation ? "completed" : "in-progress"}`}>{showEvaluation ? "Evaluated" : "Ready"}</span>
                </div>

                <div className="meta-row">
                  <span>{unitTest.subject}</span>
                  <span>{unitTest.chapter}</span>
                  <span>Total Marks: 10</span>
                </div>

                <div className="quiz-question-list">
                  <fieldset className="quiz-question">
                    <legend>1. {unitTest.question}</legend>
                    <div className="assessment-answer-box">
                      <span>Student Answer</span>
                      <p>{unitTest.studentAnswer}</p>
                    </div>
                  </fieldset>
                </div>

                <div className="quiz-submit-row">
                  <button className="primary-button" type="button" onClick={handleAiEvaluation}>AI Evaluation</button>
                  <button className="soft-button" type="button" onClick={handleUnitTest}>Reset</button>
                </div>
              </article>

              <article className="module-card latest-result-card">
                <h2>AI Evaluation</h2>
                <div className="result-grid quiz-result-grid">
                  <div><span>Chapter</span><strong>{unitTest.chapter}</strong></div>
                  <div><span>Score</span><strong className="score-text">{showEvaluation ? "8 / 10" : "- / 10"}</strong></div>
                  <div><span>Status</span><strong>{showEvaluation ? "Completed" : "Pending"}</strong></div>
                </div>

                {showEvaluation && (
                  <div className="quiz-score-card assessment-ai-card">
                    <strong>AI Answer</strong>
                    <p>{unitTest.aiAnswer}</p>
                    <strong>Feedback</strong>
                    <p>Your answer is correct and clear. Add points about accountability and peaceful change of government to make it stronger.</p>
                  </div>
                )}
              </article>
            </div>
          )}

          {activeOption === "mock-test" && <MockTestView />}
          {activeOption === "student-analysis" && <StudentAnalysisView />}
          {activeOption === "teacher-remark" && <TeacherRemarkView />}
        </div>
      </section>
    </DashboardShell>
  );
}
