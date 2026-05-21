import "./globals.css";

export const metadata = {
  title: "SWAIS Dashboard",
  description: "Student dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
