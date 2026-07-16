"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import AppSelect from "../app-select";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const MOCK_TEST_DURATION_SECONDS = 15 * 60;
const mockTestChapters = [
  { id: 1, title: "Democratic India", subject: "Social Science" },
  { id: 2, title: "Constitutional Values", subject: "Social Science" },
  { id: 3, title: "Local Government", subject: "Social Science" }
];

const unitTest = {
  title: "Unit Test",
  subject: "Social Science",
  chapter: "Democratic India",
  question: "Explain why elections are important in a democratic country like India.",
  studentAnswer: "Elections are important because people can choose their leaders. If leaders do not work properly, citizens can vote for another leader in the next election.",
  aiAnswer: "Elections are important in democratic India because they give citizens the power to choose their representatives. Regular elections make leaders accountable to the people, protect public participation, and allow citizens to peacefully change the government when they are not satisfied."
};

const subjectScores = [
  ["Mathematics", "97%", "blue"],
  ["Science", "80%", "orange"],
  ["English", "78%", "teal"],
  ["Social Studies", "45%", "navy"]
];

const learners = [
  ["Aarav Sharma", "92%", "red"],
  ["Diya Patel", "78%", "yellow"],
  ["Rohan Verma", "85%", "green"],
  ["Meera Singh", "90%", "green"]
];

const testRows = [
  ["Quiz 1", ["Math: 97%", "Physics: 80%", "Chem: 88%"]],
  ["Project 1", ["Math: 95%", "Physics: 80%", "Chem: 82%"]],
  ["Unit Test 1", ["Math: 97%", "Physics: 80%", "Chem: 80%"]],
  ["Presentation 1", ["Math: 78%", "Physics: 85%", "Chem: 70%"]]
];

const focusRows = [
  ["Algebra", "72%", "92%", "blue"],
  ["Mechanics", "58%", "86%", "orange"],
  ["Organic Chemistry", "64%", "82%", "green"],
  ["Essay Writing", "66%", "84%", "green"]
];

function RingChart({ label = "365", caption = "Total Students" }) {
  return (
    <div className="ring-chart">
      <div className="ring-number">{label}</div>
      <span>{caption}</span>
    </div>
  );
}

function MiniBars() {
  return (
    <span className="mini-bars" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function LineChart({ labels, values, dashed = false }) {
  const max = Math.max(...values);
  const points = values.map((value, index) => `${24 + index * 58},${150 - (value / max) * 116}`).join(" ");

  return (
    <div className="chart-panel">
      <svg viewBox="0 0 380 190" role="img" aria-label="Growth trend chart">
        {[40, 75, 110, 145].map((y) => <line className="chart-grid-line" x1="18" x2="354" y1={y} y2={y} key={y} />)}
        <polyline className={dashed ? "line-dashed" : "line-solid"} points={points} />
        {values.map((value, index) => {
          const x = 24 + index * 58;
          const y = 150 - (value / max) * 116;
          return <circle className="line-dot" cx={x} cy={y} r="5" key={`${value}-${index}`} />;
        })}
      </svg>
      <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
    </div>
  );
}

function BarChart() {
  const bars = [42, 30, 48, 72, 60, 74, 104];

  return (
    <div className="bar-chart" aria-label="At-risk students by month">
      {bars.map((height, index) => (
        <div className="bar-stack" key={height}>
          <span style={{ height: `${height}px` }} />
          <i style={{ height: `${Math.max(18, height - 22)}px` }} />
        </div>
      ))}
      <div className="chart-labels">{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"].map((label) => <span key={label}>{label}</span>)}</div>
    </div>
  );
}

function Heatmap({ compact = false }) {
  const colors = ["green", "lime", "yellow", "orange", "red"];
  const rows = compact ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] : ["Mon", "Tue", "Wed", "Thu", "Sat"];
  const cols = compact ? ["Math", "Phys", "Chem", "Bio", "Eng"] : ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  return (
    <div className={`heatmap ${compact ? "subject-heatmap" : ""}`}>
      <div className="heatmap-body">
        {rows.map((row, rowIndex) => (
          <div className="heatmap-row" key={row}>
            <span>{row}</span>
            {cols.map((col, colIndex) => <i className={colors[(rowIndex + colIndex * 2) % colors.length]} key={`${row}-${col}`} />)}
          </div>
        ))}
      </div>
      <div className="heatmap-labels">{cols.map((col) => <span key={col}>{col}</span>)}</div>
    </div>
  );
}

function TeacherRemarkView() {
  return (
    <section className="assessment-dashboard">
      <div className="assessment-dashboard-head">
        <h2>Dashboard</h2>
        <div className="dashboard-actions"><span>!</span><span>...</span><div className="tiny-avatar">AS</div></div>
      </div>
      <div className="analysis-grid">
        <article className="analysis-card performance-card">
          <h3>Performance Overview</h3>
          <div className="performance-row">
            <RingChart />
            <div className="legend-list">
              {["Excellent 40%", "Good 30%", "Average 20%", "Needs Support 10%"].map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
        </article>
        <article className="analysis-card"><h3>At-Risk Students</h3><BarChart /></article>
        <article className="analysis-card">
          <h3>Top Subjects</h3>
          <div className="subject-list">{subjectScores.map(([name, score, tone]) => <div className="subject-row" key={name}><i className={tone}>{name[0]}</i><span>{name}</span><strong>{score}</strong></div>)}</div>
        </article>
        <article className="analysis-card"><h3>Engagement Heatmap</h3><Heatmap /></article>
        <article className="analysis-card">
          <h3>Learning Progress</h3>
          <div className="learner-list">{learners.map(([name, score, tone]) => <div className="learner-row" key={name}><i className={tone} /><div className="tiny-avatar">{name.split(" ").map((part) => part[0]).join("")}</div><span>{name}</span><MiniBars /><strong>{score}</strong></div>)}</div>
        </article>
        <article className="analysis-card"><h3>Growth Trend</h3><LineChart labels={["Jan", "Feb", "Mar", "Apr", "May", "Jun"]} values={[40, 210, 190, 340, 260, 420, 660]} /></article>
      </div>
    </section>
  );
}

function StudentAnalysisView() {
  return (
    <section className="assessment-dashboard student-analysis-view">
      <div className="assessment-dashboard-head">
        <h2>Student Self-Assessment: Academic Year 2023-24</h2>
        <div className="tiny-avatar">AS</div>
      </div>
      <div className="analysis-grid">
        <article className="analysis-card performance-card">
          <h3>Final Subject Performance</h3>
          <p>(Average of all Tests)</p>
          <div className="performance-row">
            <RingChart label="88%" caption="Overall Average" />
            <div className="legend-list subjects">{["Math", "Physics", "Chemistry", "Biology"].map((item) => <span key={item}>{item}</span>)}</div>
          </div>
        </article>
        <article className="analysis-card"><h3>Test Result Timeline</h3><LineChart labels={["Quarter 1", "Mid-Term", "Quarter 2", "Final Exam"]} values={[78, 80, 93, 94]} /></article>
        <article className="analysis-card">
          <h3>Detailed Test Performance by Subject</h3>
          <div className="test-performance-list">{testRows.map(([name, scores]) => <div className="test-row" key={name}><strong>{name}</strong><span>{scores.join("  |  ")}</span></div>)}</div>
        </article>
        <article className="analysis-card"><h3>Study Subject Distribution Heatmap</h3><Heatmap compact /></article>
        <article className="analysis-card">
          <h3>Focus Area Improvements</h3>
          <div className="focus-list">{focusRows.map(([name, before, after, tone]) => <div className="focus-row" key={name}><strong>{name}</strong><div><span style={{ width: before }} /><i className={tone} style={{ width: after }} /></div></div>)}</div>
        </article>
        <article className="analysis-card"><h3>Overall Growth Trend</h3><LineChart labels={["Quarter 1", "Mid-Term", "Quarter 2", "Final Exam"]} values={[20, 64, 85, 116]} dashed /></article>
      </div>
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
  const [chapterId, setChapterId] = useState(mockTestChapters[0].id);
  const [chapterTitle, setChapterTitle] = useState(mockTestChapters[0].title);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [reviewed, setReviewed] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MOCK_TEST_DURATION_SECONDS);
  const [phase, setPhase] = useState("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const selectedChapter = useMemo(
    () => mockTestChapters.find((chapter) => chapter.id === Number(chapterId)) || mockTestChapters[0],
    [chapterId]
  );
  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () => questions.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0),
    [answers, questions]
  );
  const activeQuestion = questions[currentQuestion];

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
      const response = await fetchWithTimeout(`${API_BASE_URL}/ai/generate-mock-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: Number(chapterId) })
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
      setChapterTitle(data.chapter_title || selectedChapter.title);
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
                value: chapter.id,
                label: `${chapter.subject} - ${chapter.title}`
              }))}
              onChange={(value) => {
                const nextId = Number(value);
                setChapterId(nextId);
                setChapterTitle(mockTestChapters.find((chapter) => chapter.id === nextId)?.title || "Chapter");
                setError("");
              }}
              disabled={loading}
              ariaLabel="Select mock test chapter"
              searchable
            />
          </label>

          {error && <div className="learning-status error" role="alert">{error}</div>}
          <div className="quiz-submit-row">
            <button className="primary-button" type="button" onClick={generateMockTest} disabled={loading}>
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
