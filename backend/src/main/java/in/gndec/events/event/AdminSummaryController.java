package in.gndec.events.event;

import in.gndec.events.event.EventDtos.Stats;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.user.Role;
import in.gndec.events.user.StudentProfileRepository;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Numbers for the admin home page. Charts and reports come with objective 5. */
@RestController
public class AdminSummaryController {

    public record LiveEvent(Long id, String title, String venueName, long endsAt, long entered, long confirmed) {
    }

    public record Summary(long students, long notEnrolled, long organizers, long security, long upcomingEvents,
            long pendingApprovals, long lockedAccounts, long entriesToday, List<LiveEvent> live) {
    }

    private final UserRepository users;
    private final StudentProfileRepository profiles;
    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final EntryRepository entries;
    private final EventViews views;

    public AdminSummaryController(UserRepository users, StudentProfileRepository profiles, EventRepository events,
            RegistrationRepository registrations, EntryRepository entries, EventViews views) {
        this.users = users;
        this.profiles = profiles;
        this.events = events;
        this.registrations = registrations;
        this.entries = entries;
        this.views = views;
    }

    @GetMapping("/api/v1/admin/summary")
    @Transactional(readOnly = true)
    public Summary summary() {
        Instant now = Instant.now();
        ZoneId ist = ZoneId.of("Asia/Kolkata");
        List<Event> running = events.findByStatusIn(EnumSet.of(Event.Status.PUBLISHED, Event.Status.CLOSED)).stream()
                .filter(e -> !e.getStartsAt().isAfter(now.plusSeconds(Event.ENTRY_WINDOW_MINUTES * 60)) && e.getEndsAt().isAfter(now))
                .toList();
        Map<Long, Stats> stats = views.stats(running);
        return new Summary(users.countByRole(Role.STUDENT), profiles.countByEnrolledFalse(), users.countByRole(Role.ORGANIZER),
                users.countByRole(Role.SECURITY), events.countByStatusAndStartsAtAfter(Event.Status.PUBLISHED, now),
                registrations.countByStatus(Registration.Status.PENDING), users.countByStatus(User.Status.LOCKED),
                entries.countByEnteredAtAfter(LocalDate.now(ist).atStartOfDay(ist).toInstant()),
                running.stream().map(e -> new LiveEvent(e.getId(), e.getTitle(), e.getVenue().getName(), e.getEndsAt().toEpochMilli(),
                        stats.get(e.getId()).entered(), stats.get(e.getId()).confirmed())).toList());
    }
}
