"use client";

import { useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const STUDENT_ID = 23;
const AI_REQUEST_DELAY_MS = 15000;

const chapters = [
  { id: 1, title: "Democratic India", subject: "Social Science", lesson: "Lesson 1" },
  { id: 2, title: "Constitutional Values", subject: "Social Science", lesson: "Lesson 2" },
  { id: 3, title: "Local Government", subject: "Social Science", lesson: "Lesson 3" }
];

const learnerTracks = [
  {
    key: "Fast Reader",
    title: "Fast Reader Material",
    description: "Quick revision notes, challenge questions, and enrichment work.",
    markers: ["Short notes", "Timed quiz", "Advanced practice"]
  },
  {
    key: "Average Reader",
    title: "Average Reader Material",
    description: "Balanced chapter notes with guided checkpoints and practice.",
    markers: ["Section reading", "Key points", "Quiz correction"]
  },
  {
    key: "Slow Reader",
    title: "Slow Reader Material",
    description: "Smaller reading blocks, recap support, and retry guidance.",
    markers: ["Audio support", "Keyword help", "Step practice"]
  }
];

const fallbackPaths = {
  "Fast Reader": [
    "Read the chapter summary and mark unfamiliar terms.",
    "Attempt higher-order questions before reviewing notes.",
    "Create a one-page revision map for the chapter.",
    "Take a timed quiz and move to enrichment practice."
  ],
  "Average Reader": [
    "Read the chapter in two focused sections.",
    "Write three key points after each section.",
    "Review solved examples or teacher notes.",
    "Attempt the quiz, revise weak areas, then retry missed questions."
  ],
  "Slow Reader": [
    "Read one small section at a time with audio support if needed.",
    "Underline keywords and write their meanings.",
    "Use short recap notes before each quiz attempt.",
    "Practice easier questions first, then retry with teacher/AI hints."
  ]
};

const contentSections = [
  { key: "simple_notes", label: "Simple Notes" },
  { key: "key_terms", label: "Key Terms" },
  { key: "recap", label: "Recap" },
  { key: "practice", label: "Practice" }
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
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

function classifyReader(metrics) {
  let score = 0;

  if (metrics.reading_time_minutes <= 20) score += 2;
  else if (metrics.reading_time_minutes <= 40) score += 1;

  if (metrics.quiz_score >= 85) score += 2;
  else if (metrics.quiz_score >= 60) score += 1;

  if (metrics.comprehension_score >= 85) score += 2;
  else if (metrics.comprehension_score >= 60) score += 1;

  if (metrics.retry_count === 0) score += 1;
  else if (metrics.retry_count >= 3) score -= 1;

  if (score >= 5) return "Fast Reader";
  if (score >= 3) return "Average Reader";
  return "Slow Reader";
}

export default function AiLearningPathPage() {
  const [chapterId, setChapterId] = useState(1);
  const [metrics, setMetrics] = useState({
    reading_time_minutes: 28,
    quiz_score: 76,
    retry_count: 1,
    comprehension_score: 72
  });
  const [learningPath, setLearningPath] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [activeContentSection, setActiveContentSection] = useState("simple_notes");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");

  const selectedChapter = useMemo(() => chapters.find((chapter) => chapter.id === Number(chapterId)) || chapters[0], [chapterId]);
  const localClassification = useMemo(() => classifyReader(metrics), [metrics]);
  const visibleContent = generatedContent?.generated_content?.[activeContentSection] || [];

  function updateMetric(name, value) {
    setMetrics((current) => ({ ...current, [name]: Number(value) }));
  }

  function buildPayload() {
    return {
      student_id: STUDENT_ID,
      chapter_id: selectedChapter.id,
      chapter_title: selectedChapter.title,
      ...metrics
    };
  }

  function buildFallbackPath(classification) {
    const track = learnerTracks.find((item) => item.key === classification);

    return {
      provider: "frontend-fallback",
      chapter_title: selectedChapter.title,
      classification,
      track_title: track.title,
      summary: track.description,
      focus_area: "Backend AI service is not reachable, so this path used the local mock rules.",
      steps: fallbackPaths[classification],
      recommended_materials: [
        `${track.title} - ${selectedChapter.title} reading notes`,
        `${selectedChapter.title} recap worksheet`,
        `${selectedChapter.title} adaptive quiz practice`
      ]
    };
  }

  async function handleGenerate() {
    setStatus("Generating learning path...");
    setError("");
    setNotice("");
    setGeneratedContent(null);
    setContentError("");

    try {
      await waitBeforeAiRequest();
      const response = await fetchWithTimeout(`${API_BASE_URL}/learning-path/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload())
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to generate learning path.");
      }

      setLearningPath(data.learning_path);
      setStatus(`Learning path generated from ${data.learning_path?.provider || "AI"} service.`);
    } catch (generateError) {
      const fallback = buildFallbackPath(localClassification);
      setLearningPath(fallback);
      setNotice(generateError.name === "AbortError" ? "Backend is not responding, so the local mock AI path was used." : `${generateError.message} Showing local mock AI path.`);
      setStatus("Local mock learning path generated. See the personalized path below.");
    }
  }

  async function handleGenerateContent() {
    const path = learningPath || buildFallbackPath(localClassification);
    setContentLoading(true);
    setContentError("");
    setNotice("");

    try {
      await waitBeforeAiRequest();
      const response = await fetchWithTimeout(`${API_BASE_URL}/learning-content/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: STUDENT_ID,
          chapter_id: selectedChapter.id,
          chapter_title: selectedChapter.title,
          classification: path.classification || localClassification,
          focus_area: path.focus_area,
          steps: Array.isArray(path.steps) ? path.steps : []
        })
      }, 45000);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to generate learning content.");
      }

      setGeneratedContent(data);
      setActiveContentSection("simple_notes");
      setStatus(`Reading content generated for ${data.chapter_title || selectedChapter.title}.`);
    } catch (contentErrorValue) {
      setContentError(contentErrorValue.name === "AbortError" ? "Content generation timed out. Please try again." : contentErrorValue.message);
    } finally {
      setContentLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setNotice("");
    setStatus("");

    try {
      const response = await fetch(`${API_BASE_URL}/student-learning-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload())
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Unable to save learning profile.");
      }

      setLearningPath(data.learning_path || data.profile?.generated_path);
      setGeneratedContent(null);
      setStatus("Learning profile saved.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save learning profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFetchSaved() {
    setLoadingSaved(true);
    setError("");
    setNotice("");
    setStatus("");

    try {
      const params = new URLSearchParams({
        student_id: String(STUDENT_ID),
        chapter_id: String(selectedChapter.id)
      });
      const response = await fetch(`${API_BASE_URL}/student-learning-profile?${params.toString()}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "No saved learning profile found.");
      }

      setLearningPath(data.profile.generated_path);
      setGeneratedContent(null);
      setMetrics({
        reading_time_minutes: data.profile.reading_time_minutes,
        quiz_score: data.profile.quiz_score,
        retry_count: data.profile.retry_count,
        comprehension_score: data.profile.comprehension_score
      });
      setStatus("Saved learning profile loaded.");
    } catch (fetchError) {
      setError(fetchError.message || "Unable to fetch saved learning profile.");
    } finally {
      setLoadingSaved(false);
    }
  }

  function handleChapterChange(event) {
    setChapterId(Number(event.target.value));
    setLearningPath(null);
    setGeneratedContent(null);
    setError("");
    setNotice("");
    setStatus("");
    setContentError("");
  }

  function renderGeneratedContent() {
    if (!generatedContent) {
      return (
        <div className="table-message-cell">
          Generate content to create personalized study material for {selectedChapter.title}.
        </div>
      );
    }

    if (activeContentSection === "key_terms") {
      return (
        <div className="preview-check-list">
          {visibleContent.map((item) => (
            <span key={`${item.term}-${item.meaning}`}>
              <strong>{item.term}</strong>{item.meaning ? `: ${item.meaning}` : ""}
            </span>
          ))}
        </div>
      );
    }

    if (activeContentSection === "practice") {
      return (
        <ol className="learning-step-list">
          {visibleContent.map((item) => (
            <li key={`${item.question}-${item.hint}`}>
              {item.question}
              {item.hint && <p>{item.hint}</p>}
            </li>
          ))}
        </ol>
      );
    }

    return (
      <ol className="learning-step-list">
        {visibleContent.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <article className="module-card ai-learning-card">
            <div className="card-title-row">
              <div>
                <h2>AI Learning Path</h2>
                <p>Personalized reading track for the selected chapter.</p>
              </div>
              <span className="status-pill completed">{localClassification}</span>
            </div>

            <div className="learning-track-grid">
              {learnerTracks.map((track) => (
                <section className={`learning-track ${localClassification === track.key ? "selected" : ""}`} key={track.key}>
                  <h3>{track.title}</h3>
                  <p>{track.description}</p>
                  <div className="track-marker-row">
                    {track.markers.map((marker) => (
                      <span key={marker}>{marker}</span>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="learning-form-grid">
              <label>
                <span>Chapter</span>
                <select value={chapterId} onChange={handleChapterChange}>
                  {chapters.map((chapter) => (
                    <option value={chapter.id} key={chapter.id}>
                      {chapter.lesson} - {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Reading Time (mins)</span>
                <input type="number" min="0" max="600" value={metrics.reading_time_minutes} onChange={(event) => updateMetric("reading_time_minutes", event.target.value)} />
              </label>
              <label>
                <span>Quiz Score (%)</span>
                <input type="number" min="0" max="100" value={metrics.quiz_score} onChange={(event) => updateMetric("quiz_score", event.target.value)} />
              </label>
              <label>
                <span>Retry Count</span>
                <input type="number" min="0" max="50" value={metrics.retry_count} onChange={(event) => updateMetric("retry_count", event.target.value)} />
              </label>
              <label>
                <span>Comprehension Score (%)</span>
                <input type="number" min="0" max="100" value={metrics.comprehension_score} onChange={(event) => updateMetric("comprehension_score", event.target.value)} />
              </label>
            </div>

            <div className="quiz-submit-row">
              <button className="primary-button" type="button" onClick={handleGenerate}>Generate Path</button>
              <button className="soft-button" type="button" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button>
              <button className="soft-button" type="button" onClick={handleFetchSaved} disabled={loadingSaved}>{loadingSaved ? "Loading..." : "Fetch Saved"}</button>
            </div>

            {status && <div className="learning-status success" role="status">{status}</div>}
            {notice && <div className="learning-status notice" role="status">{notice}</div>}
            {error && <div className="learning-status error" role="alert">{error}</div>}
          </article>

          {learningPath && (
            <>
              <article className="module-card generated-path-card">
                <div className="card-title-row">
                  <div>
                    <h2>{learningPath.track_title}</h2>
                    <p>{learningPath.summary}</p>
                  </div>
                  <span className="status-pill in-progress">{learningPath.provider}</span>
                </div>
                <div className="learning-focus-box">
                  <strong>Focus Area</strong>
                  <p>{learningPath.focus_area}</p>
                </div>
                <ol className="learning-step-list">
                  {learningPath.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className="recommended-materials">
                  <h3>Recommended Material</h3>
                  {learningPath.recommended_materials.map((material) => (
                    <span key={material}>{material}</span>
                  ))}
                </div>
              </article>

              <article className="module-card generated-content-preview-card">
                <div className="card-title-row">
                  <div>
                    <h2>Generated Study Content</h2>
                    <p>Personalized reading material for {selectedChapter.title}.</p>
                  </div>
                  <span className={`status-pill ${generatedContent ? "completed" : "not-started"}`}>{generatedContent ? generatedContent.provider : "Not Generated"}</span>
                </div>

                <div className="content-preview-toolbar" aria-label="Generated content sections">
                  {contentSections.map((section) => (
                    <button className={activeContentSection === section.key ? "active" : ""} type="button" onClick={() => setActiveContentSection(section.key)} key={section.key}>
                      {section.label}
                    </button>
                  ))}
                </div>

                <div className="content-preview-layout">
                  <section className="content-preview-main">
                    <div className="preview-section-head">
                      <span className="preview-icon notes" aria-hidden="true" />
                      <div>
                        <h3>{contentSections.find((section) => section.key === activeContentSection)?.label}</h3>
                        <p>{learningPath.classification} content for {selectedChapter.title}.</p>
                      </div>
                    </div>
                    {contentLoading ? <div className="table-message-cell">Generating personalized content from the selected lesson...</div> : renderGeneratedContent()}
                    {contentError && <div className="learning-status error" role="alert">{contentError}</div>}
                  </section>

                  <aside className="content-preview-side">
                    <section>
                      <h3>Content Structure</h3>
                      <div className="preview-check-list">
                        <span>Reading blocks</span>
                        <span>Keyword support</span>
                        <span>Quick recap</span>
                        <span>Practice prompts</span>
                      </div>
                    </section>
                    <section>
                      <h3>Actions</h3>
                      <div className="content-preview-actions">
                        <button className="soft-button" type="button" onClick={handleGenerateContent} disabled={contentLoading}>
                          {generatedContent ? "Regenerate" : "Generate Content"}
                        </button>
                      </div>
                    </section>
                  </aside>
                </div>
              </article>
            </>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
