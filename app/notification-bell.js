"use client";

import { useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "./api-base-url";

const API_BASE_URL = getApiBaseUrl();

function formatNoticeDate(dateValue) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function NotificationBell() {
  const menuRef = useRef(null);
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadNotices() {
      setError("");

      try {
        let studentClass = "";
        const studentResponse = await fetch(`${API_BASE_URL}/students/current`);
        const studentData = await studentResponse.json().catch(() => ({}));

        if (studentResponse.ok && studentData.student?.class_name) {
          studentClass = studentData.student.class_name;
        }

        const params = new URLSearchParams();
        if (studentClass) {
          params.set("student_class", studentClass);
        }

        const response = await fetch(`${API_BASE_URL}/notices${params.toString() ? `?${params.toString()}` : ""}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load notices.");
        }

        if (!cancelled) {
          setNotices(Array.isArray(data.notices) ? data.notices : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load notices.");
        }
      }
    }

    loadNotices();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [open]);

  return (
    <div className="notification-menu" ref={menuRef}>
      <button className="bell-button" aria-label="Notifications" type="button" onClick={() => setOpen((current) => !current)}>
        <span className="bell-icon" aria-hidden="true" />
        {notices.length > 0 && <span className="badge">{notices.length}</span>}
      </button>

      {open && (
        <div className="notice-dropdown" role="dialog" aria-label="Notice board">
          <div className="notice-dropdown-head">
            <strong>Notice Board</strong>
            <span>{notices.length}</span>
          </div>

          {error && <p className="notice-message">{error}</p>}
          {!error && notices.length === 0 && <p className="notice-message">No notices found.</p>}

          {!error && notices.map((notice) => (
            <article className="notice-item" key={notice.notice_id}>
              <div>
                <strong>{notice.notice_title || "Notice"}</strong>
                <time>{formatNoticeDate(notice.notice_date)}</time>
              </div>
              <p>{notice.notice_text || "-"}</p>
              <span>{notice.applicable_class || "All"}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
