package in.gndec.events.event;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CsvParser;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.PageResponse;
import in.gndec.events.event.EventDtos.EntryRef;
import in.gndec.events.event.EventDtos.EventRequest;
import in.gndec.events.event.EventDtos.EventView;
import in.gndec.events.event.EventDtos.NamedRef;
import in.gndec.events.event.EventDtos.ParticipantView;
import in.gndec.events.event.EventDtos.PassRef;
import in.gndec.events.event.EventDtos.PendingRequest;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.scan.SecurityAssignment;
import in.gndec.events.scan.SecurityAssignmentRepository;
import in.gndec.events.user.DepartmentRepository;
import in.gndec.events.user.Role;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import in.gndec.events.user.UserMapper;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.GateRepository;
import in.gndec.events.venue.Venue;
import in.gndec.events.venue.VenueRepository;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Organizer/admin side of objective 1: create, schedule, publish and run events, assign gate staff,
 * and see participant information.
 */
@Service
public class ManageEventService {

    private final EventRepository events;
    private final VenueRepository venues;
    private final GateRepository gates;
    private final UserRepository users;
    private final DepartmentRepository departments;
    private final RegistrationRepository registrations;
    private final PassRepository passes;
    private final EntryRepository entries;
    private final SecurityAssignmentRepository assignments;
    private final EventViews views;
    private final EventAccess access;
    private final AuditService audit;

    public ManageEventService(EventRepository events, VenueRepository venues, GateRepository gates, UserRepository users,
            DepartmentRepository departments, RegistrationRepository registrations, PassRepository passes,
            EntryRepository entries, SecurityAssignmentRepository assignments, EventViews views, EventAccess access,
            AuditService audit) {
        this.events = events;
        this.venues = venues;
        this.gates = gates;
        this.users = users;
        this.departments = departments;
        this.registrations = registrations;
        this.passes = passes;
        this.entries = entries;
        this.assignments = assignments;
        this.views = views;
        this.access = access;
        this.audit = audit;
    }

    private User me() {
        return users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account"));
    }

    Event managed(Long id) {
        Event e = events.findById(id).orElseThrow(() -> ApiException.notFound("Event"));
        access.requireManage(e);
        return e;
    }

    // ------------------------------------------------------------------ reading

    @Transactional(readOnly = true)
    public List<EventView> list() {
        User me = me();
        List<Event> list = me.getRole() == Role.ADMIN ? events.findAll() : events.findByOrganizer(me.getId());
        return views.build(list.stream().sorted(Comparator.comparing(Event::getStartsAt)).toList(), me, false);
    }

    @Transactional(readOnly = true)
    public EventView get(Long id) {
        return views.one(managed(id), me(), true);
    }

    // ------------------------------------------------------------------ create / edit

    @Transactional
    public EventView create(EventRequest req, boolean publish) {
        User me = me();
        Event e = new Event();
        e.setCreatedBy(me.getId());
        apply(e, req, true);
        e.setOrganizers(organizers(req.organizerIds(), me, Set.of()));
        events.save(e);
        replaceGateStaff(e, req.gateStaff());
        audit.log("EVENT_CREATED", "Event", e.getId(), e.getTitle());
        if (publish) {
            doPublish(e);
        }
        return views.one(e, me, true);
    }

    @Transactional
    public EventView update(Long id, EventRequest req) {
        Event e = managed(id);
        if (e.getStatus() == Event.Status.COMPLETED || e.getStatus() == Event.Status.CANCELLED) {
            throw ApiException.conflict("EVENT_LOCKED", "Completed and cancelled events can't be edited, so records stay accurate.");
        }
        Long oldVenue = e.getVenue().getId();
        Instant oldStart = e.getStartsAt();
        Instant oldEnd = e.getEndsAt();
        apply(e, req, false);
        e.setOrganizers(organizers(req.organizerIds(), me(), e.getOrganizers()));
        boolean live = e.getStatus() == Event.Status.PUBLISHED || e.getStatus() == Event.Status.CLOSED;
        if (live && (!oldVenue.equals(e.getVenue().getId()) || !oldStart.equals(e.getStartsAt()) || !oldEnd.equals(e.getEndsAt()))) {
            ensureNoClash(e);
        }
        if (live && e.getGates().isEmpty()) {
            throw ApiException.field("gateIds", "Published events need at least one entry gate.");
        }
        events.flush();
        replaceGateStaff(e, req.gateStaff());
        audit.log("EVENT_UPDATED", "Event", e.getId(), e.getTitle());
        return views.one(e, me(), true);
    }

    private void apply(Event e, EventRequest r, boolean isNew) {
        Instant now = Instant.now();
        Venue v = venues.findById(r.venueId()).filter(Venue::isActive).filter(Venue::isCanHostEvents)
                .orElseThrow(() -> ApiException.field("venueId", "Choose an active venue that can host events."));
        Instant start = Instant.ofEpochMilli(r.startsAt());
        Instant end = Instant.ofEpochMilli(r.endsAt());
        if (!end.isAfter(start)) {
            throw ApiException.field("endsAt", "The event must end after it starts.");
        }
        if ((isNew || e.getStatus() == Event.Status.DRAFT) && start.isBefore(now)) {
            throw ApiException.field("startsAt", "The start time is in the past.");
        }
        Instant opens;
        Instant closes;
        if (r.mode() == Event.Mode.AUTO_ASSIGN) {
            opens = isNew || e.getRegOpensAt() == null ? now : e.getRegOpensAt();
            closes = start;
        } else {
            if (r.regOpensAt() == null || r.regClosesAt() == null) {
                throw ApiException.field("regClosesAt", "Set when registration opens and closes.");
            }
            opens = Instant.ofEpochMilli(r.regOpensAt());
            closes = Instant.ofEpochMilli(r.regClosesAt());
            if (!closes.isAfter(opens)) {
                throw ApiException.field("regClosesAt", "Registration must close after it opens.");
            }
            if (closes.isAfter(start)) {
                throw ApiException.field("regClosesAt", "Registration should close before the event starts.");
            }
        }
        if (!isNew) {
            if (r.capacity() < e.getConfirmedCount()) {
                throw ApiException.field("capacity", "Capacity can't be below the " + e.getConfirmedCount() + " seats already confirmed.");
            }
            if (r.mode() != e.getMode() && registrations.countByEventIdAndStatusIn(e.getId(), EnumSet.allOf(Registration.Status.class)) > 0) {
                throw ApiException.field("mode", "The registration mode can't change after people have registered.");
            }
        }
        EventDtos.Eligibility rules = r.eligibility() == null ? EventDtos.Eligibility.none() : r.eligibility();
        Set<String> depts = new LinkedHashSet<>(rules.departments() == null ? List.of() : rules.departments());
        Set<Integer> sems = new LinkedHashSet<>(rules.semesters() == null ? List.of() : rules.semesters());
        Set<String> secs = new LinkedHashSet<>(rules.sections() == null ? List.of() : rules.sections());
        for (String d : depts) {
            if (!departments.existsById(d)) {
                throw ApiException.field("eligibility", "Unknown department " + d + ".");
            }
        }
        if (sems.stream().anyMatch(s -> s < 1 || s > 8)) {
            throw ApiException.field("eligibility", "Semesters must be between 1 and 8.");
        }
        if (secs.stream().anyMatch(s -> !s.matches("[A-D]"))) {
            throw ApiException.field("eligibility", "Sections must be A, B, C or D.");
        }
        Set<Gate> chosen = new LinkedHashSet<>();
        for (Long gid : r.gateIds() == null ? List.<Long>of() : r.gateIds()) {
            Gate g = gates.findById(gid).orElseThrow(() -> ApiException.field("gateIds", "Unknown gate."));
            if (!g.getVenue().getId().equals(v.getId())) {
                throw ApiException.field("gateIds", "Gate \"" + g.getName() + "\" belongs to a different venue.");
            }
            chosen.add(g);
        }
        e.setTitle(r.title().trim());
        e.setDescription(r.description().trim());
        e.setCategory(r.category());
        e.setVenue(v);
        e.setStartsAt(start);
        e.setEndsAt(end);
        e.setRegOpensAt(opens);
        e.setRegClosesAt(closes);
        e.setCapacity(r.capacity());
        e.setMode(r.mode());
        e.setAllowOutsiders(Boolean.TRUE.equals(r.allowOutsiders()));
        e.getEligibleDepartments().clear();
        e.getEligibleDepartments().addAll(depts);
        e.getEligibleSemesters().clear();
        e.getEligibleSemesters().addAll(sems);
        e.getEligibleSections().clear();
        e.getEligibleSections().addAll(secs);
        e.getGates().clear();
        e.getGates().addAll(chosen);
    }

    private Set<User> organizers(List<Long> ids, User me, Set<User> current) {
        Set<User> out = new LinkedHashSet<>();
        if (me.getRole() == Role.ORGANIZER) {
            out.add(me);
        }
        if (ids != null) {
            for (Long id : ids) {
                User u = users.findById(id).orElseThrow(() -> ApiException.field("organizerIds", "Unknown organizer."));
                if (u.getRole() != Role.ORGANIZER || u.getStatus() != User.Status.ACTIVE) {
                    throw ApiException.field("organizerIds", u.getFullName() + " is not an active organizer.");
                }
                out.add(u);
            }
        } else {
            out.addAll(current);
        }
        if (out.isEmpty()) {
            out.add(me);
        }
        return out;
    }

    private void ensureNoClash(Event e) {
        List<Event> clashes = events.findVenueClashes(e.getVenue().getId(), e.getId() == null ? -1L : e.getId(),
                e.getStartsAt(), e.getEndsAt());
        if (!clashes.isEmpty()) {
            Event x = clashes.get(0);
            throw ApiException.conflict("VENUE_CLASH", "“" + x.getTitle() + "” already uses " + e.getVenue().getName()
                    + " from " + EligibilityService.format(x.getStartsAt()) + " to " + EligibilityService.format(x.getEndsAt())
                    + ". Pick another time or venue.");
        }
    }

    // ------------------------------------------------------------------ lifecycle (requirement O1-09)

    @Transactional
    public EventView publish(Long id) {
        Event e = managed(id);
        if (e.getStatus() != Event.Status.DRAFT) {
            throw ApiException.conflict("INVALID_STATE", "Only drafts can be published.");
        }
        doPublish(e);
        return views.one(e, me(), true);
    }

    private void doPublish(Event e) {
        if (e.getGates().isEmpty()) {
            throw ApiException.field("gateIds", "Add at least one entry gate before publishing.");
        }
        if (e.getStartsAt().isBefore(Instant.now())) {
            throw ApiException.field("startsAt", "The start time is in the past.");
        }
        ensureNoClash(e);
        e.setStatus(Event.Status.PUBLISHED);
        audit.log("EVENT_PUBLISHED", "Event", e.getId(), e.getTitle());
    }

    @Transactional
    public EventView close(Long id) {
        Event e = managed(id);
        requireStatus(e, Event.Status.PUBLISHED, "Only published events can be closed for registration.");
        e.setStatus(Event.Status.CLOSED);
        audit.log("EVENT_CLOSED", "Event", e.getId(), e.getTitle());
        return views.one(e, me(), true);
    }

    @Transactional
    public EventView reopen(Long id) {
        Event e = managed(id);
        requireStatus(e, Event.Status.CLOSED, "Only closed events can be reopened.");
        if (e.getEndsAt().isBefore(Instant.now())) {
            throw ApiException.conflict("INVALID_STATE", "This event has already ended.");
        }
        e.setStatus(Event.Status.PUBLISHED);
        audit.log("EVENT_REOPENED", "Event", e.getId(), e.getTitle());
        return views.one(e, me(), true);
    }

    @Transactional
    public EventView complete(Long id) {
        Event e = managed(id);
        if (e.getStatus() != Event.Status.PUBLISHED && e.getStatus() != Event.Status.CLOSED) {
            throw ApiException.conflict("INVALID_STATE", "Only published or closed events can be completed.");
        }
        e.setStatus(Event.Status.COMPLETED);
        int expired = passes.expireForEvent(e.getId());
        audit.log("EVENT_COMPLETED", "Event", e.getId(), e.getTitle() + " · " + expired + " unused passes expired");
        return views.one(e, me(), true);
    }

    /** Cancels the event, revokes every pass and frees every seat (requirement O1-09). */
    @Transactional
    public EventView cancel(Long id, String reason) {
        Event e = events.lockById(id).orElseThrow(() -> ApiException.notFound("Event"));
        access.requireManage(e);
        if (e.getStatus() == Event.Status.DRAFT) {
            throw ApiException.conflict("INVALID_STATE", "Drafts aren't visible to anyone yet — delete the draft instead.");
        }
        if (e.getStatus() == Event.Status.COMPLETED || e.getStatus() == Event.Status.CANCELLED) {
            throw ApiException.conflict("INVALID_STATE", "This event is already " + e.getStatus().name().toLowerCase() + ".");
        }
        Instant now = Instant.now();
        e.setStatus(Event.Status.CANCELLED);
        e.setCancelReason(reason.trim());
        int regs = registrations.cancelAllForEvent(e.getId(), "Event cancelled: " + reason.trim(), now);
        int revoked = passes.revokeAllForEvent(e.getId(), now, "Event cancelled");
        events.resetSeats(e.getId());
        audit.log("EVENT_CANCELLED", "Event", e.getId(), e.getTitle() + " · " + reason + " · " + regs + " registrations, " + revoked + " passes revoked");
        return views.one(events.findById(id).orElseThrow(), me(), true);
    }

    @Transactional
    public void delete(Long id) {
        Event e = managed(id);
        if (e.getStatus() != Event.Status.DRAFT) {
            throw ApiException.conflict("INVALID_STATE", "Only drafts can be deleted. Cancel published events instead.");
        }
        assignments.deleteForEvent(e.getId());
        events.delete(e);
        audit.log("EVENT_DELETED", "Event", id, e.getTitle());
    }

    private static void requireStatus(Event e, Event.Status status, String message) {
        if (e.getStatus() != status) {
            throw ApiException.conflict("INVALID_STATE", message);
        }
    }

    // ------------------------------------------------------------------ gate staff (requirement O1-13)

    @Transactional
    public EventView setGateStaff(Long eventId, Long gateId, List<Long> userIds) {
        Event e = managed(eventId);
        if (!e.hasGate(gateId)) {
            throw ApiException.badRequest("UNKNOWN_GATE", "That gate isn't used by this event.");
        }
        assignments.deleteForGate(eventId, gateId);
        Gate gate = gates.findById(gateId).orElseThrow();
        List<String> names = new ArrayList<>();
        for (Long uid : new LinkedHashSet<>(userIds)) {
            User u = securityUser(uid);
            assignments.save(new SecurityAssignment(e, gate, u));
            names.add(u.getFullName());
        }
        audit.log("SECURITY_ASSIGNED", "Event", eventId, gate.getName() + ": " + (names.isEmpty() ? "nobody" : String.join(", ", names)));
        return views.one(e, me(), true);
    }

    private void replaceGateStaff(Event e, Map<Long, List<Long>> gateStaff) {
        List<Long> keep = e.getGates().stream().map(Gate::getId).toList();
        if (keep.isEmpty()) {
            assignments.deleteForEvent(e.getId());
        } else {
            assignments.deleteOutsideGates(e.getId(), keep);
        }
        if (gateStaff == null) {
            return;
        }
        for (Map.Entry<Long, List<Long>> entry : gateStaff.entrySet()) {
            if (!e.hasGate(entry.getKey())) {
                continue;
            }
            assignments.deleteForGate(e.getId(), entry.getKey());
            Gate gate = gates.findById(entry.getKey()).orElseThrow();
            for (Long uid : new LinkedHashSet<>(entry.getValue())) {
                assignments.save(new SecurityAssignment(e, gate, securityUser(uid)));
            }
        }
    }

    private User securityUser(Long id) {
        User u = users.findById(id).orElseThrow(() -> ApiException.badRequest("UNKNOWN_USER", "Unknown staff member."));
        if (u.getRole() != Role.SECURITY || u.getStatus() != User.Status.ACTIVE) {
            throw ApiException.badRequest("NOT_SECURITY", u.getFullName() + " is not active security staff.");
        }
        return u;
    }

    // ------------------------------------------------------------------ participant information (requirement O1-12)

    private Specification<Registration> participantSpec(Long eventId, String status, String q, String dept, Role type) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(cb.equal(root.get("event").get("id"), eventId));
            Join<Registration, User> u = root.join("user");
            Join<User, StudentProfile> p = u.join("profile", JoinType.LEFT);
            if ("CHECKED_IN".equals(status)) {
                Subquery<Long> sq = query.subquery(Long.class);
                Root<Entry> en = sq.from(Entry.class);
                sq.select(en.get("id")).where(cb.equal(en.get("registrationId"), root.get("id")));
                ps.add(cb.exists(sq));
            } else if (status != null && !status.isBlank() && !"ALL".equals(status)) {
                ps.add(cb.equal(root.get("status"), Registration.Status.valueOf(status)));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(cb.like(cb.lower(u.get("fullName")), like), cb.like(cb.lower(u.get("email")), like), cb.like(p.get("urn"), like)));
            }
            if (dept != null && !dept.isBlank()) {
                ps.add(cb.equal(p.get("departmentCode"), dept));
            }
            if (type != null) {
                ps.add(cb.equal(u.get("role"), type));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }

    @Transactional(readOnly = true)
    public PageResponse<ParticipantView> participants(Long eventId, String status, String q, String dept, Role type, int page, int size) {
        Event e = managed(eventId);
        var result = registrations.findAll(participantSpec(e.getId(), status, q, dept, type),
                PageResponse.request(page, size, Sort.by("registeredAt").and(Sort.by("id"))));
        List<ParticipantView> items = participantViews(e, result.getContent());
        return new PageResponse<>(items, result.getNumber() + 1, result.getSize(), result.getTotalElements(), Math.max(result.getTotalPages(), 1));
    }

    @Transactional(readOnly = true)
    public String participantsCsv(Long eventId, String status, String q, String dept, Role type) {
        Event e = managed(eventId);
        List<Registration> regs = registrations.findAll(participantSpec(e.getId(), status, q, dept, type), Sort.by("registeredAt").and(Sort.by("id")));
        List<ParticipantView> rows = participantViews(e, regs);
        StringBuilder sb = new StringBuilder(CsvParser.row("Name", "URN / Email", "Type", "Department / Unit", "Status",
                "Registered at", "Decided at", "Pass code", "Pass status", "Entered at", "Gate", "Note", "Reason"));
        for (ParticipantView r : rows) {
            sb.append(CsvParser.row(r.person().name(), r.person().idLabel(), r.person().role(), r.person().sub(), r.status(),
                    EligibilityService.format(Instant.ofEpochMilli(r.registeredAt())),
                    r.decidedAt() == null ? "" : EligibilityService.format(Instant.ofEpochMilli(r.decidedAt())),
                    r.pass() == null ? "" : r.pass().code(), r.pass() == null ? "" : r.pass().status(),
                    r.entry() == null ? "" : EligibilityService.format(Instant.ofEpochMilli(r.entry().at())),
                    r.entry() == null ? "" : r.entry().gateName(), r.note(), r.reason()));
        }
        audit.log("PARTICIPANTS_EXPORTED", "Event", eventId, rows.size() + " rows");
        return sb.toString();
    }

    private List<ParticipantView> participantViews(Event e, List<Registration> regs) {
        List<Long> ids = regs.stream().map(Registration::getId).toList();
        Map<Long, Pass> passByReg = new HashMap<>();
        Map<Long, Entry> entryByReg = new HashMap<>();
        Map<Long, String> gateNames = new HashMap<>();
        Map<Long, Integer> positions = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Pass p : passes.findByRegistrationIdIn(ids)) {
                Pass cur = passByReg.get(p.getRegistration().getId());
                if (cur == null || better(p, cur)) {
                    passByReg.put(p.getRegistration().getId(), p);
                }
            }
            entries.findByRegistrationIdIn(ids).forEach(en -> entryByReg.put(en.getRegistrationId(), en));
            gates.findAllById(entryByReg.values().stream().map(Entry::getGateId).toList()).forEach(g -> gateNames.put(g.getId(), g.getName()));
            if (regs.stream().anyMatch(r -> r.getStatus() == Registration.Status.WAITLISTED)) {
                List<Registration> wl = registrations.findByEventAndStatusOldestFirst(e.getId(), Registration.Status.WAITLISTED);
                for (int i = 0; i < wl.size(); i++) {
                    positions.put(wl.get(i).getId(), i + 1);
                }
            }
        }
        return regs.stream().map(r -> {
            Pass p = passByReg.get(r.getId());
            Entry en = entryByReg.get(r.getId());
            return new ParticipantView(r.getId(), UserMapper.person(r.getUser()), r.getStatus().name(), r.getNote(), r.getReason(),
                    r.getRegisteredAt().toEpochMilli(), EventViews.millis(r.getDecidedAt()), positions.get(r.getId()),
                    p == null ? null : new PassRef(p.getId(), p.getStatus().name(), p.getCode()),
                    en == null ? null : new EntryRef(en.getEnteredAt().toEpochMilli(), gateNames.get(en.getGateId())));
        }).toList();
    }

    private static boolean better(Pass a, Pass b) {
        int ra = a.getStatus() == Pass.Status.ACTIVE ? 3 : a.getStatus() == Pass.Status.USED ? 2 : 1;
        int rb = b.getStatus() == Pass.Status.ACTIVE ? 3 : b.getStatus() == Pass.Status.USED ? 2 : 1;
        return ra > rb || (ra == rb && a.getIssuedAt().isAfter(b.getIssuedAt()));
    }

    // ------------------------------------------------------------------ helpers for the wizard and dashboard

    @Transactional(readOnly = true)
    public long eligiblePreview(EventDtos.Eligibility rules) {
        Collection<String> d = rules == null ? List.of() : rules.departments();
        Collection<Integer> s = rules == null ? List.of() : rules.semesters();
        Collection<String> c = rules == null ? List.of() : rules.sections();
        return users.findActiveEnrolledStudents().stream().filter(u -> EligibilityService.matches(u.getProfile(), d, s, c)).count();
    }

    @Transactional(readOnly = true)
    public List<NamedRef> staff(Role role) {
        return users.findByRoleAndStatusOrderByFullName(role, User.Status.ACTIVE).stream()
                .map(u -> new NamedRef(u.getId(), u.getFullName() + (u.getUnit() == null ? "" : " · " + u.getUnit()))).toList();
    }

    @Transactional(readOnly = true)
    public List<PendingRequest> pending(int limit) {
        User me = me();
        List<Long> ids = (me.getRole() == Role.ADMIN ? events.findAll() : events.findByOrganizer(me.getId())).stream().map(Event::getId).toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        return registrations.findPendingForEvents(ids).stream().limit(Math.max(1, Math.min(limit, 50)))
                .map(r -> new PendingRequest(r.getId(), r.getEvent().getId(), r.getEvent().getTitle(), UserMapper.person(r.getUser()),
                        r.getRegisteredAt().toEpochMilli(), r.getNote()))
                .toList();
    }
}
