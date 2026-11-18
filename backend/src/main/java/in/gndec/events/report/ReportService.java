package in.gndec.events.report;

import in.gndec.events.analytics.AnalyticsService;
import in.gndec.events.analytics.AnalyticsService.EventRow;
import in.gndec.events.analytics.AnalyticsService.Group;
import in.gndec.events.analytics.AnalyticsService.Overview;
import in.gndec.events.attendance.AttendanceDtos.Phase;
import in.gndec.events.attendance.AttendanceService;
import in.gndec.events.common.ApiException;
import in.gndec.events.event.Event;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.Gate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the downloadable reports (objective 5): for one event its registrations, its attendance and its
 * absentees; across events a summary with department-, semester- and category-wise participation.
 * Access follows the dashboards: organizers only for their own events, admins for all.
 */
@Service
public class ReportService {

    public enum Kind { REGISTRATIONS, ATTENDANCE, ABSENTEES }

    private final AttendanceService attendance;
    private final AnalyticsService analytics;
    private final RegistrationRepository registrations;
    private final PassRepository passes;
    private final EntryRepository entries;
    private final UserRepository users;

    public ReportService(AttendanceService attendance, AnalyticsService analytics, RegistrationRepository registrations,
            PassRepository passes, EntryRepository entries, UserRepository users) {
        this.attendance = attendance;
        this.analytics = analytics;
        this.registrations = registrations;
        this.passes = passes;
        this.entries = entries;
        this.users = users;
    }

    private static List<Object> row(Object... values) {
        return new ArrayList<>(Arrays.asList(values));
    }

    /** Name, URN or e-mail, department (or unit), semester, section. */
    private static List<Object> who(User u) {
        StudentProfile p = u.getProfile();
        return row(u.getFullName(), p != null ? p.getUrn() : u.getEmail(), p != null ? p.getDepartmentCode() : u.getUnit(),
                p != null ? p.getSemester() : null, p != null ? p.getSection() : null);
    }

    private static final List<String> WHO = List.of("Name", "URN / Email", "Department", "Sem", "Sec");
    private static final List<Integer> WHO_W = List.of(22, 14, 10, 5, 5);

    private static <T> List<T> concat(List<T> a, List<T> b) {
        List<T> out = new ArrayList<>(a);
        out.addAll(b);
        return out;
    }

    static String slug(String s) {
        String x = s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return x.length() > 50 ? x.substring(0, 50) : x;
    }

    private static List<String> eventMeta(Event e) {
        return List.of(e.getVenue().getName() + " · " + ReportWriter.TEXT_TIME.format(e.getStartsAt()) + " to "
                        + ReportWriter.TEXT_TIME.format(e.getEndsAt()) + " IST · status " + e.getStatus().name().toLowerCase(Locale.ROOT),
                "Organised by " + e.getOrganizers().stream().map(User::getFullName).collect(Collectors.joining(", ")));
    }

    // ------------------------------------------------------------------ one event

    @Transactional(readOnly = true)
    public Report event(Long eventId, Kind kind) {
        Event e = attendance.managed(eventId);
        List<Registration> regs = registrations.findForReport(List.of(e.getId()));
        List<Long> regIds = regs.stream().map(Registration::getId).toList();
        Map<Long, Entry> entryByReg = regIds.isEmpty() ? Map.of() : entries.findByRegistrationIdIn(regIds).stream()
                .collect(Collectors.toMap(Entry::getRegistrationId, Function.identity(), (a, b) -> a));
        Map<Long, String> gateNames = e.getGates().stream().collect(Collectors.toMap(Gate::getId, Gate::getName));
        List<Registration> confirmed = regs.stream().filter(r -> r.getStatus() == Registration.Status.CONFIRMED).toList();
        long present = confirmed.stream().filter(r -> entryByReg.containsKey(r.getId())).count();
        String counts = "Confirmed " + confirmed.size() + " · present " + present + " · absent " + (confirmed.size() - present)
                + " · attendance " + AttendanceService.rate(present, confirmed.size()) + "%";
        Comparator<Registration> byName = Comparator.comparing(r -> r.getUser().getFullName(), String.CASE_INSENSITIVE_ORDER);

        return switch (kind) {
            case REGISTRATIONS -> {
                Map<Long, Pass> passByReg = new HashMap<>();
                if (!regIds.isEmpty()) {
                    for (Pass p : passes.findByRegistrationIdIn(regIds)) {
                        passByReg.merge(p.getRegistration().getId(), p, (a, b) -> rank(b) > rank(a) ? b : a);
                    }
                }
                List<List<Object>> rows = regs.stream().map(r -> {
                    Pass p = passByReg.get(r.getId());
                    Entry en = entryByReg.get(r.getId());
                    List<Object> x = who(r.getUser());
                    x.addAll(row(r.getStatus().name(), r.getRegisteredAt(), r.getDecidedAt(), p == null ? null : p.getCode(),
                            p == null ? null : p.getStatus().name(), en == null ? null : en.getEnteredAt(),
                            en == null ? null : gateNames.get(en.getGateId()), r.getNote(), r.getReason()));
                    return x;
                }).toList();
                yield new Report("Registrations — " + e.getTitle(), slug(e.getTitle()) + "-registrations",
                        concat(eventMeta(e), List.of(regs.size() + " registrations · " + counts)),
                        List.of(new Report.Section("Registrations",
                                concat(WHO, List.of("Status", "Registered", "Decided", "Pass code", "Pass", "Entered", "Gate", "Note", "Reason")),
                                concat(WHO_W, List.of(11, 14, 14, 13, 8, 14, 14, 18, 18)), rows)));
            }
            case ATTENDANCE -> {
                Map<Long, String> recorders = users.findAllById(entryByReg.values().stream().map(Entry::getScannedBy).distinct().toList())
                        .stream().collect(Collectors.toMap(User::getId, User::getFullName));
                List<List<Object>> rows = confirmed.stream().filter(r -> entryByReg.containsKey(r.getId()))
                        .sorted(Comparator.comparing(r -> entryByReg.get(r.getId()).getEnteredAt()))
                        .map(r -> {
                            Entry en = entryByReg.get(r.getId());
                            List<Object> x = who(r.getUser());
                            x.addAll(row(en.getEnteredAt(), gateNames.get(en.getGateId()), method(en.getMethod()),
                                    recorders.get(en.getScannedBy()), en.getOverrideReason()));
                            return x;
                        }).toList();
                List<List<Object>> gateRows = e.getGates().stream().sorted(Comparator.comparing(Gate::getId))
                        .map(g -> row(g.getName(), entryByReg.values().stream().filter(en -> en.getGateId().equals(g.getId())).count()))
                        .toList();
                yield new Report("Attendance — " + e.getTitle(), slug(e.getTitle()) + "-attendance", concat(eventMeta(e), List.of(counts)),
                        List.of(new Report.Section("Present", concat(WHO, List.of("Entered at", "Gate", "Method", "Recorded by", "Reason")),
                                        concat(WHO_W, List.of(14, 14, 12, 18, 22)), rows),
                                new Report.Section("Entries by gate", List.of("Gate", "Entries"), List.of(30, 10), gateRows)));
            }
            case ABSENTEES -> {
                boolean ended = AttendanceService.phase(e, Instant.now()) == Phase.ENDED;
                List<List<Object>> rows = confirmed.stream().filter(r -> !entryByReg.containsKey(r.getId())).sorted(byName)
                        .map(r -> {
                            List<Object> x = who(r.getUser());
                            x.addAll(row(r.getUser().getEmail(), r.getUser().getPhone()));
                            return x;
                        }).toList();
                yield new Report((ended ? "No-shows — " : "Not arrived yet — ") + e.getTitle(), slug(e.getTitle()) + "-absentees",
                        concat(eventMeta(e), List.of(counts, ended
                                ? "Confirmed participants who never entered."
                                : "The event hasn't ended: this lists confirmed participants who haven't entered so far.")),
                        List.of(new Report.Section(ended ? "No-shows" : "Not arrived yet", concat(WHO, List.of("Email", "Phone")),
                                concat(WHO_W, List.of(26, 14)), rows)));
            }
        };
    }

    private static int rank(Pass p) {
        return switch (p.getStatus()) {
            case ACTIVE -> 3;
            case USED -> 2;
            case REVOKED -> 1;
            case EXPIRED -> 0;
        };
    }

    private static String method(Entry.Method m) {
        return switch (m) {
            case QR -> "QR scan";
            case MANUAL -> "Code typed";
            case OVERRIDE -> "Marked by organizer";
        };
    }

    // ------------------------------------------------------------------ summary across events

    @Transactional(readOnly = true)
    public Report summary(Long from, Long to) {
        Overview o = analytics.overview(from, to);
        if (o.events().isEmpty()) {
            throw ApiException.badRequest("NO_EVENTS", "No events in this range, so there is nothing to report.");
        }
        String range = (from == null ? "all time" : "from " + ReportWriter.TEXT_TIME.format(Instant.ofEpochMilli(from)).substring(0, 10))
                + (to == null ? "" : " to " + ReportWriter.TEXT_TIME.format(Instant.ofEpochMilli(to)).substring(0, 10));
        var k = o.kpis();
        List<String> meta = List.of(
                (o.allEvents() ? "All events" : "Events you organise") + ", by start date, " + range + ".",
                k.events() + " events · " + k.registrations() + " registrations · " + k.confirmed() + " confirmed · " + k.attended()
                        + " attended · " + k.noShows() + " no-shows · attendance " + k.attendanceRate() + "% · fill " + k.fillRate() + "%",
                "Attendance % counts only events whose gates have opened (blank when none have); no-shows count events that have ended.");
        List<List<Object>> events = o.events().stream().sorted(Comparator.comparingLong(EventRow::startsAt))
                .map(r -> row(r.title(), AnalyticsService.label(r.category()), r.venueName(), Instant.ofEpochMilli(r.startsAt()),
                        AnalyticsService.label(r.status()), r.capacity(), r.registrations(), r.confirmed(), r.waitlisted(), r.attended(),
                        r.noShows(), r.fillRate(), r.attendanceRate())).toList();
        Function<List<Group>, List<List<Object>>> groups = list -> list.stream()
                .map(g -> row(g.label(), g.registrations(), g.confirmed(), g.attended(), g.attendanceRate()))
                .toList();
        List<List<Object>> categories = o.categories().stream()
                .map(g -> row(g.label(), g.events(), g.registrations(), g.confirmed(), g.attended(), g.attendanceRate()))
                .toList();
        List<String> groupHead = List.of("Registrations", "Confirmed", "Attended", "Attendance %");
        return new Report("Events summary", "events-summary", meta, List.of(
                new Report.Section("Events", List.of("Event", "Category", "Venue", "Starts", "Status", "Capacity", "Registrations",
                        "Confirmed", "Waitlisted", "Attended", "No-shows", "Fill %", "Attendance %"),
                        List.of(26, 10, 18, 14, 10, 8, 11, 9, 9, 8, 8, 6, 10), events),
                new Report.Section("Department-wise", concat(List.of("Department"), groupHead), List.of(34, 12, 12, 12, 12), groups.apply(o.departments())),
                new Report.Section("Semester-wise", concat(List.of("Semester"), groupHead), List.of(20, 12, 12, 12, 12), groups.apply(o.semesters())),
                new Report.Section("Category-wise", concat(List.of("Category", "Events"), groupHead), List.of(20, 8, 12, 12, 12, 12), categories)));
    }
}
