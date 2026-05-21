"use client";

import { useState } from "react";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const materials = [
  {
    type: "PDF",
    title: "ML Basics - Study Notes",
    description: "Detailed notes on ML concepts, types of learning and algorithms.",
    file: "ml_basics_notes.pdf"
  },
  {
    type: "Video",
    title: "Introduction to ML",
    description: "Video lecture explaining the basics of Machine Learning.",
    file: "ml_intro_video.mp4"
  },
  {
    type: "Text",
    title: "Key Points Summary",
    description: "Important points and quick revision notes.",
    file: "-"
  }
];

export default function StudyMaterialPage() {
  const [showPdfContent, setShowPdfContent] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");

  function handleDownload() {
    setDownloadMessage("Downloaded");
    window.setTimeout(() => setDownloadMessage(""), 2200);
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <article className="module-card material-card">
            <h2>Chapter Content & Study Material</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Content Type</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>File / Link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(({ type, title, description, file }) => (
                  <tr key={title}>
                    <td><span className={`file-badge ${type.toLowerCase()}`}>{type}</span></td>
                    <td>{title}</td>
                    <td>{description}</td>
                    <td>{file}</td>
                    <td>
                      {type === "PDF" ? (
                        <button className="table-action" type="button" onClick={() => setShowPdfContent(true)}>View</button>
                      ) : (
                        <button className="table-action" type="button">{type === "Video" ? "Watch" : "View"}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          {showPdfContent && (
            <article className="module-card pdf-view-card">
              <div className="card-title-row">
                <h2>ML Basics - Study Notes</h2>
                <div className="pdf-view-actions">
                  <button className="download-icon-button" type="button" aria-label="Download PDF" onClick={handleDownload}>
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button className="soft-button" type="button" onClick={() => setShowPdfContent(false)}>Close</button>
                </div>
              </div>
              {downloadMessage && <div className="download-message pdf-download-message" role="status">{downloadMessage}</div>}
              <div className="pdf-page">
                <h3>Machine Learning Basics</h3>
                <p>Machine Learning is a branch of Artificial Intelligence that helps computers learn from data and improve their performance without being explicitly programmed for every task.</p>
                <h4>Types of Learning</h4>
                <p><strong>Supervised Learning:</strong> The model learns from labelled examples, such as predicting marks from study hours.</p>
                <p><strong>Unsupervised Learning:</strong> The model finds patterns in data without labelled answers, such as grouping similar students by learning behavior.</p>
                <p><strong>Reinforcement Learning:</strong> The model learns by taking actions and receiving rewards or penalties.</p>
                <h4>Key Algorithms</h4>
                <p>Common algorithms include Linear Regression, Decision Trees, K-Means Clustering, and Neural Networks. Each algorithm is useful for different kinds of prediction, classification, or pattern discovery tasks.</p>
              </div>
            </article>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
