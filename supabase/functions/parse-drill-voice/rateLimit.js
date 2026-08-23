export const HOURLY_REQUEST_LIMIT = 15;

export function isRateLimited(recentRequestCount, limit = HOURLY_REQUEST_LIMIT) {
  return recentRequestCount >= limit;
}
