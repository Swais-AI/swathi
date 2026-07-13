"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const maxFileSize = 10 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png"
]);

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatFileSize(size) {
  if (!size) {
    return "-";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file) {
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
  const fileInputRef = useRef(null);
  const uploadCardRef = useRef(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAssignments() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/assignments/current`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load assignments.");
      }

      const nextAssignments = Array.isArray(data.assignments) ? data.assignments : [];
      setAssignments(nextAssignments);
      setSelectedAssignment((current) => {
        if (current) {
          return nextAssignments.find((assignment) => assignment.assignment_id === current.assignment_id) || nextAssignments[0] || null;
        }
        return nextAssignments[0] || null;
      });
    } catch (loadError) {
      setError(loadError.message || "Unable to load assignments.");
      setAssignments([]);
      setSelectedAssignment(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
  }, []);

  function selectAssignment(assignment) {
    setSelectedAssignment(assignment);
    setSelectedFile(null);
    setShowAiSummary(false);
    setMessage("");
    setError("");
    window.setTimeout(() => uploadCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  function handleBrowseFiles() {
    fileInputRef.current?.click();
  }

  function validateAndSetFile(file) {
    if (!file) {
      return;
    }

    setMessage("");
    setError("");

    if (file.size > maxFileSize) {
      setError("File size must be 10 MB or less.");
      return;
    }

    if (file.type && !allowedTypes.has(file.type)) {
      setError("Only PDF, DOC, DOCX, JPG, and PNG files are supported.");
      return;
    }

    setSelectedFile(file);
  }

  function handleFileChange(event) {
    validateAndSetFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    validateAndSetFile(event.dataTransfer.files?.[0]);
  }

  async function handleSubmitAssignment() {
    if (!selectedAssignment) {
      setError("Please select an assignment.");
      return;
    }

    if (!selectedFile) {
      setError("Please choose a file before submitting.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const fileContentBase64 = await fileToBase64(selectedFile);
      const response = await fetch(`${API_BASE_URL}/assignments/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assignment_id: selectedAssignment.assignment_id,
          file_name: selectedFile.name,
          file_type: selectedFile.type || "application/octet-stream",
          file_size: selectedFile.size,
          file_content_base64: fileContentBase64
        })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to submit assignment.");
      }

      setMessage("Assignment submitted successfully.");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadAssignments();
    } catch (submitError) {
      setError(submitError.message || "Unable to submit assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          {error && <div className="tip-box red-action">{error}</div>}
          {message && <div className="download-message">{message}</div>}

          <div className="assignment-layout">
            <article className="module-card assignment-list-card">
              <div className="card-title-row">
                <h2>Your Assignments</h2>
                <button className="soft-button" type="button" onClick={loadAssignments} disabled={loading}>
                  {loading ? "Loading" : "View All"}
                </button>
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
                  {assignments.map((assignment) => {
                    const isSelected = selectedAssignment?.assignment_id === assignment.assignment_id;
                    const status = assignment.status || "Not Started";
                    const action = status === "Submitted" ? "View" : status === "In Progress" ? "Continue" : "Start";

                    return (
                      <tr className={isSelected || status === "In Progress" ? "highlight-row" : ""} key={assignment.assignment_id}>
                        <td>{assignment.number}</td>
                        <td>{assignment.assignment_title}</td>
                        <td>{formatDate(assignment.due_date)}</td>
                        <td><span className={`status-pill ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                        <td>
                          <button className="table-action" type="button" onClick={() => selectAssignment(assignment)}>
                            {action}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && assignments.length === 0 && (
                    <tr>
                      <td colSpan="5">No assignments available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="tip-box">Tip: Submit your assignments on time to get early feedback and improve your score!</div>
            </article>

            <article className="module-card assignment-upload-card" ref={uploadCardRef}>
              <div className="card-title-row">
                <h2>{selectedAssignment?.assignment_title || "Select an assignment"}</h2>
                {selectedAssignment && (
                  <span className={`status-pill ${(selectedAssignment.status || "Not Started").toLowerCase().replaceAll(" ", "-")}`}>
                    {selectedAssignment.status || "Not Started"}
                  </span>
                )}
              </div>
              <div className="meta-row">
                <span>Due Date: {formatDate(selectedAssignment?.due_date)}</span>
                <span>Assignment ID: {selectedAssignment?.assignment_id || "-"}</span>
              </div>
              <p>{selectedAssignment?.assignment_text || "Choose an assignment from the list to upload your work."}</p>
              <div className="quiz-submit-row assignment-ai-row">
                <button className="primary-button" type="button" onClick={() => setShowAiSummary(true)} disabled={!selectedAssignment}>Ask AI</button>
              </div>
              {showAiSummary && selectedAssignment && (
                <div className="assignment-ai-summary">
                  <strong>AI Summary</strong>
                  <p>{selectedAssignment.assignment_text || "Read the assignment title carefully, prepare your response, and upload the completed file before the due date."}</p>
                </div>
              )}
              <div
                className="upload-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  hidden
                />
                <div className="upload-icon">Upload</div>
                <strong>Drag & drop your file here</strong>
                <span>or</span>
                <button className="soft-button" type="button" onClick={handleBrowseFiles} disabled={!selectedAssignment || saving}>Browse Files</button>
                <small>Supported formats: PDF, DOC, DOCX, JPG, PNG (Max 10 MB)</small>
              </div>
              <div className="submit-row">
                <div>
                  <p>{selectedFile ? `Selected: ${selectedFile.name} (${formatFileSize(selectedFile.size)})` : selectedAssignment?.submitted_file_name ? `Uploaded: ${selectedAssignment.submitted_file_name}` : "No file uploaded yet"}</p>
                  <p>Last submitted: {formatDateTime(selectedAssignment?.submitted_at)}</p>
                </div>
                <button className="primary-button" type="button" onClick={handleSubmitAssignment} disabled={!selectedAssignment || !selectedFile || saving}>
                  {saving ? "Submitting..." : "Submit Assignment"}
                </button>
              </div>
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
