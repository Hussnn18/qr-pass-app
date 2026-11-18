package in.gndec.events.scan;

import in.gndec.events.scan.ScanService.ScanLogView;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Live attendance feed (objective 4): organizers and admins watching an event get every gate scan and manual
 * attendance change the moment it is committed, as Server-Sent Events. Subscribers live in memory, which is
 * enough for one server instance.
 *
 * A stream closes after 10 minutes and the browser reconnects with a fresh access token, so a stream never
 * outlives the permission that opened it by much.
 */
@Component
public class LiveFeed {

    static final long TIMEOUT_MS = 10 * 60 * 1000L;

    /** Published by ScanService and AttendanceService inside their transactions; sent only after commit. */
    public record Published(Long eventId, ScanLogView item) {
    }

    public record Message(ScanLogView item, long entered) {
    }

    private final Map<Long, Set<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final EntryRepository entries;

    public LiveFeed(EntryRepository entries) {
        this.entries = entries;
    }

    public boolean hasSubscribers(Long eventId) {
        Set<SseEmitter> set = subscribers.get(eventId);
        return set != null && !set.isEmpty();
    }

    /** The caller has already checked that the current user may manage this event. */
    public SseEmitter subscribe(Long eventId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        Set<SseEmitter> set = subscribers.computeIfAbsent(eventId, k -> ConcurrentHashMap.newKeySet());
        set.add(emitter);
        Runnable remove = () -> set.remove(emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        send(set, emitter, SseEmitter.event().name("hello").data(new Message(null, entries.countByEventId(eventId)), MediaType.APPLICATION_JSON));
        return emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onPublished(Published p) {
        Set<SseEmitter> set = subscribers.get(p.eventId());
        if (set == null || set.isEmpty()) {
            return;
        }
        Message msg = new Message(p.item(), entries.countByEventId(p.eventId()));
        for (SseEmitter emitter : set) {
            send(set, emitter, SseEmitter.event().name("scan").id(String.valueOf(p.item().id())).data(msg, MediaType.APPLICATION_JSON));
        }
    }

    /** Keeps idle connections open through proxies (Render closes silent connections). */
    @Scheduled(fixedRate = 25_000, initialDelay = 25_000)
    public void heartbeat() {
        subscribers.forEach((eventId, set) -> {
            for (SseEmitter emitter : set) {
                send(set, emitter, SseEmitter.event().comment("ping"));
            }
        });
    }

    int subscriberCount(Long eventId) {
        Set<SseEmitter> set = subscribers.get(eventId);
        return set == null ? 0 : set.size();
    }

    private static void send(Set<SseEmitter> set, SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException e) {
            // The browser went away; drop it quietly (the container completes the request itself).
            set.remove(emitter);
        }
    }
}
