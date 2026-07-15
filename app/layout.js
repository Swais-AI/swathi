import "./globals.css";
import DashboardShell from "./dashboard-shell";
import { LanguageProvider } from "./i18n";

export const metadata = {
  title: "SWAIS Dashboard",
  description: "Student dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <DashboardShell>{children}</DashboardShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
