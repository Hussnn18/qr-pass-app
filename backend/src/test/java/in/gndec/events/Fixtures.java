package in.gndec.events;

import in.gndec.events.auth.TokenService;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventRepository;
import in.gndec.events.scan.SecurityAssignment;
import in.gndec.events.scan.SecurityAssignmentRepository;
import in.gndec.events.user.Role;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.GateRepository;
import in.gndec.events.venue.Venue;
import in.gndec.events.venue.VenueRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Test data helpers. Tokens are minted directly so tests don't pay for BCrypt on every request. */
@Component
public class Fixtures {

    public static final String PASSWORD = "Test@1234";

    public final JdbcTemplate jdbc;
    public final UserRepository users;
    public final VenueRepository venues;
    public final GateRepository gates;
    public final EventRepository events;
    public final SecurityAssignmentRepository assignments;
    private final TokenService tokens;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;
    private String hash;

    public Fixtures(JdbcTemplate jdbc, UserRepository users, VenueRepository venues, GateRepository gates, EventRepository events,
            SecurityAssignmentRepository assignments, TokenService tokens, PasswordEncoder encoder, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.users = users;
        this.venues = venues;
        this.gates = gates;
        this.events = events;
        this.assignments = assignments;
        this.tokens = tokens;
        this.encoder = encoder;
        this.tx = tx;
    }

    public void wipe() {
        for (String t : List.of("scan_logs", "entries", "passes", "registrations", "security_assignments", "event_gates",
                "event_eligible_sections", "event_eligible_semesters", "event_eligible_departments", "event_organizers", "events",
                "gates", "venues", "refresh_tokens", "audit_logs", "student_profiles", "users")) {
            jdbc.update("delete from " + t);
        }
    }

    private String hash() {
        if (hash == null) {
            hash = encoder.encode(PASSWORD);
        }
        return hash;
    }

    public User student(String urn, String dept, int semester, String section) {
        User u = new User();
        u.setRole(Role.STUDENT);
        u.setFullName("Student " + urn);
        u.setEmail(urn + "@test.gndec");
        u.setPasswordHash(hash());
        StudentProfile p = new StudentProfile();
        p.setUrn(urn);
        p.setDepartmentCode(dept);
        p.setSemester(semester);
        p.setSection(section);
        u.attachProfile(p);
        return users.save(u);
    }

    public User staff(Role role, String email) {
        User u = new User();
        u.setRole(role);
        u.setFullName(role.name().charAt(0) + role.name().substring(1).toLowerCase() + " " + email.split("@")[0]);
        u.setEmail(email);
        u.setPasswordHash(hash());
        return users.save(u);
    }

    public Venue venue(String name, String... gateNames) {
        Venue v = new Venue();
        v.setName(name);
        v.setType(Venue.Type.AUDITORIUM);
        v.setCapacity(500);
        for (String g : gateNames) {
            v.addGate(g);
        }
        return venues.save(v);
    }

    public List<Gate> gatesOf(Venue v) {
        return tx.execute(s -> new ArrayList<>(venues.findById(v.getId()).orElseThrow().getGates()));
    }

    public String bearer(User u) {
        return "Bearer " + tokens.accessToken(u);
    }

    public void assign(Event e, Gate g, User u) {
        tx.executeWithoutResult(s -> assignments.save(new SecurityAssignment(events.findById(e.getId()).orElseThrow(),
                gates.findById(g.getId()).orElseThrow(), users.findById(u.getId()).orElseThrow())));
    }

    public EventBuilder event(User organizer, Venue venue) {
        return new EventBuilder(organizer, venue);
    }

    public class EventBuilder {
        private final User organizer;
        private final Venue venue;
        private String title = "Test Event";
        private Instant start = Instant.now().plus(Duration.ofDays(2));
        private Duration length = Duration.ofHours(3);
        private Instant regOpens = Instant.now().minus(Duration.ofDays(1));
        private Instant regCloses;
        private int capacity = 10;
        private Event.Mode mode = Event.Mode.OPEN;
        private Event.Status status = Event.Status.PUBLISHED;
        private Set<String> departments = Set.of();
        private Set<Integer> semesters = Set.of();

        EventBuilder(User organizer, Venue venue) {
            this.organizer = organizer;
            this.venue = venue;
        }

        public EventBuilder title(String t) { this.title = t; return this; }
        public EventBuilder startsIn(Duration d) { this.start = Instant.now().plus(d); return this; }
        public EventBuilder length(Duration d) { this.length = d; return this; }
        public EventBuilder capacity(int c) { this.capacity = c; return this; }
        public EventBuilder mode(Event.Mode m) { this.mode = m; return this; }
        public EventBuilder status(Event.Status s) { this.status = s; return this; }
        public EventBuilder departments(String... d) { this.departments = Set.of(d); return this; }
        public EventBuilder semesters(Integer... s) { this.semesters = Set.of(s); return this; }
        public EventBuilder regClosesAt(Instant i) { this.regCloses = i; return this; }

        public Event save() {
            return tx.execute(s -> {
                Event e = new Event();
                e.setTitle(title);
                e.setDescription("A test event description that is long enough.");
                e.setCategory(Event.Category.TECHNICAL);
                e.setVenue(venues.findById(venue.getId()).orElseThrow());
                e.setStartsAt(start);
                e.setEndsAt(start.plus(length));
                e.setRegOpensAt(regOpens);
                e.setRegClosesAt(regCloses != null ? regCloses : start.minus(Duration.ofMinutes(1)));
                e.setCapacity(capacity);
                e.setMode(mode);
                e.setStatus(status);
                e.setCreatedBy(organizer.getId());
                e.getOrganizers().add(users.findById(organizer.getId()).orElseThrow());
                e.getGates().addAll(venues.findById(venue.getId()).orElseThrow().getGates());
                e.getEligibleDepartments().addAll(departments);
                e.getEligibleSemesters().addAll(semesters);
                return events.save(e);
            });
        }
    }
}
