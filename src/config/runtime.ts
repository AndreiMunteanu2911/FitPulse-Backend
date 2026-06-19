const DEFAULT_WEB_APP_URL = "http://localhost:3000";

export function getWebAppUrl(): string {
  return (process.env.WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/+$/, "");
}

export function getAllowedOrigins(): string[] {
  const configured = process.env.FRONTEND_ORIGIN
    ?.split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return configured?.length ? configured : [DEFAULT_WEB_APP_URL];
}
