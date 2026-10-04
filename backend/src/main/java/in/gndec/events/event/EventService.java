package in.gndec.events.event;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.PageResponse;
import in.gndec.events.event.EventDtos.EligibilityCheck;
import in.gndec.events.event.EventDtos.EventView;
import in.gndec.events.event.EventDtos.Stats;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Event discovery for every signed-in user (requirement O1-11). */
@Service
public class EventService {

    private static final EnumSet<Event.Status> LISTED = EnumSet.of(Event.Status.PUBLISHED, Event.Status.CLOSED,
            Event.Status.COMPLETED, Event.Status.CANCELLED);

    private final EventRepository events;
    private final UserRepository users;
    private final EventViews views;
    private final EligibilityService eligibility;
    private final EventAccess access;

    public EventService(EventRepository events, UserRepository users, EventViews views, EligibilityService eligibility,
            EventAccess access) {
        this.events = events;
        this.users = users;
        this.views = views;
        this.eligibility = eligibility;
        this.access = access;
    }

    User viewer() {
        return users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account"));
    }

    /**
     * Filters run in memory: a college has tens to a few hundred events, and eligibility needs the
     * student's profile anyway. Only the requested page is turned into full views.
     */
    @Transactional(readOnly = true)
    public PageResponse<EventView> browse(String q, Event.Category category, String when, boolean eligibleOnly,
            boolean openOnly, int page, int size) {
        User viewer = viewer();
        Instant now = Instant.now();
        boolean participant = viewer.getRole() == Role.STUDENT || viewer.getRole() == Role.GUEST;
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        String range = when == null ? "upcoming" : when;
        List<Event> list = events.findByStatusIn(LISTED).stream()
                .filter(e -> viewer.getRole() != Role.GUEST || e.isAllowOutsiders())
                .filter(e -> category == null || e.getCategory() == category)
                .filter(e -> needle.isEmpty() || (e.getTitle() + " " + e.getDescription() + " " + e.getVenue().getName())
                        .toLowerCase(Locale.ROOT).contains(needle))
                .filter(e -> switch (range) {
                    case "past" -> e.getEndsAt().isBefore(now);
                    case "week" -> !e.getEndsAt().isBefore(now) && e.getStartsAt().isBefore(now.plus(Duration.ofDays(7)));
                    case "month" -> !e.getEndsAt().isBefore(now) && e.getStartsAt().isBefore(now.plus(Duration.ofDays(30)));
                    case "all" -> true;
                    default -> !e.getEndsAt().isBefore(now);
                })
                .filter(e -> !eligibleOnly || !participant || eligibility.check(viewer, e).eligible())
                .sorted("past".equals(range) ? Comparator.comparing(Event::getStartsAt).reversed() : Comparator.comparing(Event::getStartsAt))
                .toList();
        if (openOnly) {
            Map<Long, Stats> stats = views.stats(list);
            list = list.stream().filter(e -> eligibility.window(e, now).open() && stats.get(e.getId()).remaining() > 0).toList();
        }
        PageResponse<Event> p = PageResponse.ofList(list, page, size);
        return new PageResponse<>(views.build(p.items(), viewer, false), p.page(), p.size(), p.total(), p.pages());
    }

    @Transactional(readOnly = true)
    public EventView detail(Long id) {
        User viewer = viewer();
        return views.one(visible(id, viewer), viewer, true);
    }

    @Transactional(readOnly = true)
    public EligibilityCheck checkEligibility(Long id) {
        User viewer = viewer();
        return eligibility.check(viewer, visible(id, viewer));
    }

    Event visible(Long id, User viewer) {
        Event e = events.findById(id).orElseThrow(() -> ApiException.notFound("Event"));
        boolean hidden = (e.getStatus() == Event.Status.DRAFT && !access.canManage(e))
                || (viewer.getRole() == Role.GUEST && !e.isAllowOutsiders());
        if (hidden) {
            throw ApiException.notFound("Event");
        }
        return e;
    }
}
