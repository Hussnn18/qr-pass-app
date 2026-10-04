package in.gndec.events.common;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Small in-memory sliding-window limiter (one server instance). Used for login attempts per IP
 * and scans per security user. Swap for Bucket4j + Redis if the app ever runs on several servers.
 */
@Component
public class RateLimiter {

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    public void check(String key, int limit, Duration window) {
        long now = System.currentTimeMillis();
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() < now - window.toMillis()) {
                q.pollFirst();
            }
            if (q.size() >= limit) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
            }
            q.addLast(now);
        }
    }

    /** Test helper. */
    public void reset() {
        hits.clear();
    }
}
