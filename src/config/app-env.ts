type AppEnv = "development" | "production";

const DEFAULT_PRODUCTION_APP_URL = "https://fitpulseam.vercel.app";
const DEFAULT_ANDROID_DEV_SERVER_URL = "http://10.0.2.2:3000";

function normalizeEnv(value?: string | null): AppEnv {
  return value === "production" ? "production" : "development";
}

export function getAppEnv(): AppEnv {
  return normalizeEnv(
    process.env.CAP_APP_ENV ??
      process.env.NEXT_PUBLIC_APP_ENV ??
      (process.env.NODE_ENV === "production" ? "production" : "development"),
  );
}

export function getProductionAppUrl(): string {
  return (process.env.NEXT_PUBLIC_PRODUCTION_APP_URL || DEFAULT_PRODUCTION_APP_URL).replace(/\/+$/, "");
}

export function getAndroidDevServerUrl(): string {
  return (process.env.CAP_ANDROID_DEV_SERVER_URL || DEFAULT_ANDROID_DEV_SERVER_URL).replace(/\/+$/, "");
}

export function getAndroidDevHost(): string {
  return new URL(getAndroidDevServerUrl()).host;
}

export function getWebAppBaseUrl(origin?: string): string {
  if (getAppEnv() === "production") {
    return getProductionAppUrl();
  }

  return (origin || getAndroidDevServerUrl()).replace(/\/+$/, "");
}

export function isProductionAppEnv(): boolean {
  return getAppEnv() === "production";
}
