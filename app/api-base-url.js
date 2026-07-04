export function getApiBaseUrl() {
  const fallbackUrl = "/api";
  const rawUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || fallbackUrl).trim();
  let normalizedUrl = rawUrl.replace(/^https?:\/\/(?=https?:\/\/)/i, "");

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    normalizedUrl.startsWith("http://")
  ) {
    normalizedUrl = normalizedUrl.replace(/^http:\/\//i, "https://");
  }

  return normalizedUrl.replace(/\/+$/, "");
}
