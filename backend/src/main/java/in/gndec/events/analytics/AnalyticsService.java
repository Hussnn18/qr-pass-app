package in.gndec.events.analytics;

import in.gndec.events.attendance.AttendanceDtos.Phase;
import in.gndec.events.attendance.AttendanceService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventDtos.Stats;
import in.gndec.events.event.EventRepository;
import in.gndec.events.event.EventViews;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.user.Department;
import in.gndec.events.user.DepartmentRepository;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.GateRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dashboards and analytics (objective 5). Admins see every event; organizers see only the events they
 * organise. Drafts are never counted. The optional date range applies to the event's start time.
 *
 * Definitions used everywhere (dashboard, reports, report chapter):
 *  - registrations: every registration request, whatever happened to it;
 *  - attended: confirmed participants with an entry (scan or manual);
 *  - attendance rate: attended / confirmed, over events whose gates have opened;
 *  - no-shows: confirmed but never entered, over events that have ended;
 *  - fill rate: confirmed / capacity, over events that weren't cancelled.
 */
@Service
public class AnalyticsService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd MMM", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);

    public record Kpis(long events, long upcoming, long running, long ended, long cancelled, long registrations, long confirmed,
            long waitlisted, long pending, long attended, long noShows, int attendanceRate, int fillRate) {
    }

    /**
     * A department, semester or category: how many registered, were confirmed and attended. The attendance rate
     * only counts events whose gates have opened (null when there are none), like the headline figure.
     */
    public record Group(String key, String label, long events, long registrations, long confirmed, long attended, Integer attendanceRate) {

        static Group of(String key, String label, long events, long[] agg) {
            return new Group(key, label, events, agg[0], agg[1], agg[2], agg[3] == 0 ? null : AttendanceService.rate(agg[2], agg[3]));
        }
    }

    public record EventRow(Long id, String title, String category, String status, String phase, long startsAt, String venueName,
            int capacity, long registrations, long confirmed, long waitlisted, long attended, long noShows, int fillRate,
            Integer attendanceRate) {
    }

    public record GateRow(Long gateId, String gateName, String venueName, long entries) {
    }

    public record Point(String label, long registrations, long checkins) {
    }

    public record Overview(Long from, Long to, boolean allEvents, Kpis kpis, Map<String, Long> registrationStatus,
            List<Group> departments, List<Group> semesters, List<Group> categories, List<EventRow> events, List<GateRow> gates,
            String granularity, List<Point> trend) {
    }

    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final EntryRepository entries;
    private final GateRepository gates;
    private final DepartmentRepository departments;
    private final EventViews views;

    public AnalyticsService(EventRepository events, RegistrationRepository registrations, EntryRepository entries,
            GateRepository gates, DepartmentRepository departments, EventViews views) {
        this.events = events;
        this.registrations = registrations;
        this.entries = entries;
        this.gates = gates;
        this.departments = departments;
        this.views = views;
    }

    /** The events the current user may analyse, inside the range, drafts excluded. */
    @Transactional(readOnly = true)
    public List<Event> scope(Long from, Long to) {
        boolean admin = CurrentUser.hasRole("ADMIN");
        List<Event> mine = admin ? events.findAll() : events.findByOrganizer(CurrentUser.id());
        return mine.stream()
                .filter(e -> e.getStatus() != Event.Status.DRAFT)
                .filter(e -> from == null || !e.getStartsAt().isBefore(Instant.ofEpochMilli(from)))
                .filter(e -> to == null || e.getStartsAt().isBefore(Instant.ofEpochMilli(to)))
                .sorted(Comparator.comparing(Event::getStartsAt).reversed())
                .toList();
    }

    @Transactional(readOnly = true)
    public Overview overview(Long from, Long to) {
        Instant now = Instant.now();
        List<Event> list = scope(from, to);
        List<Long> ids = list.stream().map(Event::getId).toList();
        Map<Long, Stats> stats = views.stats(list);
        java.util.Set<Long> openedIds = list.stream().map(e -> Map.entry(e.getId(), AttendanceService.phase(e, now)))
                .filter(x -> x.getValue() == Phase.OPEN || x.getValue() == Phase.ENDED).map(Map.Entry::getKey)
                .collect(Collectors.toSet());

        // Registrations and entries per event, department and semester: registrations, confirmed, attended, confirmed at opened events.
        Map<Long, Map<Registration.Status, Long>> regByEvent = new HashMap<>();
        Map<String, long[]> deptAgg = new TreeMap<>();
        Map<Integer, long[]> semAgg = new TreeMap<>();
        Map<String, Long> statusAgg = new LinkedHashMap<>();
        for (Registration.Status s : Registration.Status.values()) {
            statusAgg.put(s.name(), 0L);
        }
        if (!ids.isEmpty()) {
            for (Object[] row : registrations.countByEventStatusDepartmentSemester(ids)) {
                Long eventId = (Long) row[0];
                Registration.Status status = (Registration.Status) row[1];
                long n = (Long) row[4];
                regByEvent.computeIfAbsent(eventId, k -> new EnumMap<>(Registration.Status.class)).merge(status, n, Long::sum);
                statusAgg.merge(status.name(), n, Long::sum);
                long[] d = deptAgg.computeIfAbsent(row[2] == null ? "~OTHER" : (String) row[2], k -> new long[4]);
                d[0] += n;
                d[1] += status == Registration.Status.CONFIRMED ? n : 0;
                d[3] += status == Registration.Status.CONFIRMED && openedIds.contains(eventId) ? n : 0;
                if (row[3] != null) {
                    long[] s = semAgg.computeIfAbsent((Integer) row[3], k -> new long[4]);
                    s[0] += n;
                    s[1] += status == Registration.Status.CONFIRMED ? n : 0;
                    s[3] += status == Registration.Status.CONFIRMED && openedIds.contains(eventId) ? n : 0;
                }
            }
            for (Object[] row : entries.countByEventDepartmentSemester(ids)) {
                long n = (Long) row[3];
                deptAgg.computeIfAbsent(row[1] == null ? "~OTHER" : (String) row[1], k -> new long[4])[2] += n;
                if (row[2] != null) {
                    semAgg.computeIfAbsent((Integer) row[2], k -> new long[4])[2] += n;
                }
            }
        }
        Map<String, String> deptNames = departments.findAll().stream().collect(Collectors.toMap(Department::getCode, Department::getName));
        List<Group> deptRows = deptAgg.entrySet().stream().map(x -> Group.of(x.getKey().equals("~OTHER") ? "OTHER" : x.getKey(),
                x.getKey().equals("~OTHER") ? "Staff / other" : deptNames.getOrDefault(x.getKey(), x.getKey()), 0, x.getValue())).toList();
        List<Group> semRows = semAgg.entrySet().stream().map(x -> Group.of(String.valueOf(x.getKey()), "Semester " + x.getKey(), 0, x.getValue())).toList();

        // Per event, then KPIs and categories from the per-event rows.
        List<EventRow> rows = new ArrayList<>();
        long upcoming = 0, running = 0, ended = 0, cancelled = 0;
        long confirmedOpened = 0, attendedOpened = 0, noShows = 0, confirmedLive = 0, capacityLive = 0;
        Map<Event.Category, long[]> catAgg = new EnumMap<>(Event.Category.class); // registrations, confirmed, attended, confirmed at opened events, events
        for (Event e : list) {
            Stats s = stats.get(e.getId());
            Map<Registration.Status, Long> byStatus = regByEvent.getOrDefault(e.getId(), Map.of());
            long regs = byStatus.values().stream().mapToLong(Long::longValue).sum();
            Phase phase = AttendanceService.phase(e, now);
            switch (phase) {
                case UPCOMING -> upcoming++;
                case OPEN -> running++;
                case ENDED -> ended++;
                case CANCELLED -> cancelled++;
                default -> { }
            }
            boolean opened = phase == Phase.OPEN || phase == Phase.ENDED;
            long attended = Math.min(s.entered(), s.confirmed());
            long eventNoShows = phase == Phase.ENDED ? Math.max(s.confirmed() - s.entered(), 0) : 0;
            if (opened) {
                confirmedOpened += s.confirmed();
                attendedOpened += attended;
            }
            noShows += eventNoShows;
            if (phase != Phase.CANCELLED) {
                confirmedLive += s.confirmed();
                capacityLive += e.getCapacity();
            }
            long[] c = catAgg.computeIfAbsent(e.getCategory(), k -> new long[5]);
            c[0] += regs;
            c[1] += s.confirmed();
            c[2] += attended;
            c[3] += opened ? s.confirmed() : 0;
            c[4]++;
            rows.add(new EventRow(e.getId(), e.getTitle(), e.getCategory().name(), e.getStatus().name(), phase.name(),
                    e.getStartsAt().toEpochMilli(), e.getVenue().getName(), e.getCapacity(), regs, s.confirmed(), s.waitlisted(),
                    s.entered(), eventNoShows, AttendanceService.rate(s.confirmed(), e.getCapacity()),
                    opened ? AttendanceService.rate(attended, s.confirmed()) : null));
        }
        // Popularity: demand first (confirmed + waitlisted against capacity), then registrations.
        rows.sort(Comparator.comparingDouble((EventRow r) -> -(r.confirmed() + r.waitlisted()) / (double) Math.max(r.capacity(), 1))
                .thenComparing(Comparator.comparingLong(EventRow::registrations).reversed()));
        List<Group> catRows = catAgg.entrySet().stream()
                .map(x -> Group.of(x.getKey().name(), label(x.getKey().name()), x.getValue()[4], x.getValue())).toList();

        long totalRegs = statusAgg.values().stream().mapToLong(Long::longValue).sum();
        long totalAttended = stats.values().stream().mapToLong(Stats::entered).sum();
        Kpis kpis = new Kpis(list.size(), upcoming, running, ended, cancelled, totalRegs, statusAgg.get("CONFIRMED"),
                statusAgg.get("WAITLISTED"), statusAgg.get("PENDING"), totalAttended, noShows,
                AttendanceService.rate(attendedOpened, confirmedOpened), AttendanceService.rate(confirmedLive, capacityLive));

        // Busiest gates.
        List<GateRow> gateRows = new ArrayList<>();
        if (!ids.isEmpty()) {
            Map<Long, Long> perGate = entries.countByGates(ids).stream().collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
            Map<Long, Gate> gateById = gates.findAllById(perGate.keySet()).stream().collect(Collectors.toMap(Gate::getId, Function.identity()));
            perGate.forEach((id, n) -> {
                Gate g = gateById.get(id);
                gateRows.add(new GateRow(id, g == null ? "Gate " + id : g.getName(), g == null ? "" : g.getVenue().getName(), n));
            });
            gateRows.sort(Comparator.comparingLong(GateRow::entries).reversed());
        }

        // Registrations and check-ins over time.
        List<Instant> regTimes = ids.isEmpty() ? List.of() : registrations.findRegistrationTimes(ids);
        List<Instant> entryTimes = ids.isEmpty() ? List.of() : entries.findEntryTimes(ids);
        Trend trend = trend(regTimes, entryTimes, from, to, now);

        return new Overview(from, to, CurrentUser.hasRole("ADMIN"), kpis, statusAgg, deptRows, semRows, catRows, rows, gateRows,
                trend.granularity, trend.points);
    }

    public static String label(String enumName) {
        String s = enumName.replace('_', ' ').toLowerCase(Locale.ENGLISH);
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private record Trend(String granularity, List<Point> points) {
    }

    /** Daily points for up to two months, monthly beyond that. */
    static Trend trend(List<Instant> regTimes, List<Instant> entryTimes, Long from, Long to, Instant now) {
        Instant first = from != null ? Instant.ofEpochMilli(from)
                : java.util.stream.Stream.concat(regTimes.stream(), entryTimes.stream()).min(Comparator.naturalOrder()).orElse(null);
        Instant last = to != null && Instant.ofEpochMilli(to).isBefore(now) ? Instant.ofEpochMilli(to) : now;
        if (first == null || !first.isBefore(last)) {
            return new Trend("DAY", List.of());
        }
        LocalDate start = first.atZone(IST).toLocalDate();
        LocalDate end = last.atZone(IST).toLocalDate();
        boolean daily = Duration.between(first, last).toDays() <= 62;
        Map<Object, long[]> buckets = new LinkedHashMap<>();
        if (daily) {
            for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
                buckets.put(d, new long[2]);
            }
        } else {
            for (YearMonth m = YearMonth.from(start); !m.isAfter(YearMonth.from(end)); m = m.plusMonths(1)) {
                buckets.put(m, new long[2]);
            }
        }
        Function<Instant, Object> key = i -> daily ? i.atZone(IST).toLocalDate() : YearMonth.from(i.atZone(IST));
        regTimes.forEach(i -> { long[] b = buckets.get(key.apply(i)); if (b != null) { b[0]++; } });
        entryTimes.forEach(i -> { long[] b = buckets.get(key.apply(i)); if (b != null) { b[1]++; } });
        List<Point> points = buckets.entrySet().stream().map(x -> new Point(
                daily ? DAY.format((LocalDate) x.getKey()) : MONTH.format((YearMonth) x.getKey()), x.getValue()[0], x.getValue()[1])).toList();
        return new Trend(daily ? "DAY" : "MONTH", points);
    }
}
