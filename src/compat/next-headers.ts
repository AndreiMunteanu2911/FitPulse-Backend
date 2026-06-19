import { getRequestContext } from './request-context';

type CookieRecord = {
  name: string;
  value: string;
};

function parseCookieHeader(header: string | undefined): CookieRecord[] {
  if (!header) return [];

  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return { name: part, value: '' };

      return {
        name: decodeURIComponent(part.slice(0, separator).trim()),
        value: decodeURIComponent(part.slice(separator + 1).trim()),
      };
    });
}

export async function cookies() {
  const context = getRequestContext();

  return {
    getAll() {
      return parseCookieHeader(context.req.headers.cookie);
    },
    setAll(cookiesToSet: { name: string; value: string; options?: Record<string, any> }[]) {
      context.cookiesToSet.push(...cookiesToSet);
    },
    set(name: string, value: string, options?: Record<string, any>) {
      context.cookiesToSet.push({ name, value, options });
    },
  };
}
