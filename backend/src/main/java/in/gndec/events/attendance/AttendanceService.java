package in.gndec.events.attendance;

import in.gndec.events.attendance.AttendanceDtos.Attendee;
import in.gndec.events.attendance.AttendanceDtos.Bucket;
import in.gndec.events.attendance.AttendanceDtos.GateCount;
import in.gndec.events.attendance.AttendanceDtos.GroupCount;
import in.gndec.events.attendance.AttendanceDtos.Phase;
import in.gndec.events.attendance.AttendanceDtos.Summary;
import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.PageResponse;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventAccess;
import in.gndec.events.event.EventRepository;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.scan.LiveFeed;
import in.gndec.events.scan.ScanLog;
import in.gndec.events.scan.ScanLogRepository;
import in.gndec.events.scan.ScanResult;
import in.gndec.events.scan.ScanService.ScanLogView;
import in.gndec.events.scan.SecurityAssignment;
import in.gndec.events.scan.SecurityAssignmentRepository;
import in.gndec.events.user.Department;
import in.gndec.events.user.DepartmentRepository;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import in.gndec.events.user.UserMapper;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.Gate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Automated attendance management (objective 4). Every gate scan already creates an entry (objective 3);
 * this service turns those entries into attendance: who came, who didn't, through which gate and when.
 * Organizers can also correct the record by hand, always with a reason that goes to the audit log.
 */
@Service
public class AttendanceService {

    /** Timelines are split into at most this many slots (15 minutes for a normal event, wider for long ones). */
    private static final int MAX_BUCKETS = 96;
    private static final int[] BUCKET_MINUTES = {15, 30, 60, 120, 240, 480, 1440};

    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final EntryRepository entries;
    private final PassRepository passes;
    private final ScanLogRepository logs;
    private final SecurityAssignmentRepository assignments;
    private final UserRepository users;
    private final DepartmentRepository departments;
    private final EventAccess access;
    private final AuditService audit;
    private final LiveFeed liveFeed;
    private final ApplicationEventPublisher publisher;

    public AttendanceService(EventRepository events, RegistrationRepository registrations, EntryRepository entries,
            PassRepository passes, ScanLogRepository logs, SecurityAssignmentRepository assignments, UserRepository users,
            DepartmentRepository departments, EventAccess access, AuditService audit, LiveFeed liveFeed,
            ApplicationEventPublisher publisher) {
        this.events = events;
        this.registrations = registrations;
        this.entries = entries;
        this.passes = passes;
        this.logs = logs;
        this.assignments = assignments;
        this.users = users;
        this.departments = departments;
        this.access = access;
        this.audit = audit;
        this.liveFeed = liveFeed;
        this.publisher = publisher;
    }

    /** Loads the event and checks that the current user organises it (or is an admin). */
    @Transactional(readOnly = true)
    public Event managed(Long eventId) {
        Event e = events.findById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
        access.requireManage(e);
        return e;
    }

    public static Phase phase(Event e, Instant now) {
        return switch (e.getStatus()) {
            case DRAFT -> Phase.DRAFT;
            case CANCELLED -> Phase.CANCELLED;
            case COMPLETED -> Phase.ENDED;
            default -> now.isBefore(e.entryOpensAt()) ? Phase.UPCOMING : now.isAfter(e.getEndsAt()) ? Phase.ENDED : Phase.OPEN;
        };
    }

    // ------------------------------------------------------------------ summary

    @Transactional(readOnly = true)
    public Summary summary(Long eventId) {
        Event e = managed(eventId);
        Instant now = Instant.now();
        List<Registration> confirmed = registrations.findConfirmedWithProfiles(e.getId());
        List<Entry> all = entries.findByEventId(e.getId());
        Map<Long, Entry> byReg = all.stream().collect(Collectors.toMap(Entry::getRegistrationId, Function.identity(), (a, b) -> a));
        long attended = confirmed.stream().filter(r -> byReg.containsKey(r.getId())).count();

        Map<String, Long> byMethod = new LinkedHashMap<>();
        for (Entry.Method m : Entry.Method.values()) {
            byMethod.put(m.name(), all.stream().filter(en -> en.getMethod() == m).count());
        }
        long lastHour = all.stream().filter(en -> en.getEnteredAt().isAfter(now.minus(Duration.ofHours(1)))).count();
        long rejected = logs.countByEventId(e.getId()) - logs.countByEventIdAndResult(e.getId(), ScanResult.SUCCESS);

        // Gates: entries, staff on duty and the latest entry at each.
        List<SecurityAssignment> staff = assignments.findForEvents(List.of(e.getId()));
        List<GateCount> gates = e.getGates().stream().sorted(Comparator.comparing(Gate::getId)).map(g -> new GateCount(g.getId(), g.getName(),
                all.stream().filter(en -> en.getGateId().equals(g.getId())).count(),
                staff.stream().filter(a -> a.getGate().getId().equals(g.getId())).map(a -> a.getUser().getFullName()).toList(),
                all.stream().filter(en -> en.getGateId().equals(g.getId())).map(Entry::getEnteredAt).max(Comparator.naturalOrder())
                        .map(Instant::toEpochMilli).orElse(null))).toList();

        // Department- and semester-wise: confirmed vs attended.
        Map<String, String> deptNames = departments.findAll().stream().collect(Collectors.toMap(Department::getCode, Department::getName));
        Map<String, long[]> depts = new TreeMap<>();
        Map<Integer, long[]> sems = new TreeMap<>();
        for (Registration r : confirmed) {
            StudentProfile p = r.getUser().getProfile();
            boolean present = byReg.containsKey(r.getId());
            long[] d = depts.computeIfAbsent(p == null ? "~STAFF" : p.getDepartmentCode(), k -> new long[2]);
            d[0]++;
            d[1] += present ? 1 : 0;
            if (p != null) {
                long[] s = sems.computeIfAbsent(p.getSemester(), k -> new long[2]);
                s[0]++;
                s[1] += present ? 1 : 0;
            }
        }
        List<GroupCount> deptRows = depts.entrySet().stream().map(x -> new GroupCount(x.getKey().equals("~STAFF") ? "OTHER" : x.getKey(),
                x.getKey().equals("~STAFF") ? "Staff / other" : deptNames.getOrDefault(x.getKey(), x.getKey()), x.getValue()[0], x.getValue()[1])).toList();
        List<GroupCount> semRows = sems.entrySet().stream()
                .map(x -> new GroupCount(String.valueOf(x.getKey()), "Semester " + x.getKey(), x.getValue()[0], x.getValue()[1])).toList();

        int bucket = bucketMinutes(e);
        List<Bucket> timeline = timeline(e, all, now, bucket);
        return new Summary(e.getId(), e.getTitle(), e.getStatus().name(), phase(e, now), e.getStartsAt().toEpochMilli(),
                e.getEndsAt().toEpochMilli(), e.entryOpensAt().toEpochMilli(), e.getCapacity(), confirmed.size(), attended,
                confirmed.size() - attended, rate(attended, confirmed.size()), lastHour, rejected, byMethod, gates, bucket, timeline,
                deptRows, semRows, recent(e));
    }

    public static int rate(long part, long whole) {
        return whole == 0 ? 0 : (int) Math.round(part * 100.0 / whole);
    }

    private static int bucketMinutes(Event e) {
        long minutes = Duration.between(e.entryOpensAt(), e.getEndsAt()).toMinutes();
        for (int m : BUCKET_MINUTES) {
            if (minutes / m <= MAX_BUCKETS) {
                return m;
            }
        }
        return BUCKET_MINUTES[BUCKET_MINUTES.length - 1];
    }

    /** Entries per slot from the moment gates open until the end (or now, while the event is running). */
    private static List<Bucket> timeline(Event e, List<Entry> all, Instant now, int minutes) {
        Instant from = e.entryOpensAt();
        Instant to = now.isBefore(e.getEndsAt()) ? now : e.getEndsAt();
        for (Entry en : all) { // manual corrections after the end still belong on the chart
            if (en.getEnteredAt().isAfter(to)) {
                to = en.getEnteredAt();
            }
        }
        if (!to.isAfter(from)) {
            return List.of();
        }
        long size = minutes * 60_000L;
        int n = (int) ((to.toEpochMilli() - from.toEpochMilli() + size - 1) / size);
        long[] counts = new long[n];
        for (Entry en : all) {
            int i = (int) ((en.getEnteredAt().toEpochMilli() - from.toEpochMilli()) / size);
            counts[Math.max(0, Math.min(n - 1, i))]++;
        }
        List<Bucket> out = new ArrayList<>(n);
        long running = 0;
        for (int i = 0; i < n; i++) {
            running += counts[i];
            out.add(new Bucket(from.toEpochMilli() + i * size, counts[i], running));
        }
        return out;
    }

    private List<ScanLogView> recent(Event e) {
        List<ScanLog> list = logs.findTop25ByEventIdOrderByScannedAtDescIdDesc(e.getId());
        Map<Long, User> people = users.findAllById(list.stream().flatMap(l -> java.util.stream.Stream.of(l.getParticipantId(), l.getScannedBy()))
                .filter(Objects::nonNull).distinct().toList()).stream().collect(Collectors.toMap(User::getId, Function.identity()));
        Map<Long, String> gateNames = e.getGates().stream().collect(Collectors.toMap(Gate::getId, Gate::getName));
        return list.stream().map(l -> new ScanLogView(l.getId(), l.getScannedAt().toEpochMilli(), l.getResult().name(), l.getMethod().name(),
                l.getParticipantId() == null || !people.containsKey(l.getParticipantId()) ? null : UserMapper.person(people.get(l.getParticipantId())),
                e.getId(), e.getTitle(), gateNames.get(l.getGateId()),
                people.containsKey(l.getScannedBy()) ? people.get(l.getScannedBy()).getFullName() : null)).toList();
    }

    // ------------------------------------------------------------------ list

    /** filter = ALL | PRESENT | ABSENT; q matches name, URN or email; dept is a department code. */
    @Transactional(readOnly = true)
    public PageResponse<Attendee> list(Long eventId, String filter, String q, String dept, int page, int size) {
        Event e = managed(eventId);
        return PageResponse.ofList(attendees(e, filter, q, dept), page, size);
    }

    /** All matching attendees, sorted by name (also used by the reports). */
    @Transactional(readOnly = true)
    public List<Attendee> attendees(Event e, String filter, String q, String dept) {
        List<Registration> confirmed = registrations.findConfirmedWithProfiles(e.getId());
        Map<Long, Entry> byReg = entries.findByEventId(e.getId()).stream()
                .collect(Collectors.toMap(Entry::getRegistrationId, Function.identity(), (a, b) -> a));
        Map<Long, String> gateNames = e.getGates().stream().collect(Collectors.toMap(Gate::getId, Gate::getName));
        Map<Long, String> recorders = users.findAllById(byReg.values().stream().map(Entry::getScannedBy).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        return confirmed.stream()
                .filter(r -> {
                    boolean present = byReg.containsKey(r.getId());
                    return "PRESENT".equals(filter) ? present : "ABSENT".equals(filter) ? !present : true;
                })
                .filter(r -> dept == null || dept.isBlank() || (r.getUser().getProfile() != null && dept.equals(r.getUser().getProfile().getDepartmentCode())))
                .filter(r -> needle.isEmpty() || (r.getUser().getFullName() + " " + r.getUser().getEmail() + " "
                        + (r.getUser().getProfile() == null ? "" : r.getUser().getProfile().getUrn())).toLowerCase(Locale.ROOT).contains(needle))
                .sorted(Comparator.comparing((Registration r) -> r.getUser().getFullName(), String.CASE_INSENSITIVE_ORDER))
                .map(r -> {
                    Entry en = byReg.get(r.getId());
                    return en == null
                            ? new Attendee(r.getId(), UserMapper.person(r.getUser()), false, null, null, null, null, null, null)
                            : new Attendee(r.getId(), UserMapper.person(r.getUser()), true, en.getEnteredAt().toEpochMilli(), en.getGateId(),
                                    gateNames.get(en.getGateId()), en.getMethod().name(), en.getOverrideReason(), recorders.get(en.getScannedBy()));
                }).toList();
    }

    // ------------------------------------------------------------------ manual corrections

    private void requireCorrectable(Event e, Instant now) {
        if (e.getStatus() == Event.Status.DRAFT || e.getStatus() == Event.Status.CANCELLED) {
            throw ApiException.conflict("INVALID_STATE", "Attendance can't be changed for a " + e.getStatus().name().toLowerCase(Locale.ROOT) + " event.");
        }
        if (now.isBefore(e.entryOpensAt())) {
            throw ApiException.conflict("NOT_STARTED", "Attendance can be marked once the gates open, 60 minutes before the start.");
        }
    }

    /** Marks a confirmed participant present without a scan (forgotten phone, camera failure). */
    @Transactional
    public Attendee markPresent(Long eventId, AttendanceDtos.MarkPresentRequest req) {
        Event e = managed(eventId);
        Instant now = Instant.now();
        requireCorrectable(e, now);
        Registration r = registrations.findById(req.registrationId())
                .filter(x -> x.getEvent().getId().equals(e.getId()))
                .orElseThrow(() -> ApiException.notFound("Registration"));
        if (r.getStatus() != Registration.Status.CONFIRMED) {
            throw ApiException.conflict("NOT_CONFIRMED", "Only confirmed participants can be marked present.");
        }
        if (entries.findByRegistrationId(r.getId()).isPresent()) {
            throw ApiException.conflict("ALREADY_PRESENT", r.getUser().getFullName() + " is already marked present.");
        }
        Gate gate = req.gateId() == null
                ? e.getGates().stream().min(Comparator.comparing(Gate::getId))
                        .orElseThrow(() -> ApiException.badRequest("NO_GATE", "This event has no entry gate."))
                : e.getGates().stream().filter(g -> g.getId().equals(req.gateId())).findFirst()
                        .orElseThrow(() -> ApiException.field("gateId", "Pick one of this event's gates."));
        // Use up the pass so it can't also be scanned at a gate.
        Pass pass = passes.findByRegistrationIdAndStatus(r.getId(), Pass.Status.ACTIVE).stream().findFirst().orElse(null);
        if (pass != null) {
            passes.claim(pass.getId(), now);
        }
        Entry en = new Entry();
        en.setRegistrationId(r.getId());
        en.setPassId(pass == null ? null : pass.getId());
        en.setEventId(e.getId());
        en.setGateId(gate.getId());
        en.setScannedBy(CurrentUser.id());
        en.setMethod(Entry.Method.OVERRIDE);
        en.setEnteredAt(now);
        en.setOverrideReason(req.reason().trim());
        entries.saveAndFlush(en);
        audit.log("ATTENDANCE_MARKED_PRESENT", "Registration", r.getId(), r.getUser().getFullName() + " · " + e.getTitle() + " · " + req.reason().trim());
        publish(e, en.getId(), "SUCCESS", r.getUser(), gate.getName(), now);
        String me = users.findById(CurrentUser.id()).map(User::getFullName).orElse(null);
        return new Attendee(r.getId(), UserMapper.person(r.getUser()), true, now.toEpochMilli(), gate.getId(), gate.getName(),
                Entry.Method.OVERRIDE.name(), en.getOverrideReason(), me);
    }

    /** Removes an entry recorded by mistake. The pass becomes usable again while the event is still running. */
    @Transactional
    public Attendee markAbsent(Long eventId, Long registrationId, String reason) {
        Event e = managed(eventId);
        Instant now = Instant.now();
        requireCorrectable(e, now);
        Registration r = registrations.findById(registrationId)
                .filter(x -> x.getEvent().getId().equals(e.getId()))
                .orElseThrow(() -> ApiException.notFound("Registration"));
        Entry en = entries.findByRegistrationId(r.getId())
                .orElseThrow(() -> ApiException.conflict("NOT_PRESENT", r.getUser().getFullName() + " is not marked present."));
        if (en.getPassId() != null) {
            passes.findById(en.getPassId()).filter(p -> p.getStatus() == Pass.Status.USED).ifPresent(p -> {
                boolean over = now.isAfter(e.getEndsAt()) || e.getStatus() == Event.Status.COMPLETED;
                p.setStatus(over ? Pass.Status.EXPIRED : Pass.Status.ACTIVE);
                p.setUsedAt(null);
            });
        }
        String gateName = e.getGates().stream().filter(g -> g.getId().equals(en.getGateId())).map(Gate::getName).findFirst().orElse(null);
        entries.delete(en);
        entries.flush();
        audit.log("ATTENDANCE_MARKED_ABSENT", "Registration", r.getId(), r.getUser().getFullName() + " · " + e.getTitle() + " · " + reason.trim());
        publish(e, en.getId(), "REMOVED", r.getUser(), gateName, now);
        return new Attendee(r.getId(), UserMapper.person(r.getUser()), false, null, null, null, null, null, null);
    }

    /** Manual changes appear in the live feed too. Negative ids keep them apart from scan-log ids. */
    private void publish(Event e, Long entryId, String result, User who, String gateName, Instant at) {
        if (liveFeed.hasSubscribers(e.getId())) {
            String me = users.findById(CurrentUser.id()).map(User::getFullName).orElse(null);
            publisher.publishEvent(new LiveFeed.Published(e.getId(), new ScanLogView(-entryId - (result.equals("REMOVED") ? 1_000_000_000L : 0),
                    at.toEpochMilli(), result, Entry.Method.OVERRIDE.name(), UserMapper.person(who), e.getId(), e.getTitle(), gateName, me)));
        }
    }
}
