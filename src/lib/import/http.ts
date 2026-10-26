export type FetchFn = typeof fetch;

export class ImportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/**
 * GET with polite rate-limit handling: on HTTP 429 waits (Retry-After or 60 s,
 * per the Lichess and Chess.com guidelines) and retries once.
 */
export async function politeGet(
  url: string,
  init: RequestInit & { fetchFn?: FetchFn } = {},
): Promise<Response> {
  const { fetchFn = fetch, ...rest } = init;
  let res: Response;
  try {
    res = await fetchFn(url, rest);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ImportError('Network error — check your connection and try again.');
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 60;
    await sleep(retryAfter * 1000, rest.signal ?? undefined);
    res = await fetchFn(url, rest);
  }
  return res;
}
