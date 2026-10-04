package in.gndec.events.scan;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.PageResponse;
import in.gndec.events.common.RateLimiter;
import in.gndec.events.common.Secrets;
import in.gndec.events.event.EligibilityService;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventDtos.Stats;
import in.gndec.events.event.EventRepository;
import in.gndec.events.event.EventViews;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.pass.PassService;
import in.gndec.events.registration.Registration;
import in.gndec.events.user.User;
import in.gndec.events.user.UserDtos.Person;
import in.gndec.events.user.UserMapper;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.GateRepository;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Entry verification at the gate (requirements O3-06 … O3-11).
 *
 * The QR carries only "EQR1:<token>". Everything else is checked here, against the database, in a fixed
 * order. The first valid scan claims the pass with a conditional UPDATE, so if two gates scan the same pass
 * at the same moment exactly one of them succeeds. Every attempt is written to scan_logs.
 */
@Service
public class ScanService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public record VerifyRequest(@NotNull Long eventId, @NotNull Long gateId, @Size(max = 200) String qr,
            @Size(max = 40) String code, @Size(max = 60) String deviceId) {
    }

    public record VerifyResult(String result, String message, Person holder, String passEvent, Long firstEntryAt,
            String firstEntryGate, long at, String gateName) {
    }

    public record EventBrief(Long id, String title, long startsAt, long endsAt, String status, String venueName) {
    }

    public record ScanOption(EventBrief event, Long gateId, String gateName, long enteredAtGate, long enteredTotal, long confirmed) {
    }

    public record ScanLogView(Long id, long at, String result, String method, Person participant, Long eventId,
            String eventTitle, String gateName, String scannedBy) {
    }

    public record Summary(long allowedToday, long rejectedToday) {
    }

    private final EventRepository events;
    private final GateRepository gates;
    private final PassRepository passes;
    private final EntryRepository entries;
    private final ScanLogRepository logs;
    private final SecurityAssignmentRepository assignments;
    private final UserRepository users;
    private final EventViews views;
    private final RateLimiter rateLimiter;
    private final AuditService audit;

    public ScanService(EventRepository events, GateRepository gates, PassRepository passes, EntryRepository entries,
            ScanLogRepository logs, SecurityAssignmentRepository assignments, UserRepository users, EventViews views,
            RateLimiter rateLimiter, AuditService audit) {
        this.events = events;
        this.gates = gates;
        this.passes = passes;
        this.entries = entries;
        this.logs = logs;
        this.assignments = assignments;
        this.users = users;
        this.views = views;
        this.rateLimiter = rateLimiter;
        this.audit = audit;
    }

    @Transactional
    public VerifyResult verify(VerifyRequest req) {
        Long me = CurrentUser.id();
        rateLimiter.check("scan:" + me, 120, Duration.ofMinutes(1));
        Event event = events.findById(req.eventId()).orElseThrow(() -> ApiException.notFound("Event"));
        Gate gate = gates.findById(req.gateId()).orElseThrow(() -> ApiException.notFound("Gate"));
        boolean manual = req.qr() == null || req.qr().isBlank();
        Ctx ctx = new Ctx(event, gate, me, manual ? Entry.Method.MANUAL : Entry.Method.QR, req.deviceId(), Instant.now());

        // 1. Is this person allowed to scan at this gate for this event?
        if (!event.hasGate(gate.getId()) || !mayScan(event, gate, me)) {
            return finish(ctx, ScanResult.NOT_ASSIGNED, null, null);
        }

        // 2. Find the pass: by token hash for QR scans, by pass code or URN for manual entry.
        Pass pass;
        if (!manual) {
            String raw = req.qr().trim();
            if (!raw.startsWith(PassService.QR_PREFIX)) {
                return finish(ctx, ScanResult.INVALID_FORMAT, null, null);
            }
            pass = passes.findByTokenHash(Secrets.sha256Hex(raw.substring(PassService.QR_PREFIX.length()))).orElse(null);
        } else {
            String code = req.code() == null ? "" : req.code().trim().toUpperCase(Locale.ROOT);
            if (code.isEmpty()) {
                throw ApiException.badRequest("CODE_REQUIRED", "Enter a pass code or a URN.");
            }
            pass = passes.findByCode(code).orElse(null);
            if (pass == null && code.matches("\\d{7}")) {
                pass = passForUrn(code, event.getId()).orElse(null);
            }
        }
        if (pass == null) {
            return finish(ctx, ScanResult.INVALID_TOKEN, null, manual ? "No pass found for that code or URN." : null);
        }

        Registration reg = pass.getRegistration();
        User holder = pass.getUser();
        // 3. Pass state
        if (pass.getStatus() == Pass.Status.REVOKED) {
            return finish(ctx, ScanResult.REVOKED, pass, pass.getRevokedReason() == null ? null : "Revoked: " + pass.getRevokedReason() + ".");
        }
        if (pass.getStatus() == Pass.Status.EXPIRED) {
            return finish(ctx, ScanResult.EXPIRED, pass, null);
        }
        // 4. Registration must be confirmed
        if (reg.getStatus() != Registration.Status.CONFIRMED) {
            return finish(ctx, ScanResult.NOT_APPROVED, pass, null);
        }
        // 5. Right event?
        if (!pass.getEvent().getId().equals(event.getId())) {
            return finish(ctx, ScanResult.WRONG_EVENT, pass, "This pass is for “" + pass.getEvent().getTitle() + "”.");
        }
        // 6. Within the entry window?
        if (ctx.now.isBefore(event.entryOpensAt())) {
            return finish(ctx, ScanResult.OUTSIDE_WINDOW, pass, "Entry opens at " + EligibilityService.format(event.entryOpensAt()) + ".");
        }
        if (ctx.now.isAfter(event.getEndsAt())) {
            return finish(ctx, ScanResult.OUTSIDE_WINDOW, pass, "This event has already ended.");
        }
        // 7. Holder still active and enrolled?
        if (holder.getStatus() != User.Status.ACTIVE || (holder.getProfile() != null && !holder.getProfile().isEnrolled())) {
            return finish(ctx, ScanResult.ACCOUNT_INACTIVE, pass, null);
        }
        // 8. Not used before — claimed atomically.
        if (pass.getStatus() == Pass.Status.USED || passes.claim(pass.getId(), ctx.now) == 0) {
            return alreadyUsed(ctx, pass);
        }
        // 9. Record the entry (UNIQUE registration_id is the second safety net).
        Entry entry = new Entry();
        entry.setRegistrationId(reg.getId());
        entry.setPassId(pass.getId());
        entry.setEventId(event.getId());
        entry.setGateId(gate.getId());
        entry.setScannedBy(me);
        entry.setMethod(ctx.method);
        entry.setEnteredAt(ctx.now);
        entries.saveAndFlush(entry);
        return finish(ctx, ScanResult.SUCCESS, pass, null);
    }

    private record Ctx(Event event, Gate gate, Long scannedBy, Entry.Method method, String deviceId, Instant now) {
    }

    private VerifyResult alreadyUsed(Ctx ctx, Pass pass) {
        Optional<Entry> first = entries.findByRegistrationId(pass.getRegistration().getId());
        String gateName = first.flatMap(e -> gates.findById(e.getGateId())).map(Gate::getName).orElse(null);
        String message = first.map(e -> "First entry at " + EligibilityService.format(e.getEnteredAt()).replaceFirst("^.*?, ", "")
                + (gateName == null ? "" : " via " + gateName) + ".").orElse(null);
        VerifyResult r = finish(ctx, ScanResult.ALREADY_USED, pass, message);
        return new VerifyResult(r.result(), r.message(), r.holder(), r.passEvent(),
                first.map(e -> e.getEnteredAt().toEpochMilli()).orElse(null), gateName, r.at(), r.gateName());
    }

    private VerifyResult finish(Ctx ctx, ScanResult result, Pass pass, String message) {
        ScanLog log = new ScanLog();
        log.setEventId(ctx.event.getId());
        log.setGateId(ctx.gate.getId());
        log.setPassId(pass == null ? null : pass.getId());
        log.setParticipantId(pass == null ? null : pass.getUser().getId());
        log.setScannedBy(ctx.scannedBy);
        log.setResult(result);
        log.setMethod(ctx.method);
        log.setDeviceId(ctx.deviceId);
        log.setScannedAt(ctx.now);
        logs.save(log);
        if (ctx.method == Entry.Method.MANUAL) {
            audit.log("MANUAL_ENTRY_" + result.name(), "Pass", pass == null ? null : pass.getId(),
                    (pass == null ? "unknown pass" : pass.getUser().getFullName()) + " at " + ctx.gate.getName());
        }
        return new VerifyResult(result.name(), message != null ? message : result.message(),
                pass == null ? null : UserMapper.person(pass.getUser()),
                pass == null ? null : pass.getEvent().getTitle(), null, null, ctx.now.toEpochMilli(), ctx.gate.getName());
    }

    private boolean mayScan(Event event, Gate gate, Long me) {
        if (CurrentUser.hasRole("ADMIN")) {
            return true;
        }
        if (CurrentUser.hasRole("ORGANIZER")) {
            return event.isOrganizer(me);
        }
        return CurrentUser.hasRole("SECURITY") && assignments.existsByEventIdAndGateIdAndUserId(event.getId(), gate.getId(), me);
    }

    /** Manual entry by URN: this event's pass if there is one, otherwise any valid pass (so the guard sees "wrong event"). */
    private Optional<Pass> passForUrn(String urn, Long eventId) {
        Optional<User> u = users.findByUrn(urn);
        if (u.isEmpty()) {
            return Optional.empty();
        }
        List<Pass> here = passes.findByUserIdAndEventIdOrderByIssuedAtDesc(u.get().getId(), eventId);
        Optional<Pass> best = here.stream().filter(p -> p.getStatus() == Pass.Status.ACTIVE).findFirst()
                .or(() -> here.stream().filter(p -> p.getStatus() == Pass.Status.USED).findFirst())
                .or(() -> here.stream().findFirst());
        return best.or(() -> passes.findByUserIdAndStatus(u.get().getId(), Pass.Status.ACTIVE).stream().findFirst());
    }

    // ------------------------------------------------------------------ scanner screens

    @Transactional(readOnly = true)
    public List<ScanOption> options(boolean includePast) {
        Long me = CurrentUser.id();
        Instant now = Instant.now();
        EnumSet<Event.Status> statuses = includePast
                ? EnumSet.of(Event.Status.PUBLISHED, Event.Status.CLOSED, Event.Status.COMPLETED)
                : EnumSet.of(Event.Status.PUBLISHED, Event.Status.CLOSED);
        List<Object[]> pairs = new ArrayList<>(); // {Event, Gate}
        if (CurrentUser.hasRole("SECURITY")) {
            for (SecurityAssignment a : assignments.findForUser(me)) {
                pairs.add(new Object[] {a.getEvent(), a.getGate()});
            }
        } else {
            List<Event> mine = CurrentUser.hasRole("ADMIN") ? events.findByStatusIn(statuses) : events.findByOrganizer(me);
            for (Event e : mine) {
                e.getGates().stream().sorted(Comparator.comparing(Gate::getId)).forEach(g -> pairs.add(new Object[] {e, g}));
            }
        }
        List<Object[]> usable = pairs.stream()
                .filter(p -> statuses.contains(((Event) p[0]).getStatus()) && (includePast || ((Event) p[0]).getEndsAt().isAfter(now)))
                .sorted(Comparator.comparing(p -> ((Event) p[0]).getStartsAt()))
                .toList();
        List<Event> evs = usable.stream().map(p -> (Event) p[0]).distinct().toList();
        Map<Long, Stats> stats = views.stats(evs);
        Map<String, Long> perGate = new HashMap<>();
        if (!evs.isEmpty()) {
            for (Object[] row : entries.countByEventsAndGates(evs.stream().map(Event::getId).toList())) {
                perGate.put(row[0] + ":" + row[1], (Long) row[2]);
            }
        }
        return usable.stream().map(p -> {
            Event e = (Event) p[0];
            Gate g = (Gate) p[1];
            Stats s = stats.get(e.getId());
            return new ScanOption(new EventBrief(e.getId(), e.getTitle(), e.getStartsAt().toEpochMilli(), e.getEndsAt().toEpochMilli(),
                    e.getStatus().name(), e.getVenue().getName()), g.getId(), g.getName(),
                    perGate.getOrDefault(e.getId() + ":" + g.getId(), 0L), s.entered(), s.confirmed());
        }).toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<ScanLogView> history(Long eventId, String result, int page, int size) {
        Long me = CurrentUser.id();
        boolean admin = CurrentUser.hasRole("ADMIN");
        boolean security = CurrentUser.hasRole("SECURITY");
        List<Long> eventIds = admin || security ? List.of(-1L)
                : events.findByOrganizer(me).stream().map(Event::getId).toList();
        if (eventIds.isEmpty()) {
            eventIds = List.of(-1L);
        }
        boolean onlyFailures = "FAIL".equals(result);
        ScanResult exact = result == null || result.isBlank() || onlyFailures ? null : ScanResult.valueOf(result);
        Page<ScanLog> pageData = logs.search(admin || security, eventIds, security ? me : null, eventId, onlyFailures, exact,
                PageResponse.request(page, size, Sort.by(Sort.Direction.DESC, "scannedAt").and(Sort.by(Sort.Direction.DESC, "id"))));
        List<ScanLog> list = pageData.getContent();
        Map<Long, User> people = users.findAllById(list.stream().flatMap(l -> java.util.stream.Stream.of(l.getParticipantId(), l.getScannedBy()))
                .filter(x -> x != null).distinct().toList()).stream().collect(Collectors.toMap(User::getId, Function.identity()));
        Map<Long, String> eventTitles = events.findAllById(list.stream().map(ScanLog::getEventId).distinct().toList()).stream()
                .collect(Collectors.toMap(Event::getId, Event::getTitle));
        Map<Long, String> gateNames = gates.findAllById(list.stream().map(ScanLog::getGateId).distinct().toList()).stream()
                .collect(Collectors.toMap(Gate::getId, Gate::getName));
        List<ScanLogView> items = list.stream().map(l -> new ScanLogView(l.getId(), l.getScannedAt().toEpochMilli(), l.getResult().name(),
                l.getMethod().name(), l.getParticipantId() == null || people.get(l.getParticipantId()) == null ? null : UserMapper.person(people.get(l.getParticipantId())),
                l.getEventId(), eventTitles.get(l.getEventId()), gateNames.get(l.getGateId()),
                people.containsKey(l.getScannedBy()) ? people.get(l.getScannedBy()).getFullName() : null)).toList();
        return new PageResponse<>(items, pageData.getNumber() + 1, pageData.getSize(), pageData.getTotalElements(), Math.max(pageData.getTotalPages(), 1));
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        Long me = CurrentUser.id();
        Instant startOfDay = LocalDate.now(IST).atStartOfDay(IST).toInstant();
        long allowed = logs.countByScannedByAndScannedAtAfterAndResult(me, startOfDay, ScanResult.SUCCESS);
        long total = logs.countByScannedByAndScannedAtAfter(me, startOfDay);
        return new Summary(allowed, total - allowed);
    }
}
