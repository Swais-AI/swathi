"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();

function toPercent(score, totalMarks) {
  const scoreValue = Number(score || 0);
  const totalValue = Number(totalMarks || 100);
  if (!totalValue) return 0;
  return Math.round((scoreValue / totalValue) * 100);
}

function formatDate(dateValue) {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function MiniBars() {
  return (
    <span className="mini-bars" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function LineChart({ labels, values, dashed = false }) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? 330 / (safeValues.length - 1) : 58;
  const points = safeValues.map((value, index) => `${24 + index * step},${150 - (value / max) * 116}`).join(" ");

  return (
    <div className="chart-panel">
      <svg viewBox="0 0 380 190" role="img" aria-label="Growth trend chart">
        {[40, 75, 110, 145].map((y) => <line className="chart-grid-line" x1="18" x2="354" y1={y} y2={y} key={y} />)}
        <polyline className={dashed ? "line-dashed" : "line-solid"} points={points} />
        {safeValues.map((value, index) => {
          const x = 24 + index * step;
          const y = 150 - (value / max) * 116;
          return <circle className="line-dot" cx={x} cy={y} r="5" key={`${value}-${index}`} />;
        })}
      </svg>
      <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
    </div>
  );
}

function RingChart({ label, caption }) {
  return (
    <div className="ring-chart">
      <div className="ring-number">{label}</div>
      <span>{caption}</span>
    </div>
  );
}

function FeedbackMarksView({ feedback, loading, error }) {
  return (
    <article className="module-card purple-module">
      <h2>Feedback & Marks</h2>
      {error && <div className="learning-status error" role="alert">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Assessment</th>
            <th>Marks</th>
            <th>Score</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan="6" className="table-message-cell">Loading feedback and marks...</td></tr>}
          {!loading && !error && feedback.length === 0 && <tr><td colSpan="6" className="table-message-cell">No feedback and marks found.</td></tr>}
          {!loading && feedback.map((item, index) => {
            const percent = toPercent(item.score, item.total_marks);
            return (
              <tr key={item.response_id}>
                <td>{index + 1}</td>
                <td>{item.assessment_title}</td>
                <td>{Number(item.score || 0)} / {Number(item.total_marks || 100)}</td>
                <td><span className={`status-pill ${percent >= 75 ? "completed" : percent >= 50 ? "in-progress" : "overdue"}`}>{percent}%</span></td>
                <td>{item.completed_flag ? "Completed" : "Pending"}</td>
                <td>{formatDate(item.created_datetime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}

function TestListView({ title, assessments, loading, error }) {
  return (
    <article className="module-card purple-module">
      <h2>{title}</h2>
      {error && <div className="learning-status error" role="alert">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Test Title</th>
            <th>Total Marks</th>
            <th>Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan="5" className="table-message-cell">Loading assessments...</td></tr>}
          {!loading && !error && assessments.length === 0 && <tr><td colSpan="5" className="table-message-cell">No assessments found.</td></tr>}
          {!loading && assessments.map((item, index) => (
            <tr key={item.response_id}>
              <td>{index + 1}</td>
              <td>{item.assessment_title}</td>
              <td>{Number(item.total_marks || 100)}</td>
              <td>{Number(item.score || 0)}</td>
              <td><span className={`status-pill ${item.completed_flag ? "completed" : "not-started"}`}>{item.completed_flag ? "Completed" : "Pending"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function StudentAnalysisView({ analysis, loading, error }) {
  const assessments = analysis?.assessments || [];
  const summary = analysis?.summary || {};
  const average = Math.round(Number(summary.average_percent || 0));
  const labels = assessments.map((item) => item.assessment_title.replace(/^(Unit Test|Mock Test|Quiz|Assessment) - /, ""));
  const values = assessments.map((item) => toPercent(item.score, item.total_marks));

  return (
    <section className="assessment-dashboard student-analysis-view">
      <div className="assessment-dashboard-head">
        <h2>Student Analysis</h2>
        <div className="tiny-avatar">AS</div>
      </div>
      {error && <div className="learning-status error" role="alert">{error}</div>}
      {loading && <div className="table-message-cell">Loading student analysis...</div>}
      {!loading && (
        <div className="analysis-grid">
          <article className="analysis-card performance-card">
            <h3>Overall Performance</h3>
            <p>Average of all assessment scores</p>
            <div className="performance-row">
              <RingChart label={`${average}%`} caption="Overall Average" />
              <div className="legend-list subjects">
                <span>Tests: {Number(summary.assessment_count || 0)}</span>
                <span>Best: {Math.round(Number(summary.best_percent || 0))}%</span>
                <span>Lowest: {Math.round(Number(summary.lowest_percent || 0))}%</span>
                <span>Average: {average}%</span>
              </div>
            </div>
          </article>
          <article className="analysis-card">
            <h3>Result Timeline</h3>
            <LineChart labels={labels} values={values} />
          </article>
          <article className="analysis-card">
            <h3>Detailed Performance</h3>
            <div className="test-performance-list">
              {assessments.map((item) => (
                <div className="test-row" key={item.response_id}>
                  <strong>{item.assessment_title}</strong>
                  <span>{Number(item.score || 0)} / {Number(item.total_marks || 100)} | {toPercent(item.score, item.total_marks)}%</span>
                </div>
              ))}
            </div>
          </article>
          <article className="analysis-card">
            <h3>Learning Progress</h3>
            <div className="learner-list">
              {assessments.map((item) => (
                <div className="learner-row" key={item.response_id}>
                  <i className={toPercent(item.score, item.total_marks) >= 80 ? "green" : toPercent(item.score, item.total_marks) >= 60 ? "yellow" : "red"} />
                  <span>{item.assessment_title}</span>
                  <MiniBars />
                  <strong>{toPercent(item.score, item.total_marks)}%</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function TeacherRemarkView({ remarks, loading, error }) {
  return (
    <section className="assessment-dashboard">
      <div className="assessment-dashboard-head">
        <h2>Teacher Remark</h2>
        <div className="dashboard-actions"><span>!</span><span>...</span><div className="tiny-avatar">AS</div></div>
      </div>
      {error && <div className="learning-status error" role="alert">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Teacher</th>
            <th>Marks</th>
            <th>Remark</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan="6" className="table-message-cell">Loading teacher remarks...</td></tr>}
          {!loading && !error && remarks.length === 0 && <tr><td colSpan="6" className="table-message-cell">No teacher remarks found.</td></tr>}
          {!loading && remarks.map((remark, index) => (
            <tr key={remark.submission_id}>
              <td>{index + 1}</td>
              <td>{remark.item_title}</td>
              <td>{remark.teacher_name || "-"}</td>
              <td>{remark.marks_obtained ?? "-"}</td>
              <td>{remark.teacher_remarks || "-"}</td>
              <td>{formatDate(remark.submitted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function AssessmentsPage() {
  const [activeOption, setActiveOption] = useState("unit-test");
  const [studentId, setStudentId] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStudent() {
      try {
        const response = await fetch(`${API_BASE_URL}/students/current`);
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data.student?.student_id) {
          setStudentId(data.student.student_id);
        }
      } catch {
        if (!cancelled) setError("Unable to load the current student.");
      }
    }
    loadStudent();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAssessmentData() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (studentId) params.set("student_id", String(studentId));
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const [feedbackResponse, analysisResponse, remarksResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/assessment-feedback${suffix}`),
          fetch(`${API_BASE_URL}/student-analysis${suffix}`),
          fetch(`${API_BASE_URL}/teacher-remarks${suffix}`)
        ]);
        const [feedbackData, analysisData, remarksData] = await Promise.all([
          feedbackResponse.json().catch(() => ({})),
          analysisResponse.json().catch(() => ({})),
          remarksResponse.json().catch(() => ({}))
        ]);
        if (!feedbackResponse.ok) throw new Error(feedbackData.detail || "Unable to load assessment feedback.");
        if (!analysisResponse.ok) throw new Error(analysisData.detail || "Unable to load student analysis.");
        if (!remarksResponse.ok) throw new Error(remarksData.detail || "Unable to load teacher remarks.");
        if (!cancelled) {
          setFeedback(Array.isArray(feedbackData.feedback) ? feedbackData.feedback : []);
          setAnalysis(analysisData);
          setRemarks(Array.isArray(remarksData.remarks) ? remarksData.remarks : []);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Unable to load assessment data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAssessmentData();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const unitTests = useMemo(() => feedback.filter((item) => item.assessment_title.toLowerCase().includes("unit")), [feedback]);
  const mockTests = useMemo(() => feedback.filter((item) => item.assessment_title.toLowerCase().includes("mock")), [feedback]);

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area assessment-content-area">
          <div className="module-action-grid assessment-option-grid">
            <button className={`module-action ${activeOption === "unit-test" ? "active" : ""}`} type="button" onClick={() => setActiveOption("unit-test")}>Unit Test</button>
            <button className={`module-action ${activeOption === "mock-test" ? "active" : ""}`} type="button" onClick={() => setActiveOption("mock-test")}>Mock Test</button>
            <button className={`module-action ${activeOption === "feedback" ? "active" : ""}`} type="button" onClick={() => setActiveOption("feedback")}>Feedback & Marks</button>
            <button className={`module-action ${activeOption === "student-analysis" ? "active" : ""}`} type="button" onClick={() => setActiveOption("student-analysis")}>Student Analysis</button>
            <button className={`module-action ${activeOption === "teacher-remark" ? "active" : ""}`} type="button" onClick={() => setActiveOption("teacher-remark")}>Teacher Remark</button>
          </div>

          {activeOption === "unit-test" && <TestListView title="Unit Test" assessments={unitTests} loading={loading} error={error} />}
          {activeOption === "mock-test" && <TestListView title="Mock Test" assessments={mockTests} loading={loading} error={error} />}
          {activeOption === "feedback" && <FeedbackMarksView feedback={feedback} loading={loading} error={error} />}
          {activeOption === "student-analysis" && <StudentAnalysisView analysis={analysis} loading={loading} error={error} />}
          {activeOption === "teacher-remark" && <TeacherRemarkView remarks={remarks} loading={loading} error={error} />}
        </div>
      </section>
    </DashboardShell>
  );
}
