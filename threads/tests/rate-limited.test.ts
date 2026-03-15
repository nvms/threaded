import { describe, it, expect } from "vitest";
import { rateLimited } from "../src/utils/rateLimited";

describe("rateLimited", () => {
  it("limits concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const fn = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight--;
    };

    const limited = rateLimited({ rps: 100, burst: 100, concurrency: 2 })(fn);

    await Promise.all([limited(), limited(), limited(), limited(), limited()]);

    expect(maxInFlight).toBe(2);
  });

  it("limits rate per second", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
    };

    const limited = rateLimited({ rps: 20, burst: 5, concurrency: 100 })(fn);

    const start = Date.now();
    await Promise.all(
      Array(10)
        .fill(0)
        .map(() => limited()),
    );
    const duration = Date.now() - start;

    expect(callCount).toBe(10);
    expect(duration).toBeGreaterThan(200);
  });

  it("allows bursts", async () => {
    const calls: number[] = [];
    const fn = async () => {
      calls.push(Date.now());
    };

    const limited = rateLimited({ rps: 5, burst: 10, concurrency: 100 })(fn);

    await Promise.all(
      Array(10)
        .fill(0)
        .map(() => limited()),
    );

    const duration = Math.max(...calls) - Math.min(...calls);

    expect(duration).toBeLessThan(200);
  });

  it("preserves function arguments and return value", async () => {
    const fn = async (a: number, b: number) => a + b;

    const limited = rateLimited({ rps: 100, burst: 100, concurrency: 10 })(fn);

    const result = await limited(2, 3);

    expect(result).toBe(5);
  });

  it("propagates errors", async () => {
    const fn = async () => {
      throw new Error("test error");
    };

    const limited = rateLimited({ rps: 100, burst: 100, concurrency: 10 })(fn);

    await expect(limited()).rejects.toThrow("test error");
  });
});
