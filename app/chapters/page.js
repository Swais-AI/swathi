import ChapterSelector from "../chapter-selector";
import DashboardShell from "../dashboard-shell";
import StudyTabs from "../study-tabs";

export default function ChaptersPage() {
  return (
    <DashboardShell>
      <section className="chapter-screen">
        <StudyTabs />
        <ChapterSelector showReader />
      </section>
    </DashboardShell>
  );
}
