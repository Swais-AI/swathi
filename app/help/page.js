"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "../api-base-url";
import DashboardShell from "../dashboard-shell";

const API_BASE_URL = getApiBaseUrl();

export default function HelpPage() {
  const [helpItems, setHelpItems] = useState([]);
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHelpSupport() {
      try {
        const response = await fetch(`${API_BASE_URL}/help-support`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.detail === "string" ? data.detail : "Unable to load help information.");
        }
        if (!cancelled) {
          setHelpItems(Array.isArray(data.items) ? data.items : []);
          setSupportEmail(data.support_email || "");
          setSupportPhone(data.support_phone || "");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Unable to load help information.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHelpSupport();
    return () => { cancelled = true; };
  }, []);

  return (
    <DashboardShell>
      <section className="module-page">
        <div className="module-content-area">
          <article className="module-card blue-module help-card">
            <h2>Help &amp; Support</h2>
            <p>Choose a quick action or review the common questions below.</p>

            <div className="help-action-grid">
              <Link href="/assignments#submit"><strong>Assignment help</strong><span>Open the submission area and upload your work.</span></Link>
              <Link href="/assessments?view=mock-test"><strong>Assessment help</strong><span>Open mock tests and assessment results.</span></Link>
              {supportEmail ? (
                <a href={`mailto:${supportEmail}?subject=Student%20portal%20support`}>
                  <strong>Contact support</strong>
                  <span>{supportEmail}{supportPhone ? ` · ${supportPhone}` : ""}</span>
                </a>
              ) : (
                <div className="help-action-disabled"><strong>Contact support</strong><span>Support contact is not available.</span></div>
              )}
            </div>

            <div className="help-faq-list">
              <h3>Frequently asked questions</h3>
              {loading && <p role="status">Loading help information...</p>}
              {!loading && error && <p className="module-error" role="alert">{error}</p>}
              {!loading && !error && helpItems.length === 0 && <p>No help information is available.</p>}
              {!loading && !error && helpItems.map((item) => (
                <details key={item.help_id}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                  {item.category && <small>{item.category}</small>}
                </details>
              ))}
            </div>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
