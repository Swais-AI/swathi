"use client";

import { useEffect, useState } from "react";
import AppSelect from "../app-select";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load study material.");
  }
  return data;
}

export default function StudyMaterialPage() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [materials, setMaterials] = useState([]);
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadClasses() {
      try {
        const data = await fetchJson(`${API_BASE_URL}/classes`);
        const availableClasses = Array.isArray(data.classes) ? data.classes : [];
        if (!cancelled) {
          setClasses(availableClasses);
          const classSix = availableClasses.find(
            (item) => String(item.class_name).trim() === "6" && String(item.section_name || "").trim().toUpperCase() === "A"
          );
          setSelectedClass(String(classSix?.class_id || availableClasses[0]?.class_id || ""));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load classes.");
        }
      }
    }

    loadClasses();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSelectedSubject("");
    setSelectedChapter("");
    setSubjects([]);
    setChapters([]);
    setMaterials([]);
    setPreviewMaterial(null);
    setHasLoaded(false);

    if (!selectedClass) {
      return () => {
        cancelled = true;
      };
    }

    async function loadSubjects() {
      setLoadingSubjects(true);
      setError("");
      try {
        const data = await fetchJson(`${API_BASE_URL}/subjects?class_id=${encodeURIComponent(selectedClass)}`);
        if (!cancelled) {
          setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load subjects.");
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    }

    loadSubjects();
    return () => {
      cancelled = true;
    };
  }, [selectedClass]);

  useEffect(() => {
    let cancelled = false;
    setSelectedChapter("");
    setChapters([]);
    setMaterials([]);
    setPreviewMaterial(null);
    setHasLoaded(false);

    if (!selectedClass || !selectedSubject) {
      return () => {
        cancelled = true;
      };
    }

    async function loadChapters() {
      setLoadingChapters(true);
      setError("");
      try {
        const params = new URLSearchParams({
          class_id: selectedClass,
          subject_id: selectedSubject
        });
        const data = await fetchJson(`${API_BASE_URL}/chapter-content-list?${params.toString()}`);
        if (!cancelled) {
          setChapters(Array.isArray(data.chapters) ? data.chapters : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load chapters.");
        }
      } finally {
        if (!cancelled) {
          setLoadingChapters(false);
        }
      }
    }

    loadChapters();
    return () => {
      cancelled = true;
    };
  }, [selectedClass, selectedSubject]);

  async function handleLoadMaterials(event) {
    event.preventDefault();
    if (!selectedChapter) {
      setError("Please select a chapter.");
      return;
    }

    setLoading(true);
    setError("");
    setHasLoaded(false);
    setMaterials([]);
    setPreviewMaterial(null);

    try {
      const data = await fetchJson(
        `${API_BASE_URL}/study-materials?chapter_content_id=${encodeURIComponent(selectedChapter)}`
      );
      setMaterials(Array.isArray(data.materials) ? data.materials : []);
      setHasLoaded(true);
    } catch (loadError) {
      setError(loadError.message || "Unable to load study materials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <form
            className="chapter-selector chapter-page-selector material-selector"
            aria-label="Study material selection"
            onSubmit={handleLoadMaterials}
          >
            <AppSelect
              value={selectedClass}
              options={classes.map((item) => ({
                value: item.class_id,
                label: `${item.class_name}${item.section_name ? ` - ${item.section_name}` : ""}`
              }))}
              ariaLabel="Select class"
              onChange={setSelectedClass}
              placeholder="Select Class..."
              searchable
              className="chapter-app-select"
            />
            <AppSelect
              value={selectedSubject}
              options={subjects.map((item) => ({ value: item.subject_id, label: item.subject_name }))}
              ariaLabel="Select subject"
              onChange={setSelectedSubject}
              disabled={!selectedClass || loadingSubjects}
              placeholder={loadingSubjects ? "Loading Subjects..." : "Select Subject..."}
              searchable
              className="chapter-app-select"
            />
            <AppSelect
              value={selectedChapter}
              options={chapters.map((item) => ({
                value: item.chapter_content_id,
                label: item.content_title
              }))}
              ariaLabel="Select chapter"
              onChange={(value) => {
                setSelectedChapter(value);
                setMaterials([]);
                setPreviewMaterial(null);
                setHasLoaded(false);
              }}
              disabled={!selectedSubject || loadingChapters}
              placeholder={loadingChapters ? "Loading Chapters..." : "Select Chapter..."}
              searchable
              className="chapter-app-select chapter-title-app-select"
            />
            <button type="submit" disabled={!selectedChapter || loading}>
              {loading ? "Loading" : "Go"}
            </button>
          </form>

          <article className="module-card material-card">
            <h2>Chapter Content & Study Material</h2>
            {error && <div className="material-status error" role="alert">{error}</div>}
            {!error && hasLoaded && materials.length === 0 && (
              <div className="material-status">No PDF study material is uploaded for this chapter yet.</div>
            )}
            <div className="material-table-wrap">
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
                  {materials.map((material) => (
                    <tr key={material.file_id}>
                      <td><span className="file-badge pdf">PDF</span></td>
                      <td>{material.content_title}</td>
                      <td>PDF study material for the selected chapter.</td>
                      <td>{material.file_name}</td>
                      <td>
                        <div className="material-actions">
                          <button
                            className="table-action"
                            type="button"
                            onClick={() => setPreviewMaterial(material)}
                          >
                            View
                          </button>
                          <a className="table-action" href={material.download_url}>
                            Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!hasLoaded && materials.length === 0 && (
                    <tr>
                      <td colSpan="5">Select class, subject and chapter, then click Go.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {previewMaterial && (
            <article className="module-card pdf-view-card">
              <div className="card-title-row">
                <h2>{previewMaterial.content_title}</h2>
                <div className="pdf-view-actions">
                  <a className="soft-button" href={previewMaterial.download_url}>Download PDF</a>
                  <button className="soft-button" type="button" onClick={() => setPreviewMaterial(null)}>
                    Close
                  </button>
                </div>
              </div>
              <iframe
                className="pdf-document-frame"
                src={previewMaterial.view_url}
                title={`${previewMaterial.content_title} PDF`}
              />
            </article>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
