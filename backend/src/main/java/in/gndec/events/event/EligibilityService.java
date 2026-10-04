package in.gndec.events.event;

import in.gndec.events.event.EventDtos.EligibilityCheck;
import in.gndec.events.event.EventDtos.Reason;
import in.gndec.events.event.EventDtos.RegistrationWindow;
import in.gndec.events.user.Role;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Server-side eligibility verification (requirement O2-12). It fails closed: anything missing or
 * unexpected means "not eligible" (the Minor project returned true when its rule parsing failed).
 * Each rule produces a reason so students see exactly why they can or can't join.
 */
@Service
public class EligibilityService {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", Locale.ENGLISH)
            .withZone(ZoneId.of("Asia/Kolkata"));

    public EligibilityCheck check(User u, Event e) {
        if (u == null || e == null) {
            return new EligibilityCheck(false, List.of());
        }
        if (u.getRole() == Role.GUEST) {
            boolean ok = e.isAllowOutsiders();
            return new EligibilityCheck(ok, List.of(new Reason(ok ? "Open to external participants" : "GNDEC students only", ok, null)));
        }
        if (u.getRole() != Role.STUDENT) {
            return new EligibilityCheck(false, List.of(new Reason("Only students register for events", false, null)));
        }
        StudentProfile p = u.getProfile();
        if (p == null) {
            return new EligibilityCheck(false, List.of(new Reason("Student record is missing", false, "Contact the admin")));
        }
        List<Reason> reasons = new ArrayList<>();
        reasons.add(new Reason("Account active", u.getStatus() == User.Status.ACTIVE, null));
        reasons.add(new Reason("Currently enrolled", p.isEnrolled(), p.isEnrolled() ? null : "Your enrollment is inactive"));
        reasons.add(rule("Department", "All departments", e.getEligibleDepartments(), p.getDepartmentCode(), p.getDepartmentCode()));
        reasons.add(rule("Semester", "All semesters", e.getEligibleSemesters(), p.getSemester(), "Sem " + p.getSemester()));
        if (!e.getEligibleSections().isEmpty()) {
            reasons.add(rule("Section", null, e.getEligibleSections(), p.getSection(), p.getSection()));
        }
        return new EligibilityCheck(reasons.stream().allMatch(Reason::ok), reasons);
    }

    private static <T extends Comparable<T>> Reason rule(String name, String anyLabel, Collection<T> allowed, T value, String you) {
        if (allowed.isEmpty()) {
            return new Reason(anyLabel, true, null);
        }
        boolean ok = allowed.contains(value);
        String list = allowed.stream().sorted().map(String::valueOf).collect(Collectors.joining(", "));
        return new Reason(name + ": " + list, ok, ok ? null : "You: " + you);
    }

    /** Used for the "≈ N students match" preview in the event wizard and for bulk pass assignment. */
    public static boolean matches(StudentProfile p, Collection<String> depts, Collection<Integer> sems, Collection<String> secs) {
        return p.isEnrolled()
                && (depts == null || depts.isEmpty() || depts.contains(p.getDepartmentCode()))
                && (sems == null || sems.isEmpty() || sems.contains(p.getSemester()))
                && (secs == null || secs.isEmpty() || secs.contains(p.getSection()));
    }

    public RegistrationWindow window(Event e, Instant now) {
        return switch (e.getStatus()) {
            case DRAFT -> new RegistrationWindow(false, "Not published yet");
            case CANCELLED -> new RegistrationWindow(false, "Event cancelled");
            case COMPLETED -> new RegistrationWindow(false, "Event has ended");
            case CLOSED -> new RegistrationWindow(false, "Registrations closed by the organizer");
            case PUBLISHED -> {
                if (now.isAfter(e.getEndsAt())) {
                    yield new RegistrationWindow(false, "Event has ended");
                }
                if (e.getMode() == Event.Mode.AUTO_ASSIGN) {
                    yield new RegistrationWindow(false, "Passes are issued by the organizer");
                }
                if (now.isBefore(e.getRegOpensAt())) {
                    yield new RegistrationWindow(false, "Registration opens " + WHEN.format(e.getRegOpensAt()));
                }
                if (now.isAfter(e.getRegClosesAt())) {
                    yield new RegistrationWindow(false, "Registration deadline has passed");
                }
                yield new RegistrationWindow(true, null);
            }
        };
    }

    public static String format(Instant i) {
        return WHEN.format(i);
    }
}
