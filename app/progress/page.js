import DashboardShell from "../dashboard-shell";

export default function ProgressPage() {
  return (
    <DashboardShell>
      <section className="module-page">
        <div className="module-content-area">
          <article className="module-card blue-module">
            <h2>My Progress</h2>
            <p>Your chapter reading, assignments, assessment scores, and teacher feedback will appear here.</p>
          </article>
        </div>
      </section>
    </DashboardShell>
  );
}
