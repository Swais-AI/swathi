"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import { useLanguage } from "../i18n";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const supportedFileTypes = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

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

function formatDate(dateValue, language = "en") {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const locale = language === "hi" ? "hi-IN" : language === "te" ? "te-IN" : "en-IN";

  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getAssignmentStatus(assignment, selectedAssignmentId) {
  if (assignment.submission_status) {
    return "Submitted";
  }

  if (isAssignmentOverdue(assignment)) {
    return "Overdue";
  }

  if (assignment.assignment_id === selectedAssignmentId) {
    return "In Progress";
  }

  return "Not Started";
}

function getAssignmentAction(status, t) {
  if (status === "Submitted") {
    return t("view");
  }

  if (status === "In Progress") {
    return t("continue");
  }

  return t("start");
}

function isAssignmentOverdue(assignment) {
  if (!assignment?.due_date || assignment.submission_status) {
    return false;
  }

  const dueDate = new Date(assignment.due_date);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  dueDate.setHours(23, 59, 59, 999);
  return dueDate < new Date();
}

function getStatusLabel(status, t) {
  const statusKeys = {
    Submitted: "submitted",
    Overdue: "overdue",
    "In Progress": "inProgress",
    "Not Started": "notStarted"
  };

  return t(statusKeys[status] || "notStarted");
}

function DueDateCell({ assignment, language, t }) {
  const overdue = isAssignmentOverdue(assignment);
  const dateLabel = formatDate(assignment.due_date, language);

  if (!overdue) {
    return dateLabel;
  }

  return (
    <span className="overdue-date" title={t("dueDatePast")}>
      <span aria-hidden="true">!</span>
      {dateLabel}
    </span>
  );
}

function AssignmentsContent() {
  const searchParams = useSearchParams();
  const activeView = searchParams.get("view") || "assignments";
  const { language, t } = useLanguage();
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [savedSubmission, setSavedSubmission] = useState(null);
  const fileInputRef = useRef(null);
  const selectedAssignment = assignments.find((assignment) => assignment.assignment_id === selectedAssignmentId) || assignments[0] || null;

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
          setError("Unable to load the current student.");
        }
      }
    }

    loadCurrentStudent();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignments() {
      setLoadingAssignments(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (studentId) {
          params.set("student_id", String(studentId));
        }

        const response = await fetch(`${API_BASE_URL}/assignments${params.toString() ? `?${params.toString()}` : ""}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : t("loadingAssignments"));
        }

        if (!cancelled) {
          const assignmentRows = Array.isArray(data.assignments) ? data.assignments : [];
          setAssignments(assignmentRows);
          setSelectedAssignmentId((current) => current || assignmentRows[0]?.assignment_id || null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || t("loadingAssignments"));
        }
      } finally {
        if (!cancelled) {
          setLoadingAssignments(false);
        }
      }
    }

    loadAssignments();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeedback() {
      setLoadingFeedback(true);
      setFeedbackError("");

      try {
        const params = new URLSearchParams();
        if (studentId) {
          params.set("student_id", String(studentId));
        }

        const response = await fetch(`${API_BASE_URL}/assignment-feedback${params.toString() ? `?${params.toString()}` : ""}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : t("loadingFeedback"));
        }

        if (!cancelled) {
          setFeedbackRows(Array.isArray(data.feedback) ? data.feedback : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFeedbackError(loadError.message || t("loadingFeedback"));
        }
      } finally {
        if (!cancelled) {
          setLoadingFeedback(false);
        }
      }
    }

    loadFeedback();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  function handleSelectAssignment(assignment) {
    setSelectedAssignmentId(assignment.assignment_id);
    setShowAiSummary(false);
    setSelectedFile(null);
    setTypedAnswer("");
    setSavedSubmission(null);
    setStatus("");
    setError("");
  }

  function handleFileSelect(file) {
    setError("");

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setError(t("fileSizeError"));
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isSupported = supportedFileTypes.some((extension) => lowerName.endsWith(extension));

    if (!isSupported) {
      setSelectedFile(null);
      setError(t("supportedFileError"));
      return;
    }

    setSelectedFile(file);
    setStatus(`${t("fileSelected")}: ${file.name}`);
  }

  async function handleSubmitAssignment() {
    const trimmedAnswer = typedAnswer.trim();

    if (!selectedFile && !trimmedAnswer) {
      setError(t("uploadOrTypeError"));
      return;
    }

    if (!studentId) {
      setError(t("waitStudentError"));
      return;
    }

    if (!selectedAssignment) {
      setError(t("selectAssignment"));
      return;
    }

    setSubmitting(true);
    setStatus(t("submitting"));
    setError("");

    try {
      const fileContentBase64 = selectedFile ? await readFileAsBase64(selectedFile) : null;
      const response = await fetch(`${API_BASE_URL}/assignment-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          assignment_id: selectedAssignment.assignment_id,
          assignment_title: selectedAssignment.assignment_title || t("assignment"),
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
      setAssignments((current) => current.map((assignment) => (
        assignment.assignment_id === selectedAssignment.assignment_id
          ? { ...assignment, submission_status: data.submission?.status || "Submitted", submitted_at: data.submission?.submitted_at }
          : assignment
      )));
      setStatus(t("assignmentSaved"));
    } catch (submitError) {
      setStatus("");
      setError(submitError.message || "Unable to submit assignment.");
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
                <h2>{t("yourAssignments")}</h2>
                <button className="soft-button" type="button">{t("viewAll")}</button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("assignmentTitle")}</th>
                    <th>{t("dueDate")}</th>
                    <th>{t("status")}</th>
                    <th>{t("action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAssignments && (
                    <tr>
                      <td colSpan="5" className="table-message-cell">{t("loadingAssignments")}</td>
                    </tr>
                  )}

                  {!loadingAssignments && assignments.length === 0 && (
                    <tr>
                      <td colSpan="5" className="table-message-cell">{t("noAssignments")}</td>
                    </tr>
                  )}

                  {!loadingAssignments && assignments.map((assignment, index) => {
                    const assignmentStatus = getAssignmentStatus(assignment, selectedAssignmentId);
                    const action = getAssignmentAction(assignmentStatus, t);

                    return (
                    <tr className={assignmentStatus === "In Progress" ? "highlight-row" : ""} key={assignment.assignment_id}>
                      <td>{index + 1}</td>
                      <td>{assignment.assignment_title || "-"}</td>
                      <td><DueDateCell assignment={assignment} language={language} t={t} /></td>
                      <td><span className={`status-pill ${assignmentStatus.toLowerCase().replaceAll(" ", "-")}`}>{getStatusLabel(assignmentStatus, t)}</span></td>
                      <td><button className="table-action" type="button" onClick={() => handleSelectAssignment(assignment)}>{action}</button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="tip-box">{t("submitTip")}</div>
            </article>

            <article className="module-card assignment-upload-card">
              <div className="card-title-row">
                <h2>{selectedAssignment ? `${t("assignment")} ${selectedAssignment.assignment_id}: ${selectedAssignment.assignment_title || t("untitled")}` : t("assignment")}</h2>
                <span className={`status-pill ${savedSubmission || selectedAssignment?.submission_status ? "submitted" : "in-progress"}`}>{savedSubmission || selectedAssignment?.submission_status ? t("submitted") : t("inProgress")}</span>
              </div>
              <div className="meta-row">
                <span>{t("dueDate")}: {formatDate(selectedAssignment?.due_date, language)}</span>
              </div>
              <p>{selectedAssignment?.assignment_text || t("selectAssignment")}</p>
              <div className="quiz-submit-row assignment-ai-row">
                <button className="primary-button" type="button" onClick={() => setShowAiSummary(true)}>{t("askAi")}</button>
              </div>
              {showAiSummary && (
                <div className="assignment-ai-summary">
                  <strong>{t("aiSummary")}</strong>
                  <p>{selectedAssignment?.assignment_text || t("assignmentDetailsUnavailable")}</p>
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
                <div className="upload-icon">{t("upload")}</div>
                <strong>{t("dragDropFile")}</strong>
                <span>{t("or")}</span>
                <button className="soft-button upload-browse" type="button" onClick={() => fileInputRef.current?.click()}>{t("browseFiles")}</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(event) => handleFileSelect(event.target.files?.[0])}
                />
                <small>{t("supportedFormats")}</small>
              </div>
              <label className="typed-assignment-box">
                <span>{t("typeAssignment")}</span>
                <textarea
                  value={typedAnswer}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder={t("answerPlaceholder")}
                  rows={8}
                />
              </label>
              <div className="submit-row">
                <div>
                  <p>{selectedFile ? `${t("selectedFile")}: ${selectedFile.name}` : t("noFileUploaded")}</p>
                  <p>{savedSubmission ? `${t("lastSaved")}: ${new Date(savedSubmission.submitted_at).toLocaleString()}` : t("notSubmittedYet")}</p>
                </div>
                <button className="primary-button" type="button" onClick={handleSubmitAssignment} disabled={submitting}>
                  {submitting ? t("submitting") : t("submitAssignment")}
                </button>
              </div>
              {status && <div className="learning-status success" role="status">{status}</div>}
              {error && <div className="learning-status error" role="alert">{error}</div>}
            </article>
          </div>

          <article className="module-card workflow-card">
            <h2>{t("assignmentFeedback")}</h2>
            {activeView === "feedback" ? (
              <div className="feedback-panel">
                {feedbackError && <div className="learning-status error" role="alert">{feedbackError}</div>}
                <table className="data-table feedback-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("assignmentTitle")}</th>
                      <th>{t("submittedDetails")}</th>
                      <th>{t("teacherScore")}</th>
                      <th>{t("feedbackComments")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingFeedback && (
                      <tr>
                        <td colSpan="5" className="table-message-cell">{t("loadingFeedback")}</td>
                      </tr>
                    )}

                    {!loadingFeedback && !feedbackError && feedbackRows.length === 0 && (
                      <tr>
                        <td colSpan="5" className="table-message-cell">{t("noFeedback")}</td>
                      </tr>
                    )}

                    {!loadingFeedback && feedbackRows.map((feedback, index) => (
                      <tr key={feedback.submission_id}>
                        <td>{index + 1}</td>
                        <td>{feedback.assignment_title || "-"}</td>
                        <td>
                          <div className="submitted-detail">
                            <span>{feedback.submission_text || t("submittedAssignment")}</span>
                            <small>{feedback.file_path || "-"}</small>
                          </div>
                        </td>
                        <td><span className="status-pill completed">{feedback.marks_obtained ?? "-"}</span></td>
                        <td>{feedback.teacher_remarks || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="workflow-steps">
                <div><span>1</span><p>{t("workflowUpload")}</p></div>
                <div><span>2</span><p>{t("workflowReview")}</p></div>
                <div><span>3</span><p>{t("workflowRevise")}</p></div>
                <div><span>4</span><p>{t("workflowFinal")}</p></div>
              </div>
            )}
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssignmentsContent />
    </Suspense>
  );
}
