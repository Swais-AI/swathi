"use client";

import { useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const AI_REQUEST_DELAY_MS = 15000;
const chapters = [
  { id: 1, title: "Democratic India", subject: "Social Science", lesson: "Lesson 1" },
  { id: 2, title: "Constitutional Values", subject: "Social Science", lesson: "Lesson 2" },
  { id: 3, title: "Local Government", subject: "Social Science", lesson: "Lesson 3" }
];

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

function waitBeforeAiRequest() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, AI_REQUEST_DELAY_MS);
  });
}

export default function QuizzesPage() {
  const [chapterId, setChapterId] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [chapterTitle, setChapterTitle] = useState(chapters[0].title);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [quizRequested, setQuizRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const selectedChapter = useMemo(() => {
    return chapters.find((chapter) => chapter.id === Number(chapterId)) || chapters[0];
  }, [chapterId]);

  const score = useMemo(() => {
    return questions.reduce((total, question, index) => {
      return answers[index] === question.answer ? total + 1 : total;
    }, 0);
  }, [answers, questions]);

  const allAnswered = questions.length > 0 && Object.keys(answers).length === questions.length;
  const totalMarks = questions.length * 5;
  const marks = score * 5;

  async function handleAskAi() {
    setQuizRequested(true);
    setLoading(true);
    setError("");
    setStatus("Generating AI quiz...");
    setAnswers({});
    setSubmitted(false);
    setQuestions([]);
    setChapterTitle(selectedChapter.title);

    try {
      await waitBeforeAiRequest();
      const response = await fetchWithTimeout(`${API_BASE_URL}/ai/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: Number(chapterId),
          question_count: 5
        })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to generate AI quiz.");
      }

      const generatedQuestions = Array.isArray(data.quiz) ? data.quiz : [];
      if (generatedQuestions.length === 0) {
        throw new Error("AI did not return any quiz questions.");
      }

      setQuestions(generatedQuestions);
      setChapterTitle(data.chapter_title || selectedChapter.title);
      setStatus("AI quiz generated. Select one answer for each question.");
    } catch (quizError) {
      setError(quizError.name === "AbortError" ? "AI quiz generation timed out. Please try again." : quizError.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit() {
    if (allAnswered) {
      setSubmitted(true);
      setStatus("Quiz auto-corrected.");
    }
  }

  function handleReset() {
    setAnswers({});
    setSubmitted(false);
    setQuizRequested(false);
    setQuestions([]);
    setError("");
    setStatus("");
  }

  function handleChapterChange(event) {
    setChapterId(Number(event.target.value));
    setAnswers({});
    setSubmitted(false);
    setQuizRequested(false);
    setQuestions([]);
    setError("");
    setStatus("");
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <div className="quiz-layout">
            <article className="module-card quiz-card">
              <div className="card-title-row material-title-row">
                <div>
                  <h2>{chapterTitle}</h2>
                  <p>AI generated MCQ quiz with instant auto correction.</p>
                </div>
                <span className={`status-pill ${submitted ? "completed" : "not-attempted"}`}>{submitted ? "Completed" : "Not Attempted"}</span>
              </div>

              <form className="material-filter-row quiz-filter-row" aria-label="Quiz filters">
                <select value={chapterId} aria-label="Select chapter" onChange={handleChapterChange} disabled={loading}>
                  {chapters.map((chapter) => (
                    <option value={chapter.id} key={chapter.id}>
                      {chapter.lesson} - {chapter.title}
                    </option>
                  ))}
                </select>
              </form>

              <div className="meta-row">
                <span>Total Marks: {totalMarks || 25}</span>
                <span>Questions: {questions.length}</span>
                <span>Duration: 30 mins</span>
              </div>

              {error && <div className="learning-status error" role="alert">{error}</div>}
              {status && <div className="learning-status success" role="status">{status}</div>}

              {(!quizRequested || error) && (
                <div className="quiz-submit-row">
                  <button className="primary-button" type="button" onClick={handleAskAi} disabled={loading}>
                    {loading ? "Generating..." : "Ask AI"}
                  </button>
                </div>
              )}

              {quizRequested && !error && (
                <>
                  {loading && <div className="table-message-cell">Generating questions from chapter content...</div>}

                  {!loading && (
                    <div className="quiz-question-list">
                      {questions.map((item, questionIndex) => (
                        <fieldset className="quiz-question" key={`${item.question}-${questionIndex}`} disabled={submitted}>
                          <legend>{questionIndex + 1}. {item.question}</legend>
                          <div className="quiz-options">
                            {item.options.map((option, optionIndex) => {
                              const optionId = `q-${questionIndex}-option-${optionIndex}`;
                              const selected = answers[questionIndex] === optionIndex;
                              const correct = submitted && item.answer === optionIndex;
                              const wrong = submitted && selected && item.answer !== optionIndex;

                              return (
                                <label className={`quiz-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`} htmlFor={optionId} key={option}>
                                  <input
                                    id={optionId}
                                    name={`question-${questionIndex}`}
                                    type="radio"
                                    checked={selected}
                                    onChange={() => setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))}
                                  />
                                  <span>{option}</span>
                                </label>
                              );
                            })}
                          </div>
                          {submitted && item.explanation && <p className="quiz-explanation">{item.explanation}</p>}
                        </fieldset>
                      ))}
                    </div>
                  )}

                  {!loading && !allAnswered && !submitted && <p className="quiz-warning">Please answer all {questions.length} questions before submitting.</p>}

                  {!loading && (
                    <div className="quiz-submit-row">
                      <button className="primary-button" type="button" onClick={handleSubmit} disabled={!allAnswered || submitted}>Submit Quiz</button>
                      <button className="soft-button" type="button" onClick={handleReset}>Reset</button>
                    </div>
                  )}
                </>
              )}
            </article>

            <article className="module-card latest-result-card">
              <h2>Quiz Result</h2>
              <div className="result-grid quiz-result-grid">
                <div><span>Chapter Title</span><strong>{chapterTitle}</strong></div>
                <div><span>Score</span><strong className="score-text">{submitted ? `${marks} / ${totalMarks}` : `- / ${totalMarks || 25}`}</strong></div>
                <div><span>Correct Answers</span><strong>{submitted ? `${score} / ${questions.length}` : "-"}</strong></div>
                <div><span>Status</span><strong>{submitted ? "Completed" : quizRequested && !error ? "In Progress" : "Pending"}</strong></div>
              </div>
              {submitted && (
                <div className="quiz-score-card">
                  <strong>{marks >= totalMarks * 0.8 ? "Excellent work!" : marks >= totalMarks * 0.6 ? "Good attempt!" : "Keep practicing!"}</strong>
                  <p>You scored {marks} marks out of {totalMarks}.</p>
                </div>
              )}
            </article>
          </div>
          <div className="note-box">Click Ask AI to generate a fresh quiz from the selected chapter, then submit for auto correction.</div>
        </div>
      </section>
    </DashboardShell>
  );
}
