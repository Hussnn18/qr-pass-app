package in.gndec.events.registration;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.event.EligibilityService;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventAccess;
import in.gndec.events.event.EventDtos.EligibilityCheck;
import in.gndec.events.event.EventDtos.EntryRef;
import in.gndec.events.event.EventDtos.PassRef;
import in.gndec.events.event.EventDtos.Reason;
import in.gndec.events.event.EventDtos.RegistrationWindow;
import in.gndec.events.event.EventRepository;
import in.gndec.events.event.EventViews;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.pass.PassService;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.GateRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registration, approval and waitlist (requirements O2-10 … O2-12).
 *
 * Concurrency: every operation that can change seats first locks the event row (EventRepository#lockById),
 * so operations on one event run one after another. Seats are then taken with a conditional UPDATE, and the
 * database CHECK (confirmed_count <= capacity) is the last line of defence.
 */
@Service
public class RegistrationService {

    public record RegisterResult(Long registrationId, String status, String message) {
    }

    public record BulkResult(int done, int full, int skippedIneligible, int skippedExisting, int unknown, String message) {
    }

    public record EventBrief(Long id, String title, long startsAt, long endsAt, String status, String mode, Long venueId,
            String venueName) {
    }

    public record MyRegistrationView(Long id, String status, long registeredAt, Long decidedAt, String note, String reason,
            Integer waitlistPosition, EventBrief event, PassRef pass, EntryRef entry) {
    }

    private final RegistrationRepository registrations;
    private final EventRepository events;
    private final UserRepository users;
    private final PassRepository passes;
    private final EntryRepository entries;
    private final GateRepository gates;
    private final PassService passService;
    private final EligibilityService eligibility;
    private final EventAccess access;
    private final AuditService audit;

    public RegistrationService(RegistrationRepository registrations, EventRepository events, UserRepository users,
            PassRepository passes, EntryRepository entries, GateRepository gates, PassService passService,
            EligibilityService eligibility, EventAccess access, AuditService audit) {
        this.registrations = registrations;
        this.events = events;
        this.users = users;
        this.passes = passes;
        this.entries = entries;
        this.gates = gates;
        this.passService = passService;
        this.eligibility = eligibility;
        this.access = access;
        this.audit = audit;
    }

    private Event lock(Long eventId) {
        return events.lockById(eventId).orElseThrow(() -> ApiException.notFound("Event"));
    }

    // ------------------------------------------------------------------ participant side

    @Transactional
    public RegisterResult register(Long eventId, String note) {
        User me = users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account"));
        if (me.getRole() != Role.STUDENT && me.getRole() != Role.GUEST) {
            throw ApiException.forbidden("Only students register for events.");
        }
        Event e = lock(eventId);
        if (e.getStatus() == Event.Status.DRAFT || (me.getRole() == Role.GUEST && !e.isAllowOutsiders())) {
            throw ApiException.notFound("Event");
        }
        if (e.getMode() == Event.Mode.AUTO_ASSIGN) {
            throw ApiException.conflict("AUTO_ASSIGNED", "Passes for this event are issued by the organizer.");
        }
        EligibilityCheck check = eligibility.check(me, e);
        if (!check.eligible()) {
            String why = check.reasons().stream().filter(r -> !r.ok()).map(Reason::label).findFirst().orElse("Eligibility rules");
            throw new ApiException(HttpStatus.FORBIDDEN, "NOT_ELIGIBLE", "You are not eligible for this event (" + why + ").");
        }
        Instant now = Instant.now();
        RegistrationWindow window = eligibility.window(e, now);
        if (!window.open()) {
            throw ApiException.conflict("REGISTRATION_CLOSED", window.reason() + ".");
        }
        Registration r = registrations.findByEventIdAndUserId(e.getId(), me.getId()).orElse(null);
        if (r != null && r.isActive()) {
            throw ApiException.conflict("ALREADY_REGISTERED", "You have already registered for this event.");
        }
        if (r != null && r.getStatus() == Registration.Status.REJECTED) {
            throw ApiException.conflict("REJECTED", "Your earlier request for this event was not approved.");
        }
        if (r == null) {
            r = new Registration();
            r.setEvent(e);
            r.setUser(me);
        }
        r.setRegisteredAt(now);
        r.setDecidedAt(null);
        r.setDecidedBy(null);
        r.setReason(null);
        r.setNote(note == null || note.isBlank() ? null : note.trim());
        String message;
        if (e.getMode() == Event.Mode.APPROVAL) {
            r.setStatus(Registration.Status.PENDING);
            message = "Request sent. The organizer will review it.";
        } else if (events.claimSeat(e.getId()) == 1) {
            r.setStatus(Registration.Status.CONFIRMED);
            r.setDecidedAt(now);
            message = "You're registered. Your pass is ready in My Passes.";
        } else {
            r.setStatus(Registration.Status.WAITLISTED);
            message = "The event is full, so you've been added to the waitlist.";
        }
        registrations.saveAndFlush(r);
        if (r.getStatus() == Registration.Status.CONFIRMED) {
            passService.issue(r);
        }
        audit.log("REGISTRATION_" + r.getStatus().name(), "Event", e.getId(), e.getTitle());
        return new RegisterResult(r.getId(), r.getStatus().name(), message);
    }

    @Transactional
    public String cancelMine(Long registrationId) {
        Long eventId = registrations.findEventIdForUser(registrationId, CurrentUser.id())
                .orElseThrow(() -> ApiException.notFound("Registration"));
        Event e = lock(eventId);
        Registration r = registrations.findById(registrationId).orElseThrow();
        if (!Instant.now().isBefore(e.getStartsAt())) {
            throw ApiException.conflict("EVENT_STARTED", "You can't cancel after the event has started.");
        }
        if (!r.isActive()) {
            throw ApiException.conflict("NOT_ACTIVE", "This registration is already " + r.getStatus().name().toLowerCase() + ".");
        }
        boolean wasConfirmed = r.getStatus() == Registration.Status.CONFIRMED;
        end(r, Registration.Status.CANCELLED, "Cancelled by participant", null);
        audit.log("REGISTRATION_CANCELLED", "Event", e.getId(), e.getTitle());
        if (wasConfirmed && e.getMode() == Event.Mode.OPEN && promoteWaitlisted(e) > 0) {
            return "Registration cancelled. Your seat went to the next person on the waitlist.";
        }
        return "Registration cancelled.";
    }

    @Transactional(readOnly = true)
    public List<MyRegistrationView> mine() {
        Long me = CurrentUser.id();
        List<Registration> list = registrations.findMine(me);
        List<Long> ids = list.stream().map(Registration::getId).toList();
        Map<Long, Pass> pass = new HashMap<>();
        for (Pass p : ids.isEmpty() ? List.<Pass>of() : passes.findByRegistrationIdIn(ids)) {
            Pass cur = pass.get(p.getRegistration().getId());
            if (cur == null || rank(p) > rank(cur) || (rank(p) == rank(cur) && p.getIssuedAt().isAfter(cur.getIssuedAt()))) {
                pass.put(p.getRegistration().getId(), p);
            }
        }
        Map<Long, Entry> entry = new HashMap<>();
        if (!ids.isEmpty()) {
            entries.findByRegistrationIdIn(ids).forEach(x -> entry.put(x.getRegistrationId(), x));
        }
        Map<Long, String> gateNames = new HashMap<>();
        gates.findAllById(entry.values().stream().map(Entry::getGateId).toList()).forEach(g -> gateNames.put(g.getId(), g.getName()));
        return list.stream().map(r -> {
            Event e = r.getEvent();
            Pass p = pass.get(r.getId());
            Entry en = entry.get(r.getId());
            Integer position = r.getStatus() == Registration.Status.WAITLISTED
                    ? (int) registrations.waitlistPosition(e.getId(), r.getRegisteredAt(), r.getId()) : null;
            return new MyRegistrationView(r.getId(), r.getStatus().name(), r.getRegisteredAt().toEpochMilli(),
                    EventViews.millis(r.getDecidedAt()), r.getNote(), r.getReason(), position,
                    new EventBrief(e.getId(), e.getTitle(), e.getStartsAt().toEpochMilli(), e.getEndsAt().toEpochMilli(),
                            e.getStatus().name(), e.getMode().name(), e.getVenue().getId(), e.getVenue().getName()),
                    p == null ? null : new PassRef(p.getId(), p.getStatus().name(), p.getCode()),
                    en == null ? null : new EntryRef(en.getEnteredAt().toEpochMilli(), gateNames.get(en.getGateId())));
        }).toList();
    }

    // ------------------------------------------------------------------ organizer side

    /** Approve pending requests or promote waitlisted people, as long as seats remain. */
    @Transactional
    public BulkResult approve(List<Long> registrationIds) {
        int done = 0;
        int full = 0;
        for (Map.Entry<Long, List<Long>> group : byEvent(registrationIds).entrySet()) {
            Event e = lock(group.getKey());
            access.requireManage(e);
            for (Long id : group.getValue()) {
                Registration r = registrations.findById(id).orElseThrow();
                if (r.getStatus() != Registration.Status.PENDING && r.getStatus() != Registration.Status.WAITLISTED) {
                    continue;
                }
                if (events.claimSeat(e.getId()) == 0) {
                    full++;
                    continue;
                }
                confirm(r, CurrentUser.id());
                audit.log("REGISTRATION_APPROVED", "Registration", r.getId(), r.getUser().getFullName() + " · " + e.getTitle());
                done++;
            }
        }
        if (done == 0 && full > 0) {
            throw ApiException.conflict("EVENT_FULL", "The event is full. Increase the capacity or remove someone first.");
        }
        String msg = done + " approved" + (full > 0 ? ", " + full + " not approved because the event is full" : "") + ".";
        return new BulkResult(done, full, 0, 0, 0, msg);
    }

    @Transactional
    public BulkResult reject(List<Long> registrationIds, String reason) {
        int done = 0;
        for (Map.Entry<Long, List<Long>> group : byEvent(registrationIds).entrySet()) {
            Event e = lock(group.getKey());
            access.requireManage(e);
            for (Long id : group.getValue()) {
                Registration r = registrations.findById(id).orElseThrow();
                if (!r.isActive()) {
                    continue;
                }
                boolean wasConfirmed = r.getStatus() == Registration.Status.CONFIRMED;
                end(r, Registration.Status.REJECTED, reason.trim(), CurrentUser.id());
                audit.log("REGISTRATION_REJECTED", "Registration", r.getId(), r.getUser().getFullName() + " · " + reason);
                done++;
                if (wasConfirmed && e.getMode() == Event.Mode.OPEN) {
                    promoteWaitlisted(e);
                }
            }
        }
        return new BulkResult(done, 0, 0, 0, 0, done + " request(s) rejected.");
    }

    /** Organizer removes someone (e.g. duplicate account). Their pass stops working; the waitlist moves up. */
    @Transactional
    public String remove(Long registrationId, String reason) {
        Long eventId = registrations.findEventId(registrationId).orElseThrow(() -> ApiException.notFound("Registration"));
        Event e = lock(eventId);
        access.requireManage(e);
        Registration r = registrations.findById(registrationId).orElseThrow();
        if (!r.isActive()) {
            throw ApiException.conflict("NOT_ACTIVE", "This registration is already " + r.getStatus().name().toLowerCase() + ".");
        }
        boolean wasConfirmed = r.getStatus() == Registration.Status.CONFIRMED;
        end(r, Registration.Status.CANCELLED, reason.trim(), CurrentUser.id());
        audit.log("REGISTRATION_REMOVED", "Registration", r.getId(), r.getUser().getFullName() + " · " + reason);
        int promoted = wasConfirmed && e.getMode() == Event.Mode.OPEN ? promoteWaitlisted(e) : 0;
        return promoted > 0 ? "Participant removed. " + promoted + " waitlisted participant promoted." : "Participant removed.";
    }

    /** AUTO_ASSIGN events (and organizer convenience for others): issue passes to every eligible student, or to a list of URNs. */
    @Transactional
    public BulkResult bulkAssign(Long eventId, List<String> urns) {
        Event e = lock(eventId);
        access.requireManage(e);
        if (e.getStatus() != Event.Status.PUBLISHED && e.getStatus() != Event.Status.CLOSED) {
            throw ApiException.conflict("INVALID_STATE", "Publish the event before issuing passes.");
        }
        if (e.getEndsAt().isBefore(Instant.now())) {
            throw ApiException.conflict("INVALID_STATE", "This event has already ended.");
        }
        List<User> candidates;
        int unknown = 0;
        if (urns == null || urns.isEmpty()) {
            candidates = users.findActiveEnrolledStudents();
        } else {
            candidates = new ArrayList<>();
            for (String urn : new LinkedHashSet<>(urns)) {
                Optional<User> u = users.findByUrn(urn.trim());
                if (u.isPresent()) {
                    candidates.add(u.get());
                } else {
                    unknown++;
                }
            }
        }
        int done = 0;
        int ineligible = 0;
        int existing = 0;
        int full = 0;
        Instant now = Instant.now();
        for (User u : candidates) {
            if (!eligibility.check(u, e).eligible()) {
                ineligible++;
                continue;
            }
            Registration r = registrations.findByEventIdAndUserId(e.getId(), u.getId()).orElse(null);
            if (r != null && r.getStatus() == Registration.Status.CONFIRMED) {
                existing++;
                continue;
            }
            if (events.claimSeat(e.getId()) == 0) {
                full++;
                continue;
            }
            if (r == null) {
                r = new Registration();
                r.setEvent(e);
                r.setUser(u);
                r.setRegisteredAt(now);
            }
            r.setReason(null);
            confirm(r, CurrentUser.id());
            done++;
        }
        audit.log("PASSES_BULK_ASSIGNED", "Event", e.getId(), done + " issued · " + existing + " already had one · "
                + ineligible + " not eligible · " + full + " over capacity · " + unknown + " unknown URN");
        return new BulkResult(done, full, ineligible, existing, unknown, done + " pass(es) issued.");
    }

    // ------------------------------------------------------------------ shared steps

    private void confirm(Registration r, Long decidedBy) {
        r.setStatus(Registration.Status.CONFIRMED);
        r.setDecidedAt(Instant.now());
        r.setDecidedBy(decidedBy);
        registrations.saveAndFlush(r);
        passService.issue(r);
    }

    /** Ends an active registration; a confirmed seat is released and its pass revoked. */
    private void end(Registration r, Registration.Status to, String reason, Long decidedBy) {
        boolean wasConfirmed = r.getStatus() == Registration.Status.CONFIRMED;
        Instant now = Instant.now();
        r.setStatus(to);
        r.setReason(reason);
        r.setDecidedAt(now);
        r.setDecidedBy(decidedBy);
        registrations.saveAndFlush(r);
        if (wasConfirmed) {
            events.releaseSeat(r.getEvent().getId());
            passes.revokeActiveForRegistration(r.getId(), now, reason);
        }
    }

    /** Fills free seats from the waitlist, oldest first. The caller holds the event lock. */
    int promoteWaitlisted(Event e) {
        int promoted = 0;
        for (Registration next : registrations.findByEventAndStatusOldestFirst(e.getId(), Registration.Status.WAITLISTED)) {
            if (events.claimSeat(e.getId()) == 0) {
                break;
            }
            confirm(next, null);
            audit.log("WAITLIST_PROMOTED", "Registration", next.getId(), next.getUser().getFullName() + " · " + e.getTitle());
            promoted++;
        }
        return promoted;
    }

    private static int rank(Pass p) {
        return switch (p.getStatus()) {
            case ACTIVE -> 3;
            case USED -> 2;
            case REVOKED -> 1;
            case EXPIRED -> 0;
        };
    }

    private Map<Long, List<Long>> byEvent(List<Long> registrationIds) {
        Map<Long, List<Long>> out = new LinkedHashMap<>();
        List<Long> unique = new ArrayList<>(new LinkedHashSet<>(registrationIds));
        List<Object[]> rows = registrations.findEventIds(unique);
        if (rows.size() != unique.size()) {
            throw ApiException.notFound("Registration");
        }
        for (Object[] row : rows) {
            out.computeIfAbsent((Long) row[1], k -> new ArrayList<>()).add((Long) row[0]);
        }
        return out;
    }
}
