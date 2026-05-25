export function getApiBaseUrl() {
  const fallbackUrl = "/api";
  const rawUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || fallbackUrl).trim();
  const normalizedUrl = rawUrl.replace(/^https?:\/\/(?=https?:\/\/)/i, "");

  return normalizedUrl.replace(/\/+$/, "");
}
