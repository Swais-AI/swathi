"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "./i18n";
import NotificationBell from "./notification-bell";
import StudentProfile from "./student-profile";

const navItems = [
  ["home", "dashboard", "/"],
  ["book-open", "coreStudy", "/chapters"],
  ["clipboard", "assignments", "/assignments"],
  ["target", "assessments", "/assessments"],
  ["chart", "myProgress", "/progress"]
];

const settingsItems = [
  ["settings", "settings", "/settings"],
  ["help", "helpSupport", "/help"]
];

function Icon({ name, className = "" }) {
  return <span className={`icon ${name} ${className}`} aria-hidden="true" />;
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

export default function DashboardShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { language, languageOptions, setLanguage, t } = useLanguage();

  function isActive(href) {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleLogout(event) {
    event.preventDefault();
    window.localStorage.removeItem("swais-auth-token");
    window.sessionStorage.clear();
    router.push("/login");
  }

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
          {navItems.map(([icon, labelKey, href]) => (
            <a className={`nav-item ${isActive(href) ? "active" : ""}`} href={href} key={labelKey}>
              <Icon name={icon} />
              <span>{t(labelKey)}</span>
            </a>
          ))}
        </nav>

        <div className="nav-divider" />

        <nav className="nav-list compact" aria-label="Settings navigation">
          {settingsItems.map(([icon, labelKey, href]) => (
            <a className={`nav-item ${isActive(href) ? "active" : ""}`} href={href} key={labelKey}>
              <Icon name={icon} />
              <span>{t(labelKey)}</span>
            </a>
          ))}
        </nav>

        <div className="nav-divider" />

        <a className="nav-item logout-link" href="/login" onClick={handleLogout}>
          <Icon name="power" />
          <span>{t("logout")}</span>
        </a>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="student-card">
            <Avatar />
            <StudentProfile />
          </div>

          <div className="top-actions">
            <label className="language-select">
              <span>{t("language")}</span>
              <select value={language} aria-label="Select language" onChange={(event) => setLanguage(event.target.value)}>
                {languageOptions.map((option) => (
                  <option value={option.code} key={option.code}>{option.label}</option>
                ))}
              </select>
            </label>
            <NotificationBell />
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
