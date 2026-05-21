import DashboardShell from "../dashboard-shell";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <section className="module-page">
        <div className="module-content-area">
          <article className="module-card blue-module">
            <h2>Settings</h2>
            <p>Manage language, notifications, and account preferences from this page.</p>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
