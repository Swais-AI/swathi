import { getApiBaseUrl } from "./api-base-url";

const CONFIGURED_LOGIN_SERVICE_URL = (process.env.NEXT_PUBLIC_LOGIN_URL || "").trim().replace(/\/+$/, "");
const API_BASE_URL = getApiBaseUrl();

function getLoginServiceUrl() {
  if (CONFIGURED_LOGIN_SERVICE_URL) {
    return CONFIGURED_LOGIN_SERVICE_URL;
  }

  return typeof window !== "undefined" ? window.location.origin : "";
}

let sessionPromise = null;

export async function getLoggedInUserEmail() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const response = await fetch(`${getLoginServiceUrl()}/api/auth/session`, {
          credentials: "include"
        });
        if (response.ok) {
          const session = await response.json().catch(() => ({}));
          const email = session?.user?.email?.trim();
          if (email) return email;
        }
      } catch {
        // Local development may run without the external login application.
      }

      if (process.env.NODE_ENV !== "production") {
        const demoEmail = process.env.NEXT_PUBLIC_DEMO_STUDENT_EMAIL?.trim();
        if (demoEmail) return demoEmail;
        try {
          const response = await fetch(`${API_BASE_URL}/students/current`);
          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            return data?.student?.student_email?.trim() || null;
          }
        } catch {
          return null;
        }
      }

      return null;
    })();
  }

  return sessionPromise;
}
