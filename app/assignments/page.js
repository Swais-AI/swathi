"use client";

import { useState } from "react";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const assignments = [
  ["1", "AI Ethics Case Study", "20 May 2024", "Submitted", "View"],
  ["2", "Data Privacy Analysis", "28 May 2024", "In Progress", "Continue"],
  ["3", "Logistics Problem Set", "05 Jun 2024", "Not Started", "Start"],
  ["4", "Algorithm Bias Report", "12 Jun 2024", "Not Started", "Start"],
  ["5", "Sustainable Supply Chain", "20 Jun 2024", "Not Started", "Start"]
];

export default function AssignmentsPage() {
  const [showAiSummary, setShowAiSummary] = useState(false);

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
                <h2>Assignment 2: Data Privacy Analysis</h2>
                <span className="status-pill in-progress">In Progress</span>
              </div>
              <div className="meta-row">
                <span>Due Date: 28 May 2024</span>
                <span>Max Marks: 25</span>
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
              <div className="upload-zone">
                <div className="upload-icon">Upload</div>
                <strong>Drag & drop your file here</strong>
                <span>or</span>
                <button className="soft-button" type="button">Browse Files</button>
                <small>Supported formats: PDF, DOC, DOCX, JPG, PNG (Max 10 MB)</small>
              </div>
              <div className="submit-row">
                <div>
                  <p>No file uploaded yet</p>
                  <p>Last saved: 25 May 2024, 04:30 PM</p>
                </div>
                <button className="primary-button" type="button">Submit Assignment</button>
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
