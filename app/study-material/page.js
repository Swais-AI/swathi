"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

const API_BASE_URL = getApiBaseUrl();
const fallbackClass = "9th Grade";
const subjects = ["Social Science", "Maths", "Hindi", "Telugu"];
const chapters = [
  { id: 1, title: "Democratic India", subject: "Social Science", lesson: "Lesson 1" },
  { id: 2, title: "Constitutional Values", subject: "Social Science", lesson: "Lesson 2" },
  { id: 3, title: "Local Government", subject: "Social Science", lesson: "Lesson 3" }
];

function normalizeContentType(type) {
  const value = String(type || "Text").trim();
  const lowerValue = value.toLowerCase();

  if (lowerValue.includes("video")) return "Video";
  if (lowerValue.includes("pdf")) return "PDF";
  if (lowerValue.includes("worksheet")) return "Worksheet";
  return "Text";
}

function getFileDisplay(material) {
  return material.file_name || material.file_link || "-";
}

function getActionLabel(contentType) {
  return contentType === "Video" ? "Watch" : "View";
}

function openMaterial(material, onMissingFile) {
  const target = material.file_link || material.file_name;

  if (target && target !== "-") {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }

  onMissingFile("No file or link is available for this study material.");
}

export default function StudyMaterialPage() {
  const [studentClass, setStudentClass] = useState(fallbackClass);
  const [selectedSubject, setSelectedSubject] = useState("Social Science");
  const [selectedChapter, setSelectedChapter] = useState("1");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredChapters = useMemo(() => {
    const matchingChapters = chapters.filter((chapter) => chapter.subject === selectedSubject);
    return matchingChapters.length > 0 ? matchingChapters : chapters;
  }, [selectedSubject]);

  useEffect(() => {
    if (!filteredChapters.some((chapter) => String(chapter.id) === selectedChapter)) {
      setSelectedChapter(String(filteredChapters[0].id));
    }
  }, [filteredChapters, selectedChapter]);

  useEffect(() => {
    let cancelled = false;

    async function loadStudentClass() {
      try {
        const response = await fetch(`${API_BASE_URL}/students/current`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.student?.class_name || cancelled) {
          return;
        }

        setStudentClass(data.student.class_name);
      } catch {
        if (!cancelled) {
          setStudentClass(fallbackClass);
        }
      }
    }

    loadStudentClass();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStudyMaterials() {
      setLoading(true);
      setError("");
      setNotice("");
      setMaterials([]);

      try {
        const params = new URLSearchParams({
          student_class: studentClass,
          subject: selectedSubject,
          chapter: selectedChapter
        });
        const response = await fetch(`${API_BASE_URL}/study-materials?${params.toString()}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load study material.");
        }

        if (!cancelled) {
          setMaterials(Array.isArray(data.materials) ? data.materials : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError.message || "Unable to load study material.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (studentClass && selectedSubject && selectedChapter) {
      loadStudyMaterials();
    }

    return () => {
      cancelled = true;
    };
  }, [studentClass, selectedSubject, selectedChapter]);

  return (
    <DashboardShell>
      <section className="module-page">
        <StudyTabs />
        <div className="module-content-area">
          <article className="module-card material-card">
            <div className="card-title-row material-title-row">
              <h2>Chapter Content & Study Material</h2>
              <form className="material-filter-row" aria-label="Study material filters">
                <select value={selectedSubject} aria-label="Select subject" onChange={(event) => setSelectedSubject(event.target.value)}>
                  {subjects.map((subject) => (
                    <option value={subject} key={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
                <select value={selectedChapter} aria-label="Select chapter" onChange={(event) => setSelectedChapter(event.target.value)}>
                  {filteredChapters.map((chapter) => (
                    <option value={chapter.id} key={chapter.id}>
                      {chapter.lesson} - {chapter.title}
                    </option>
                  ))}
                </select>
              </form>
            </div>

            {error && <div className="learning-status error" role="alert">{error}</div>}
            {notice && <div className="learning-status notice" role="status">{notice}</div>}

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
                {loading && (
                  <tr>
                    <td colSpan="5" className="table-message-cell">Loading study material...</td>
                  </tr>
                )}

                {!loading && !error && materials.length === 0 && (
                  <tr>
                    <td colSpan="5" className="table-message-cell">No study material found for this selection.</td>
                  </tr>
                )}

                {!loading && materials.map((material) => {
                  const contentType = normalizeContentType(material.content_type);
                  const fileDisplay = getFileDisplay(material);

                  return (
                    <tr key={material.chapter_content_id}>
                      <td><span className={`file-badge ${contentType.toLowerCase()}`}>{contentType}</span></td>
                      <td>{material.title || "-"}</td>
                      <td>{material.description || "-"}</td>
                      <td>{fileDisplay}</td>
                      <td>
                        <button className="table-action" type="button" onClick={() => openMaterial(material, setNotice)}>
                          {getActionLabel(contentType)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
