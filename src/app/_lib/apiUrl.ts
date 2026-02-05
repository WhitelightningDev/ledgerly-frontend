const DEFAULT_DEV_API_URL = "http://127.0.0.1:8000";
const DEFAULT_PROD_API_URL = "https://ledgerly-backend-lau2.onrender.com";

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function getApiUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) return stripTrailingSlash(raw);

  const fallback =
    process.env.NODE_ENV === "production" ? DEFAULT_PROD_API_URL : DEFAULT_DEV_API_URL;
  return stripTrailingSlash(fallback);
}

