type RateLimitConfig = {
  rps: number;
  burst: number;
  concurrency: number;
};

type QueueItem = {
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

/**
 * creates a rate limiter that wraps async functions with burst, rate, and concurrency controls
 *
 * @param config - rate limit configuration
 * @param config.rps - maximum requests per second
 * @param config.burst - maximum burst size (initial token bucket capacity)
 * @param config.concurrency - maximum concurrent in-flight requests
 *
 * @example
 * const limiter = rateLimited({ rps: 10, burst: 20, concurrency: 5 });
 *
 * const workflow = limiter(
 *   compose(
 *     scope({ tools: [searchTool] }, model())
 *   )
 * );
 *
 * await workflow("hello");
 */
export const rateLimited =
  (config: RateLimitConfig) =>
  <T extends (...args: any[]) => Promise<any>>(fn: T): T => {
    const { rps, burst, concurrency } = config;

    let tokens = burst;
    let inFlight = 0;
    const queue: QueueItem[] = [];
    let intervalId: NodeJS.Timeout | null = null;

    const refillTokens = () => {
      tokens = Math.min(tokens + 1, burst);
      processQueue();
    };

    const startInterval = () => {
      if (!intervalId) {
        intervalId = setInterval(refillTokens, 1000 / rps);
      }
    };

    const stopInterval = () => {
      if (intervalId && queue.length === 0 && inFlight === 0) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const processQueue = () => {
      while (queue.length > 0 && tokens > 0 && inFlight < concurrency) {
        tokens--;
        inFlight++;

        const item = queue.shift()!;

        item
          .fn()
          .then((result) => {
            inFlight--;
            item.resolve(result);
            processQueue();
            stopInterval();
          })
          .catch((error) => {
            inFlight--;
            item.reject(error);
            processQueue();
            stopInterval();
          });
      }
    };

    return (async (...args: any[]) => {
      return new Promise((resolve, reject) => {
        queue.push({
          fn: () => fn(...args),
          resolve,
          reject,
        });
        startInterval();
        processQueue();
      });
    }) as T;
  };
