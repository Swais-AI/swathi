"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const ACTIVE_ASSIGNMENT = {
  id: 2,
  title: "Data Privacy Analysis",
  dueDate: "28 May 2024",
  maxMarks: 25
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const supportedFileTypes = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

const assignments = [
  ["1", "AI Ethics Case Study", "20 May 2024", "Submitted", "View"],
  ["2", "Data Privacy Analysis", "28 May 2024", "In Progress", "Continue"],
  ["3", "Logistics Problem Set", "05 Jun 2024", "Not Started", "Start"],
  ["4", "Algorithm Bias Report", "12 Jun 2024", "Not Started", "Start"],
  ["5", "Sustainable Supply Chain", "20 Jun 2024", "Not Started", "Start"]
];

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.readAsDataURL(file);
  });
}

export default function AssignmentsPage() {
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [savedSubmission, setSavedSubmission] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentStudent() {
      try {
        const response = await fetch(`${API_BASE_URL}/students/current`);
        const data = await response.json().catch(() => ({}));

        if (!cancelled && response.ok && data.student?.student_id) {
          setStudentId(data.student.student_id);
        }
      } catch {
        if (!cancelled) {
          setError("Current student load nahi ho paya.");
        }
      }
    }

    loadCurrentStudent();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleFileSelect(file) {
    setError("");

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setError("File size 10 MB se kam honi chahiye.");
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isSupported = supportedFileTypes.some((extension) => lowerName.endsWith(extension));

    if (!isSupported) {
      setSelectedFile(null);
      setError("Sirf PDF, DOC, DOCX, JPG, ya PNG file upload kar sakte hain.");
      return;
    }

    setSelectedFile(file);
    setStatus(`File selected: ${file.name}`);
  }

  async function handleSubmitAssignment() {
    const trimmedAnswer = typedAnswer.trim();

    if (!selectedFile && !trimmedAnswer) {
      setError("Assignment submit karne ke liye file upload karein ya answer type karein.");
      return;
    }

    if (!studentId) {
      setError("Current student load hone ke baad assignment submit karein.");
      return;
    }

    setSubmitting(true);
    setStatus("Submitting assignment...");
    setError("");

    try {
      const fileContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
      const response = await fetch(`${API_BASE_URL}/assignment-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          assignment_id: ACTIVE_ASSIGNMENT.id,
          assignment_title: ACTIVE_ASSIGNMENT.title,
          typed_answer: trimmedAnswer || null,
          file_name: selectedFile?.name || null,
          file_type: selectedFile?.type || null,
          file_size: selectedFile?.size || null,
          file_content_base64: fileContentBase64
        })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to submit assignment.");
      }

      setSavedSubmission(data.submission);
      setStatus("Assignment database me save ho gaya.");
    } catch (submitError) {
      setStatus("");
      setError(submitError.message || "Assignment submit nahi ho paya.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <div className="assignment-layout">
            <article className="module-card assignment-list-card">
              <div className="card-title-row">
                <h2>Your Assignments</h2>
                <button className="soft-button" type="button">View All</button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Assignment Title</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(([number, title, dueDate, status, action]) => (
                    <tr className={status === "In Progress" ? "highlight-row" : ""} key={number}>
                      <td>{number}</td>
                      <td>{title}</td>
                      <td>{dueDate}</td>
                      <td><span className={`status-pill ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                      <td><button className="table-action" type="button">{action}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tip-box">Tip: Submit your assignments on time to get early feedback and improve your score!</div>
            </article>

            <article className="module-card assignment-upload-card">
              <div className="card-title-row">
                <h2>Assignment {ACTIVE_ASSIGNMENT.id}: {ACTIVE_ASSIGNMENT.title}</h2>
                <span className={`status-pill ${savedSubmission ? "submitted" : "in-progress"}`}>{savedSubmission ? "Submitted" : "In Progress"}</span>
              </div>
              <div className="meta-row">
                <span>Due Date: {ACTIVE_ASSIGNMENT.dueDate}</span>
                <span>Max Marks: {ACTIVE_ASSIGNMENT.maxMarks}</span>
              </div>
              <p>Analyze a real-world data privacy scenario and identify potential risks. Suggest proper mitigation strategies.</p>
              <div className="quiz-submit-row assignment-ai-row">
                <button className="primary-button" type="button" onClick={() => setShowAiSummary(true)}>Ask AI</button>
              </div>
              {showAiSummary && (
                <div className="assignment-ai-summary">
                  <strong>AI Summary</strong>
                  <p>Data Privacy Analysis asks you to study how personal data can be exposed or misused, identify privacy risks, and recommend practical safeguards such as consent, access control, encryption, and responsible data handling.</p>
                </div>
              )}
              <div
                className="upload-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleFileSelect(event.dataTransfer.files?.[0]);
                }}
              >
                <div className="upload-icon">Upload</div>
                <strong>Drag & drop your file here</strong>
                <span>or</span>
                <button className="soft-button upload-browse" type="button" onClick={() => fileInputRef.current?.click()}>Browse Files</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(event) => handleFileSelect(event.target.files?.[0])}
                />
                <small>Supported formats: PDF, DOC, DOCX, JPG, PNG (Max 10 MB)</small>
              </div>
              <label className="typed-assignment-box">
                <span>Type assignment in portal</span>
                <textarea
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder="Write your assignment answer here..."
                  rows={8}
                />
              </label>
              <div className="submit-row">
                <div>
                  <p>{selectedFile ? `Selected file: ${selectedFile.name}` : "No file uploaded yet"}</p>
                  <p>{savedSubmission ? `Last saved: ${new Date(savedSubmission.submitted_at).toLocaleString()}` : "Not submitted yet"}</p>
                </div>
                <button className="primary-button" type="button" onClick={handleSubmitAssignment} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Assignment"}
                </button>
              </div>
              {status && <div className="learning-status success" role="status">{status}</div>}
              {error && <div className="learning-status error" role="alert">{error}</div>}
            </article>
          </div>

          <article className="module-card workflow-card">
            <h2>Assignment Submission & Feedback</h2>
            <div className="workflow-steps">
              <div><span>1</span><p>Upload / Type Assignment</p></div>
              <div><span>2</span><p>Teacher Review & Feedback</p></div>
              <div><span>3</span><p>Revise (If Needed)</p></div>
              <div><span>4</span><p>Final Submission Done</p></div>
            </div>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
