package in.gndec.events.event;

import in.gndec.events.event.EventDtos.Eligibility;
import in.gndec.events.event.EventDtos.EntryRef;
import in.gndec.events.event.EventDtos.EventView;
import in.gndec.events.event.EventDtos.GateStaff;
import in.gndec.events.event.EventDtos.MyRegistration;
import in.gndec.events.event.EventDtos.NamedRef;
import in.gndec.events.event.EventDtos.PassRef;
import in.gndec.events.event.EventDtos.Stats;
import in.gndec.events.event.EventDtos.VenueRef;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.scan.SecurityAssignment;
import in.gndec.events.scan.SecurityAssignmentRepository;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.GateRepository;
import in.gndec.events.venue.Venue;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Builds EventView objects for a list of events with a fixed number of queries (no N+1). */
@Component
public class EventViews {

    private final RegistrationRepository registrations;
    private final EntryRepository entries;
    private final PassRepository passes;
    private final SecurityAssignmentRepository assignments;
    private final GateRepository gates;
    private final EligibilityService eligibility;
    private final EventAccess access;

    public EventViews(RegistrationRepository registrations, EntryRepository entries, PassRepository passes,
            SecurityAssignmentRepository assignments, GateRepository gates, EligibilityService eligibility, EventAccess access) {
        this.registrations = registrations;
        this.entries = entries;
        this.passes = passes;
        this.assignments = assignments;
        this.gates = gates;
        this.eligibility = eligibility;
        this.access = access;
    }

    public Map<Long, Stats> stats(List<Event> events) {
        List<Long> ids = events.stream().map(Event::getId).toList();
        Map<Long, Map<Registration.Status, Long>> counts = new HashMap<>();
        Map<Long, Long> entered = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Object[] row : registrations.countByEventAndStatus(ids)) {
                counts.computeIfAbsent((Long) row[0], k -> new EnumMap<>(Registration.Status.class))
                        .put((Registration.Status) row[1], (Long) row[2]);
            }
            for (Object[] row : entries.countByEvents(ids)) {
                entered.put((Long) row[0], (Long) row[1]);
            }
        }
        Map<Long, Stats> out = new HashMap<>();
        for (Event e : events) {
            Map<Registration.Status, Long> c = counts.getOrDefault(e.getId(), Map.of());
            long confirmed = c.getOrDefault(Registration.Status.CONFIRMED, 0L);
            out.put(e.getId(), new Stats(e.getCapacity(), confirmed, c.getOrDefault(Registration.Status.PENDING, 0L),
                    c.getOrDefault(Registration.Status.WAITLISTED, 0L), c.getOrDefault(Registration.Status.REJECTED, 0L),
                    c.getOrDefault(Registration.Status.CANCELLED, 0L), entered.getOrDefault(e.getId(), 0L),
                    Math.max(e.getCapacity() - confirmed, 0)));
        }
        return out;
    }

    public List<EventView> build(List<Event> events, User viewer, boolean detail) {
        if (events.isEmpty()) {
            return List.of();
        }
        Instant now = Instant.now();
        Map<Long, Stats> stats = stats(events);
        boolean participant = viewer != null && (viewer.getRole() == Role.STUDENT || viewer.getRole() == Role.GUEST);
        Map<Long, Registration> mine = participant
                ? registrations.findByUserIdAndEventIdIn(viewer.getId(), events.stream().map(Event::getId).toList()).stream()
                        .collect(Collectors.toMap(r -> r.getEvent().getId(), Function.identity()))
                : Map.of();
        Map<Long, Pass> myPasses = new HashMap<>();
        Map<Long, Entry> myEntries = new HashMap<>();
        Map<Long, String> gateNames = new HashMap<>();
        if (detail && !mine.isEmpty()) {
            List<Long> regIds = mine.values().stream().map(Registration::getId).toList();
            passes.findByRegistrationIdIn(regIds).stream()
                    .sorted(Comparator.comparing(Pass::getIssuedAt))
                    .forEach(p -> {
                        Pass current = myPasses.get(p.getRegistration().getId());
                        if (current == null || rank(p) >= rank(current)) {
                            myPasses.put(p.getRegistration().getId(), p);
                        }
                    });
            entries.findByRegistrationIdIn(regIds).forEach(en -> myEntries.put(en.getRegistrationId(), en));
            gates.findAllById(myEntries.values().stream().map(Entry::getGateId).toList())
                    .forEach(g -> gateNames.put(g.getId(), g.getName()));
        }
        return events.stream().map(e -> {
            boolean canManage = access.canManage(e);
            Registration r = mine.get(e.getId());
            MyRegistration my = null;
            if (r != null) {
                Pass p = myPasses.get(r.getId());
                Entry en = myEntries.get(r.getId());
                Integer position = detail && r.getStatus() == Registration.Status.WAITLISTED
                        ? (int) registrations.waitlistPosition(e.getId(), r.getRegisteredAt(), r.getId()) : null;
                my = new MyRegistration(r.getId(), r.getStatus().name(), millis(r.getRegisteredAt()), millis(r.getDecidedAt()),
                        r.getNote(), r.getReason(), position,
                        p == null ? null : new PassRef(p.getId(), p.getStatus().name(), p.getCode()),
                        en == null ? null : new EntryRef(millis(en.getEnteredAt()), gateNames.get(en.getGateId())));
            }
            List<GateStaff> staff = detail && canManage ? gateStaff(e) : null;
            return new EventView(e.getId(), e.getTitle(), e.getDescription(), e.getCategory().name(), venue(e.getVenue()),
                    millis(e.getStartsAt()), millis(e.getEndsAt()), millis(e.getRegOpensAt()), millis(e.getRegClosesAt()),
                    e.getMode().name(), e.isAllowOutsiders(), e.getStatus().name(), e.getCancelReason(), eligibilityOf(e),
                    stats.get(e.getId()),
                    e.getOrganizers().stream().map(o -> new NamedRef(o.getId(), o.getFullName())).toList(),
                    e.getGates().stream().sorted(Comparator.comparing(Gate::getId)).map(g -> new NamedRef(g.getId(), g.getName())).toList(),
                    canManage, eligibility.window(e, now),
                    participant ? eligibility.check(viewer, e) : null, my, staff);
        }).toList();
    }

    public EventView one(Event e, User viewer, boolean detail) {
        return build(List.of(e), viewer, detail).get(0);
    }

    private List<GateStaff> gateStaff(Event e) {
        List<SecurityAssignment> list = assignments.findForEvents(List.of(e.getId()));
        Map<Long, Long> perGate = new HashMap<>();
        for (Object[] row : entries.countByEventsAndGates(List.of(e.getId()))) {
            perGate.put((Long) row[1], (Long) row[2]);
        }
        return e.getGates().stream().sorted(Comparator.comparing(Gate::getId)).map(g -> new GateStaff(g.getId(), g.getName(),
                list.stream().filter(a -> a.getGate().getId().equals(g.getId()))
                        .map(a -> new NamedRef(a.getUser().getId(), a.getUser().getFullName())).toList(),
                perGate.getOrDefault(g.getId(), 0L))).toList();
    }

    private static int rank(Pass p) {
        return switch (p.getStatus()) {
            case ACTIVE -> 3;
            case USED -> 2;
            case REVOKED -> 1;
            case EXPIRED -> 0;
        };
    }

    public static VenueRef venue(Venue v) {
        return new VenueRef(v.getId(), v.getName(), v.getBuilding(), v.getFloor(), v.getDescription(), v.getCapacity(),
                v.getLatitude(), v.getLongitude());
    }

    public static Eligibility eligibilityOf(Event e) {
        return new Eligibility(e.getEligibleDepartments().stream().sorted().toList(),
                e.getEligibleSemesters().stream().sorted().toList(), e.getEligibleSections().stream().sorted().toList());
    }

    public static Long millis(Instant i) {
        return i == null ? null : i.toEpochMilli();
    }
}
