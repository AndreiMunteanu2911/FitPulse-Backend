export class NextRequest extends Request {
  readonly nextUrl: URL;

  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(this.url);
  }
}

export class NextResponse<T = unknown> extends Response {
  static json<T>(body: T, init?: ResponseInit): NextResponse<T> {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }

    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers,
    });
  }

  static redirect(url: string | URL, init?: ResponseInit | number): NextResponse {
    const status = typeof init === 'number' ? init : init?.status ?? 307;
    const headers = new Headers(typeof init === 'number' ? undefined : init?.headers);
    headers.set('location', String(url));

    return new NextResponse(null, { status, headers });
  }
}
