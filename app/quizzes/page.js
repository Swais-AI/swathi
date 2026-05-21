"use client";

import { useMemo, useState } from "react";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const chapterTitle = "Democratic India";

const questions = [
  {
    question: "What does democracy mean?",
    options: ["Rule by the people", "Rule by one king", "Rule by the army", "Rule by one company"],
    answer: 0
  },
  {
    question: "Which document gives India its democratic principles and rules?",
    options: ["The Census Report", "The Constitution of India", "The Railway Act", "The School Diary"],
    answer: 1
  },
  {
    question: "Who elects representatives in democratic India?",
    options: ["Only judges", "Citizens through voting", "Only police officers", "Foreign governments"],
    answer: 1
  },
  {
    question: "Which right lets citizens express their ideas and opinions?",
    options: ["Right to Freedom", "Right to Delete Laws", "Right to Rule Alone", "Right to Avoid Elections"],
    answer: 0
  },
  {
    question: "Why are regular elections important in a democracy?",
    options: ["They let citizens choose or change leaders", "They stop citizens from voting", "They remove all laws", "They end public participation"],
    answer: 0
  }
];

export default function QuizzesPage() {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [quizRequested, setQuizRequested] = useState(false);

  const score = useMemo(() => {
    return questions.reduce((total, question, index) => {
      return answers[index] === question.answer ? total + 1 : total;
    }, 0);
  }, [answers]);

  const allAnswered = Object.keys(answers).length === questions.length;
  const marks = score * 5;

  function handleAskAi() {
    setQuizRequested(true);
    setAnswers({});
    setSubmitted(false);
  }

  function handleSubmit() {
    if (allAnswered) {
      setSubmitted(true);
    }
  }

  function handleReset() {
    setAnswers({});
    setSubmitted(false);
    setQuizRequested(false);
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <div className="quiz-layout">
            <article className="module-card quiz-card">
              <div className="card-title-row">
                <h2>{chapterTitle}</h2>
                <span className={`status-pill ${submitted ? "completed" : "not-attempted"}`}>{submitted ? "Completed" : "Not Attempted"}</span>
              </div>
              <div className="meta-row">
                <span>Total Marks: 25</span>
                <span>Questions: {quizRequested ? questions.length : 0}</span>
                <span>Duration: 30 mins</span>
              </div>

              {!quizRequested && (
                <div className="quiz-submit-row">
                  <button className="primary-button" type="button" onClick={handleAskAi}>Ask AI</button>
                </div>
              )}

              {quizRequested && (
                <>
                  <div className="quiz-question-list">
                    {questions.map((item, questionIndex) => (
                      <fieldset className="quiz-question" key={item.question} disabled={submitted}>
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
                      </fieldset>
                    ))}
                  </div>

                  {!allAnswered && !submitted && <p className="quiz-warning">Please answer all 5 questions before submitting.</p>}

                  <div className="quiz-submit-row">
                    <button className="primary-button" type="button" onClick={handleSubmit} disabled={!allAnswered || submitted}>Submit Quiz</button>
                    <button className="soft-button" type="button" onClick={handleReset}>Reset</button>
                  </div>
                </>
              )}
            </article>

            <article className="module-card latest-result-card">
              <h2>Quiz Result</h2>
              <div className="result-grid quiz-result-grid">
                <div><span>Chapter Title</span><strong>{chapterTitle}</strong></div>
                <div><span>Score</span><strong className="score-text">{submitted ? `${marks} / 25` : "- / 25"}</strong></div>
                <div><span>Correct Answers</span><strong>{submitted ? `${score} / 5` : "-"}</strong></div>
                <div><span>Status</span><strong>{submitted ? "Completed" : quizRequested ? "In Progress" : "Pending"}</strong></div>
              </div>
              {submitted && (
                <div className="quiz-score-card">
                  <strong>{marks >= 20 ? "Excellent work!" : marks >= 15 ? "Good attempt!" : "Keep practicing!"}</strong>
                  <p>You scored {marks} marks out of 25.</p>
                </div>
              )}
            </article>
          </div>
          <div className="note-box">Click Ask AI to show quiz questions for the selected chapter.</div>
        </div>
      </section>
    </DashboardShell>
  );
}
