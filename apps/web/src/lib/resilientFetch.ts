export type ResilientFetchOptions = RequestInit & {
  /** Total attempts including the first (default 5) */
  retries?: number;
  /** Base delay ms for exponential backoff (default 1200) */
  baseDelayMs?: number;
  /** Max delay cap ms (default 15000) */
  maxDelayMs?: number;
  /** Called on each retry */
  onRetry?: (info: {
    attempt: number;
    retriesLeft: number;
    error: unknown;
    waitingForOnline: boolean;
  }) => void;
  /** Abort the whole resilient sequence */
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true; // Failed to fetch
  const msg = String((err as any)?.message || err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Wait until browser is online (or timeout). */
function waitForOnline(timeoutMs = 120_000, signal?: AbortSignal): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Still offline — timed out waiting for network'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      signal?.removeEventListener('abort', onAbort);
    };

    window.addEventListener('online', onOnline);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * fetch with exponential backoff + offline pause.
 * Note: FormData bodies can be retried safely for a full re-upload.
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    retries = 5,
    baseDelayMs = 1200,
    maxDelayMs = 15_000,
    onRetry,
    signal,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // Pause if offline before attempting
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      onRetry?.({
        attempt,
        retriesLeft: retries - attempt,
        error: new Error('offline'),
        waitingForOnline: true,
      });
      await waitForOnline(120_000, signal);
    }

    try {
      const res = await fetch(url, { ...init, signal });

      if (!res.ok && isRetryableStatus(res.status) && attempt < retries) {
        lastError = new Error(`HTTP ${res.status}`);
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        onRetry?.({
          attempt,
          retriesLeft: retries - attempt,
          error: lastError,
          waitingForOnline: false,
        });
        await sleep(delay, signal);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (!isRetryableNetworkError(err) || attempt >= retries) {
        throw err;
      }

      // If offline, wait for online; else backoff
      const offline =
        typeof navigator !== 'undefined' && !navigator.onLine;
      onRetry?.({
        attempt,
        retriesLeft: retries - attempt,
        error: err,
        waitingForOnline: offline,
      });

      if (offline) {
        await waitForOnline(120_000, signal);
      } else {
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        await sleep(delay, signal);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || 'Network request failed'));
}