"use client";

import { useState } from "react";

const navItems = [
  ["home", "Dashboard", "/", true],
  ["book-open", "Core Study", "/chapters"],
  ["clipboard", "Assignments", "/assignments"],
  ["target", "Assessments", "/assessments"],
  ["chart", "My Progress", "/progress"]
];

const settingsItems = [
  ["settings", "Settings", "/settings"],
  ["help", "Help & Support", "/help"]
];

const panels = [
  {
    tone: "green",
    icon: "book-open",
    title: "Study A: Core Material",
    rows: [
      ["book-open", "1) Chapters"],
      ["document", "2) Study Material"],
      ["question", "3) Quizzes"],
      ["chart", "4) AI Learning Path"]
    ]
  },
  {
    tone: "orange",
    icon: "clipboard",
    title: "Study B: Assignment",
    rows: [
      ["clipboard", "1) My Assignments"],
      ["upload", "2) Submit Assignment"],
      ["star", "3) Feedback & Marks"]
    ]
  },
  {
    tone: "purple",
    icon: "target",
    title: "Study C: Assessment",
    rows: [
      ["checklist", "1) Unit Test"],
      ["monitor", "2) Mock Test"],
      ["star", "3) Feedback & Marks"],
      ["chart", "4) Student Analysis"],
      ["note", "5) Teacher Remark"]
    ]
  }
];

function Icon({ name, className = "" }) {
  return <span className={`icon ${name} ${className}`} aria-hidden="true" />;
}

function PanelIcon({ name }) {
  if (name === "book-open") {
    return (
      <svg className="panel-svg" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4.5 7.4c4.1-.9 7.7-.2 10.8 2.1v16.1c-3.1-2.3-6.7-3-10.8-2.1z" />
        <path d="M27.5 7.4c-4.1-.9-7.7-.2-10.8 2.1v16.1c3.1-2.3 6.7-3 10.8-2.1z" />
        <path d="M8.2 11.3c1.9-.2 3.6.2 5.1 1.1M8.2 15.1c1.9-.2 3.6.2 5.1 1.1M8.2 18.9c1.9-.2 3.6.2 5.1 1.1M23.8 11.3c-1.9-.2-3.6.2-5.1 1.1M23.8 15.1c-1.9-.2-3.6.2-5.1 1.1M23.8 18.9c-1.9-.2-3.6.2-5.1 1.1" />
      </svg>
    );
  }

  if (name === "clipboard") {
    return (
      <svg className="panel-svg" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M10.2 6.8H8.5a2.3 2.3 0 0 0-2.3 2.3v17.1a2.3 2.3 0 0 0 2.3 2.3h15a2.3 2.3 0 0 0 2.3-2.3V9.1a2.3 2.3 0 0 0-2.3-2.3h-1.7" />
        <path d="M12.1 8.8h7.8V5.9h-2.1a2 2 0 0 0-3.6 0h-2.1z" />
        <path d="m11.1 14.2 1.7 1.7 3.1-3.2M18.5 15h4.2M11.1 20.2l1.7 1.7 3.1-3.2M18.5 21h4.2" />
      </svg>
    );
  }

  return (
    <svg className="panel-svg" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="14.3" cy="17.7" r="9.8" />
      <circle cx="14.3" cy="17.7" r="5.2" />
      <circle cx="14.3" cy="17.7" r="1.8" />
      <path d="M20.8 11.2 27.4 4.6v5h-5M20.8 11.2h5.1" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 72 58" aria-hidden="true">
      <path
        className="logo-ray"
        d="M36 0l3.2 13.1L48.4 3l-3.7 13L58 10.7l-9.6 9.1 13.4 1.4-12.6 4.6 11.7 6.7-13.4-1.1 7.4 11.3-11.1-7.2-2 13.3L36 36.6l-5.8 12.2-2-13.3-11.1 7.2 7.4-11.3-13.4 1.1 11.7-6.7-12.6-4.6 13.4-1.4-9.6-9.1L27.3 16 23.6 3l9.2 10.1L36 0z"
      />
      <path className="logo-sun" d="M19.8 35.5c0-9.1 7.2-16.4 16.2-16.4s16.2 7.3 16.2 16.4v1.2H19.8z" />
      <path className="logo-book" d="M34.5 41.4c-7.5-5.5-16.1-7.4-25.9-5.6v9.7c9.8-1.9 18.5.1 25.9 5.7z" />
      <path className="logo-book" d="M37.5 41.4c7.5-5.5 16.1-7.4 25.9-5.6v9.7c-9.8-1.9-18.5.1-25.9 5.7z" />
      <path className="logo-page" d="M34.6 45.6c-8-5.1-16.4-6.7-25.3-4.8" />
      <path className="logo-page" d="M37.4 45.6c8-5.1 16.4-6.7 25.3-4.8" />
      <path className="logo-page" d="M34.6 50.5c-8-5-16.4-6.7-25.3-4.8" />
      <path className="logo-page" d="M37.4 50.5c8-5 16.4-6.7 25.3-4.8" />
    </svg>
  );
}

function Avatar() {
  return (
    <div className="avatar" aria-hidden="true">
      <svg viewBox="0 0 120 120" role="img">
        <circle cx="60" cy="60" r="58" fill="#f4f5f7" />
        <circle cx="60" cy="42" r="29" fill="#3b291f" />
        <path d="M24 113c7-25 24-39 36-39s29 14 36 39" fill="#fff" stroke="#07192c" strokeWidth="3" />
        <path d="M52 79h16l-3 35H55z" fill="#1a62a3" />
        <path d="M38 40c1-19 11-28 23-28 13 0 22 10 22 28v11c0 18-11 32-22 32-12 0-23-14-23-32z" fill="#ffd2a3" stroke="#07192c" strokeWidth="3" />
        <circle cx="49" cy="50" r="3.2" fill="#07192c" />
        <circle cx="72" cy="50" r="3.2" fill="#07192c" />
        <path d="M53 64c5 5 12 5 17 0" fill="none" stroke="#07192c" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 49c3-18 12-27 28-28 15 1 25 12 27 29-11-1-22-7-29-17-5 10-15 15-26 16z" fill="#2d2018" />
        <path d="M45 82l15 11 15-11" fill="none" stroke="#07192c" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StudyPanel({ panel, open, onToggle }) {
  const isCoreMaterial = panel.title === "Study A: Core Material";

  return (
    <article className={`study-panel ${panel.tone} ${open ? "" : "collapsed"}`}>
      <button className="panel-head" type="button" aria-expanded={open} onClick={onToggle}>
        <PanelIcon name={panel.icon} />
        <span className="panel-title">{panel.title}</span>
        <span className="chevron" aria-hidden="true" />
      </button>
      <div className="accent-line" />
      <div className="panel-body">
        {panel.rows.map(([icon, label]) => {
          const coreLinks = {
            "1) Chapters": "/chapters",
            "2) Study Material": "/study-material",
            "3) Quizzes": "/quizzes",
            "4) AI Learning Path": "/ai-learning-path"
          };
          const rowHref = isCoreMaterial ? coreLinks[label] : panel.tone === "orange" ? "/assignments" : panel.tone === "purple" ? "/assessments" : "#";

          return (
            <a className="study-row" href={rowHref} key={label}>
              <span>{label}</span>
            </a>
          );
        })}
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const [openPanel, setOpenPanel] = useState(null);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-title">SWAIS</div>
            <div className="brand-subtitle">Shreeram Vidhyapeeth JV</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="Student navigation">
          {navItems.map(([icon, label, href, active]) => (
            <a className={`nav-item ${active ? "active" : ""}`} href={href} key={label}>
              <Icon name={icon} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="nav-divider" />

        <nav className="nav-list compact" aria-label="Settings navigation">
          {settingsItems.map(([icon, label, href]) => (
            <a className="nav-item" href={href} key={label}>
              <Icon name={icon} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="nav-divider" />

        <a className="nav-item logout-link" href="#">
          <Icon name="power" />
          <span>Logout</span>
        </a>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="student-card">
            <Avatar />
            <div className="student-info">
              <p>Welcome back,</p>
              <h1>Aarav</h1>
              <div className="chips">
                <span>Roll No.: 23</span>
                <span>Admission No.: 2024/08/0156</span>
                <span>Class: Class 9</span>
                <span>Section: A</span>
              </div>
            </div>
          </div>

          <div className="top-actions">
            <label className="language-select">
              <span>Language</span>
              <select defaultValue="English" aria-label="Select language">
                <option>English</option>
                <option>Hindi</option>
                <option>Telugu</option>
              </select>
            </label>
            <button className="bell-button" aria-label="Notifications">
              <span className="bell-icon" aria-hidden="true" />
              <span className="badge">3</span>
            </button>
            <button className="top-logout" type="button">
              <span className="exit-icon" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <section className="content-grid" aria-label="Study modules">
          {panels.map((panel, index) => (
            <StudyPanel
              panel={panel}
              open={openPanel === index}
              onToggle={() => setOpenPanel((current) => (current === index ? null : index))}
              key={panel.title}
            />
          ))}
        </section>
      </section>
    </main>
  );
}
