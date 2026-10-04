package in.gndec.events.seed;

import in.gndec.events.common.AuditService;
import in.gndec.events.event.EligibilityService;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventRepository;
import in.gndec.events.pass.Pass;
import in.gndec.events.pass.PassRepository;
import in.gndec.events.pass.PassService;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.scan.ScanLog;
import in.gndec.events.scan.ScanLogRepository;
import in.gndec.events.scan.ScanResult;
import in.gndec.events.scan.SecurityAssignment;
import in.gndec.events.scan.SecurityAssignmentRepository;
import in.gndec.events.user.Role;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.Venue;
import in.gndec.events.venue.VenueRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo data for the dev and h2 profiles, created once when the users table is empty.
 * Every demo account's password is "demo". Dates are generated around the current time so that
 * one event is always "happening now" on the day you start the server.
 */
@Component
@ConditionalOnProperty(name = "app.seed.enabled", havingValue = "true")
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static final String[] FEMALE = {"Gurleen", "Jaspreet", "Navjot", "Tanvi", "Ishita", "Riya", "Pooja", "Mehak", "Ekam", "Muskan", "Parul", "Sukhman", "Vanshika", "Amrit", "Bhavya", "Damanpreet", "Inderjeet", "Kirandeep", "Mansi", "Nimrat", "Rupinder", "Urvashi", "Harleen", "Sanya", "Prabhleen", "Avneet", "Khushi", "Jasleen", "Aditi", "Manmeet"};
    private static final String[] MALE = {"Arshdeep", "Harman", "Karan", "Manpreet", "Prabhjot", "Rajveer", "Sahil", "Kunal", "Aditya", "Rohit", "Ankit", "Diljot", "Lovepreet", "Nikhil", "Tarun", "Yuvraj", "Chetan", "Gagandeep", "Hardik", "Jatin", "Lakshay", "Omkar", "Pranav", "Shubham", "Taranjot", "Gurkirat", "Ishaan", "Jaskaran", "Mohit", "Varun"};
    private static final String[] SURNAMES = {"Sharma", "Verma", "Gupta", "Arora", "Bansal", "Malhotra", "Mehta", "Goyal", "Sood", "Jindal", "Garg", "Sethi", "Bedi", "Kapoor", "Jain", "Mittal", "Bhatia", "Grewal", "Sandhu", "Dhillon", "Sidhu", "Gill", "Brar", "Chawla"};
    private static final String[][] DEPT_PLAN = {{"CSE", "30"}, {"IT", "20"}, {"ECE", "20"}, {"EE", "16"}, {"ME", "16"}, {"CE", "12"}, {"PE", "6"}};
    private static final Map<String, String> DEPT_NUM = Map.of("CE", "01", "CSE", "02", "EE", "03", "ECE", "04", "ME", "05", "PE", "06", "IT", "15");
    private static final String[] IDEAS = {"Idea: QR-based lab equipment issue tracker", "Idea: Crowd-sourced campus lost & found",
            "Idea: Smart energy dashboard for hostels", "Idea: Bus-route live tracker for day scholars",
            "Idea: Accessible campus navigation for wheelchair users", "Idea: AI timetable clash detector",
            "Idea: Canteen pre-order and pickup slots", "Idea: Peer tutoring matchmaking app"};

    private final UserRepository users;
    private final VenueRepository venues;
    private final EventRepository events;
    private final RegistrationRepository registrations;
    private final PassRepository passes;
    private final PassService passService;
    private final EntryRepository entries;
    private final ScanLogRepository scanLogs;
    private final SecurityAssignmentRepository assignments;
    private final EligibilityService eligibility;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final TransactionTemplate tx;

    private final Random rand = new Random(20261002);
    private Instant now;

    public DevDataSeeder(UserRepository users, VenueRepository venues, EventRepository events, RegistrationRepository registrations,
            PassRepository passes, PassService passService, EntryRepository entries, ScanLogRepository scanLogs,
            SecurityAssignmentRepository assignments, EligibilityService eligibility, PasswordEncoder encoder,
            AuditService audit, TransactionTemplate tx) {
        this.users = users;
        this.venues = venues;
        this.events = events;
        this.registrations = registrations;
        this.passes = passes;
        this.passService = passService;
        this.entries = entries;
        this.scanLogs = scanLogs;
        this.assignments = assignments;
        this.eligibility = eligibility;
        this.encoder = encoder;
        this.audit = audit;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (users.count() > 0) {
            return;
        }
        long t0 = System.currentTimeMillis();
        tx.executeWithoutResult(s -> seed());
        log.info("Demo data created in {} ms. Sign in with URN 2302511 (or admin@gndec.demo) and password 'demo'.",
                System.currentTimeMillis() - t0);
    }

    private Instant at(int dayOffset, int hour, int minute) {
        return LocalDate.now(IST).plusDays(dayOffset).atTime(hour, minute).atZone(IST).toInstant();
    }

    private <T> T pick(T[] arr) {
        return arr[rand.nextInt(arr.length)];
    }

    private void seed() {
        now = Instant.now();
        ZonedDateTime today = now.atZone(IST);
        boolean oddSem = today.getMonthValue() >= 7;
        int ayStart = oddSem ? today.getYear() : today.getYear() - 1;
        int[] batches = {ayStart - 3, ayStart - 2, ayStart - 1, ayStart};
        String hash = encoder.encode("demo");

        // ---------------------------------------------------------------- staff
        User admin = staff(Role.ADMIN, "Portal Administrator", "admin@gndec.demo", "Student Welfare Office", hash);
        User org1 = staff(Role.ORGANIZER, "Prof. Harjit Kaur", "harjit.kaur@gndec.demo", "CSE Department", hash);
        User org2 = staff(Role.ORGANIZER, "Mr. Rajinder Singh", "rajinder.singh@gndec.demo", "Cultural & Sports Committee", hash);
        User org3 = staff(Role.ORGANIZER, "Dr. Navneet Sharma", "navneet.sharma@gndec.demo", "ECE · Robotics Club", hash);
        User sec1 = staff(Role.SECURITY, "Gurmeet Singh", "gurmeet.security@gndec.demo", "Campus Security", hash);
        User sec2 = staff(Role.SECURITY, "Balwinder Kumar", "balwinder.security@gndec.demo", "Campus Security", hash);
        User sec3 = staff(Role.SECURITY, "Sukhdev Singh", "sukhdev.security@gndec.demo", "Campus Security", hash);

        // ---------------------------------------------------------------- students
        List<User> students = new ArrayList<>();
        int sem7Batch = ayStart - 3;
        int sem3Batch = ayStart - 1;
        User simran = student("Simran Kaur", yy(sem7Batch) + "02511", "simran.kaur@gndec.demo", "CSE", semFor(sem7Batch, ayStart, oddSem), "A", sem7Batch, hash);
        User arjun = student("Arjun Mehta", yy(sem3Batch) + "05318", "arjun.mehta@gndec.demo", "ME", semFor(sem3Batch, ayStart, oddSem), "B", sem3Batch, hash);
        arjun.setMustChangePassword(true);
        students.add(simran);
        students.add(arjun);
        Set<String> names = new HashSet<>(List.of("Simran Kaur", "Arjun Mehta"));
        int n = 0;
        for (String[] plan : DEPT_PLAN) {
            String dept = plan[0];
            for (int i = 0; i < Integer.parseInt(plan[1]); i++) {
                int batch = batches[i % 4];
                boolean female = rand.nextDouble() < 0.45;
                String name;
                do {
                    String first = pick(female ? FEMALE : MALE);
                    String sur = rand.nextDouble() < 0.45 ? (female ? "Kaur" : "Singh") : pick(SURNAMES);
                    name = first + " " + sur;
                } while (!names.add(name));
                String urn = yy(batch) + DEPT_NUM.get(dept) + String.format("%03d", 100 + n * 3 + rand.nextInt(3));
                n++;
                students.add(student(name, urn, name.split(" ")[0].toLowerCase() + "." + urn + "@gndec.demo", dept,
                        semFor(batch, ayStart, oddSem), new String[] {"A", "B", "C"}[i % 3], batch, hash));
            }
        }
        users.saveAll(students);
        // One suspended student, to demonstrate the "account inactive" scan result.
        students.stream().filter(u -> u.getProfile().getDepartmentCode().equals("CE") && u.getProfile().getSemester() == yr(4, oddSem))
                .findFirst().ifPresent(u -> u.getProfile().setEnrolled(false));

        // ---------------------------------------------------------------- campus (coordinates from OpenStreetMap)
        venue("Main Gate (Gill Road)", Venue.Type.OTHER, "Security check post", "—", 30.86072, 75.8595, "Main entrance with the security check post and visitor desk.", false, null);
        venue("Admin Block", Venue.Type.ADMIN, "Admin Block", "G–2", 30.85884, 75.86033, "Principal's office, accounts and the Student Welfare office.", false, null);
        Venue lib = venue("Central Library", Venue.Type.LIBRARY, "Library Building", "G–1", 30.85832, 75.86034, "Reading halls, e-library and digital resource centre.", true, 60, "Library Foyer");
        Venue audi = venue("Main Auditorium", Venue.Type.AUDITORIUM, "Auditorium", "G", 30.85888, 75.86074, "Auditorium with stage, projection and sound system.", true, 650, "Gate A (Front)", "Gate B (Side)");
        Venue cse = venue("CSE Department", Venue.Type.ACADEMIC, "Dept. of Computer Sc. & Engg.", "G–3", 30.85989, 75.86009, "Department of Computer Science & Engineering — classrooms and labs.", true, 120, "Ground Floor Entrance");
        Venue sem = venue("Seminar Hall (CSE Dept.)", Venue.Type.SEMINAR_HALL, "Dept. of Computer Sc. & Engg.", "1st floor", 30.86008, 75.86024, "Seminar hall with 150 seats, projector and podium.", true, 150, "Main Door");
        Venue it = venue("IT Department", Venue.Type.ACADEMIC, "Dept. of Information Technology", "G–2", 30.86041, 75.86029, "Department of Information Technology.", true, 100, "Main Entrance");
        Venue ece = venue("ECE Department", Venue.Type.LAB, "Electronics & Communication Engg.", "G–2", 30.8581, 75.8612, "ECE department with robotics and embedded systems labs.", true, 60, "Lab Entrance");
        venue("Applied Science Block", Venue.Type.ACADEMIC, "Dept. of Applied Science", "G–2", 30.85869, 75.8617, "Physics, chemistry and English labs.", true, 80, "Main Entrance");
        venue("Central Workshop", Venue.Type.LAB, "Workshop", "G", 30.85898, 75.86201, "Machine shop, welding and fitting sections.", true, 40, "Workshop Gate");
        Venue oat = venue("Open Air Theatre", Venue.Type.AUDITORIUM, "OAT", "—", 30.8607, 75.86214, "Open-air stage for cultural evenings and fests.", true, 1200, "Gate 1", "Gate 2");
        Venue ground = venue("Running / Cricket Ground", Venue.Type.SPORTS, "Athletics ground", "—", 30.85889, 75.86359, "Running track and cricket ground.", true, 3000, "North Gate", "South Gate");
        Venue complex = venue("Sports Complex", Venue.Type.SPORTS, "Sports Complex", "G", 30.85817, 75.86348, "Indoor courts and sports office.", true, 300, "Main Door");
        venue("Football Ground", Venue.Type.SPORTS, "Football ground", "—", 30.8606, 75.86155, "Main football ground.", true, 1500, "Pavilion Gate");
        venue("Day Scholar Canteen", Venue.Type.CAFETERIA, "Canteen", "G", 30.8611, 75.86271, "Main canteen for day scholars.", false, null);
        venue("College Dispensary", Venue.Type.OTHER, "Dispensary", "G", 30.86146, 75.86115, "First aid and the campus doctor.", false, null);
        venue("Main Parking", Venue.Type.PARKING, "GNE Boys Parking", "—", 30.85989, 75.85983, "Parking for students and visitors, next to the main gate.", false, null);
        venue("Testing & Consultancy Cell", Venue.Type.ADMIN, "TCC", "G", 30.85815, 75.86035, "Industry consultancy and testing office; meeting room.", true, 40, "Reception");
        venues.flush();

        // ---------------------------------------------------------------- events
        int year = today.getYear();
        Instant t = now.minus(Duration.ofMinutes(30));
        Instant liveStart = Instant.ofEpochMilli(t.toEpochMilli() - t.toEpochMilli() % Duration.ofMinutes(15).toMillis());

        Event e1 = event("AI in Industry — Guest Lecture", Event.Category.TECHNICAL, audi, liveStart, liveStart.plus(Duration.ofHours(3)),
                liveStart.minus(Duration.ofDays(10)), liveStart, 300, Event.Mode.OPEN, true, Event.Status.PUBLISHED, org1,
                "An industry expert session on how AI is used in manufacturing, healthcare and finance, followed by an open Q&A.\n\n"
                        + "Open to 3rd and 4th year students. Keep your digital pass ready at the auditorium gates.",
                Set.of(), Set.of(yr(3, oddSem), yr(4, oddSem)), audi.getGates());
        Event e2 = event("Robotics Workshop — Build a Line Follower", Event.Category.WORKSHOP, ece, at(5, 10, 0), at(5, 16, 0),
                now.minus(Duration.ofDays(6)), at(4, 18, 0), 30, Event.Mode.OPEN, false, Event.Status.PUBLISHED, org3,
                "Hands-on workshop by the Robotics Club. Teams of two build and program a line-following robot.\n\nKits are provided. Bring a laptop with the Arduino IDE installed.",
                Set.of("ECE", "EE", "ME"), Set.of(yr(2, oddSem), yr(3, oddSem), yr(4, oddSem)), ece.getGates());
        Event e3 = event("CodeSprint Hackathon " + year, Event.Category.TECHNICAL, cse, at(12, 9, 0), at(13, 17, 0),
                now.minus(Duration.ofDays(3)), at(8, 23, 59), 120, Event.Mode.APPROVAL, false, Event.Status.PUBLISHED, org1,
                "A 32-hour hackathon on real campus problems: attendance, energy, safety and accessibility. Teams of 2–4.\n\n"
                        + "Selection is based on the idea summary you submit with your request. Meals and overnight lab access are provided.",
                Set.of("CSE", "IT"), Set.of(yr(3, oddSem), yr(4, oddSem)), cse.getGates());
        Event e4 = event("Annual Athletics Meet " + year, Event.Category.SPORTS, ground, at(20, 8, 0), at(20, 17, 0),
                now.minus(Duration.ofDays(2)), at(20, 8, 0), 2000, Event.Mode.AUTO_ASSIGN, false, Event.Status.PUBLISHED, org2,
                "Track and field events, the inter-department relay and tug of war.\n\nEvery enrolled student receives a spectator pass automatically.",
                Set.of(), Set.of(), ground.getGates());
        Event e5 = event("Resume Building & Placement Talk", Event.Category.ACADEMIC, sem, at(-7, 11, 0), at(-7, 13, 0),
                at(-17, 10, 0), at(-8, 18, 0), 80, Event.Mode.OPEN, false, Event.Status.COMPLETED, org1,
                "The Training & Placement Cell explains what recruiters look for and reviews sample resumes live.",
                Set.of(), Set.of(yr(3, oddSem), yr(4, oddSem)), sem.getGates());
        Event e6 = event("Inter-College Debate: Technology & Society", Event.Category.CULTURAL, audi, at(9, 14, 0), at(9, 17, 0),
                now.minus(Duration.ofDays(4)), at(7, 18, 0), 150, Event.Mode.APPROVAL, true, Event.Status.PUBLISHED, org2,
                "Teams debate the motion \"Technology does more to divide society than unite it\".\n\nSpeakers are shortlisted by the organizing committee; audience requests are approved in order.",
                Set.of(), Set.of(), List.of(audi.getGates().get(0)));
        Event e7 = event("Blood Donation Camp", Event.Category.SOCIAL, complex, at(3, 9, 0), at(3, 15, 0),
                now.minus(Duration.ofDays(8)), at(2, 18, 0), 200, Event.Mode.OPEN, false, Event.Status.CANCELLED, org2,
                "Voluntary blood donation camp with the district blood bank. Donors receive a certificate and refreshments.",
                Set.of(), Set.of(), complex.getGates());
        e7.setCancelReason("Postponed — the blood bank team is unavailable. A new date will be announced.");
        event("Campus Photography Walk", Event.Category.CULTURAL, lib, at(25, 7, 0), at(25, 10, 0),
                at(10, 10, 0), at(23, 18, 0), 40, Event.Mode.APPROVAL, false, Event.Status.DRAFT, org2,
                "An early-morning photo walk around campus with the Photography Club. Bring your own camera or phone.",
                Set.of(), Set.of(), List.of());
        Event e9 = event("Rang Punjab Da — Cultural Night", Event.Category.CULTURAL, oat, at(15, 18, 0), at(15, 22, 0),
                now.minus(Duration.ofDays(5)), at(14, 20, 0), 600, Event.Mode.OPEN, true, Event.Status.PUBLISHED, org2,
                "Bhangra, giddha, folk music and a food court run by student clubs.",
                Set.of(), Set.of(), oat.getGates());
        Event e10 = event("Brainwave Tech Quiz", Event.Category.TECHNICAL, it, at(-14, 14, 0), at(-14, 16, 0),
                at(-24, 10, 0), at(-15, 20, 0), 100, Event.Mode.OPEN, false, Event.Status.COMPLETED, org1,
                "Three rounds of rapid-fire questions on computing, electronics and current tech.",
                Set.of("CSE", "IT", "ECE"), Set.of(), it.getGates());
        events.flush();

        // ---------------------------------------------------------------- security duty
        assign(e1, audi.getGates().get(0), sec1);
        assign(e1, audi.getGates().get(1), sec2);
        assign(e2, ece.getGates().get(0), sec3);
        assign(e3, cse.getGates().get(0), sec1);
        assign(e4, ground.getGates().get(0), sec1);
        assign(e4, ground.getGates().get(1), sec3);
        assign(e5, sem.getGates().get(0), sec2);
        assign(e6, audi.getGates().get(0), sec2);
        assign(e9, oat.getGates().get(0), sec1);
        assign(e9, oat.getGates().get(1), sec3);
        assign(e10, it.getGates().get(0), sec3);

        // ---------------------------------------------------------------- registrations, passes, entries
        // e1 — happening now: about 60 confirmed, 27 already inside.
        List<User> pool = shuffled(eligible(students, e1), simran);
        confirmed(e1, simran, e1.getRegOpensAt().plus(Duration.ofHours(2)));
        List<Registration> e1Regs = new ArrayList<>();
        for (int i = 0; i < pool.size() - 4; i++) {
            e1Regs.add(confirmed(e1, pool.get(i), null));
        }
        cancelled(e1, pool.get(pool.size() - 1), "Cancelled by participant");
        Instant firstIn = e1.getStartsAt().minus(Duration.ofMinutes(25));
        long span = Math.max(Duration.between(firstIn, now.minus(Duration.ofMinutes(2))).toMillis(), Duration.ofMinutes(10).toMillis());
        for (int i = 0; i < 27 && i < e1Regs.size(); i++) {
            Gate g = audi.getGates().get(i % 3 == 0 ? 1 : 0);
            enter(e1Regs.get(i), g, firstIn.plusMillis(span * (i + 1) / 28), i % 3 == 0 ? sec2 : sec1);
        }
        failedScan(e1, audi.getGates().get(0), sec1, ScanResult.INVALID_TOKEN, now.minus(Duration.ofMinutes(14)));
        failedScan(e1, audi.getGates().get(1), sec2, ScanResult.INVALID_FORMAT, now.minus(Duration.ofMinutes(6)));

        // e2 — full with a waitlist (Arjun is eligible but not registered, so he can join the waitlist).
        pool = shuffled(eligible(students, e2), arjun);
        for (int i = 0; i < Math.min(30, pool.size()); i++) {
            confirmed(e2, pool.get(i), null);
        }
        for (int i = 30; i < Math.min(34, pool.size()); i++) {
            Registration r = registration(e2, pool.get(i), Registration.Status.WAITLISTED, now.minus(Duration.ofHours(20 - i + 30)));
            registrations.save(r);
        }

        // e3 — approval-based hackathon with pending requests (Simran hasn't asked yet).
        pool = shuffled(eligible(students, e3), simran);
        for (int i = 0; i < Math.min(pool.size(), 22); i++) {
            User u = pool.get(i);
            if (i < 11) {
                Registration r = confirmed(e3, u, null);
                r.setNote(pick(IDEAS));
                r.setDecidedBy(org1.getId());
            } else if (i < 13) {
                Registration r = registration(e3, u, Registration.Status.REJECTED, null);
                r.setNote(pick(IDEAS));
                r.setReason(i == 11 ? "Team size above the limit of 4" : "Idea summary missing");
                r.setDecidedAt(r.getRegisteredAt().plus(Duration.ofHours(5)));
                r.setDecidedBy(org1.getId());
                registrations.save(r);
            } else {
                Registration r = registration(e3, u, Registration.Status.PENDING, null);
                r.setNote(pick(IDEAS));
                registrations.save(r);
            }
        }

        // e4 — auto-assigned passes for every enrolled student.
        for (User u : students) {
            if (u.getProfile().isEnrolled()) {
                Registration r = confirmed(e4, u, now.minus(Duration.ofDays(2)));
                r.setDecidedBy(org2.getId());
            }
        }

        // e5 — completed, with attendance.
        pool = shuffled(eligible(students, e5), simran);
        List<Registration> e5Regs = new ArrayList<>();
        e5Regs.add(confirmed(e5, simran, null));
        for (int i = 0; i < Math.min(44, pool.size()); i++) {
            e5Regs.add(confirmed(e5, pool.get(i), null));
        }
        for (int i = 44; i < Math.min(48, pool.size()); i++) {
            cancelled(e5, pool.get(i), "Cancelled by participant");
        }
        Instant e5In = e5.getStartsAt().minus(Duration.ofMinutes(25));
        for (int i = 0; i < Math.min(35, e5Regs.size()); i++) {
            enter(e5Regs.get(i), sem.getGates().get(0), e5In.plusSeconds(i * 70L + rand.nextInt(40)), sec2);
        }

        // e6 — debate (approval): confirmed, pending and one rejected.
        pool = shuffled(students.stream().filter(u -> u.getProfile().isEnrolled()).toList(), simran);
        for (int i = 0; i < 14; i++) {
            confirmed(e6, pool.get(i), null).setDecidedBy(org2.getId());
        }
        for (int i = 14; i < 21; i++) {
            Registration r = registration(e6, pool.get(i), Registration.Status.PENDING, null);
            r.setNote("Audience seat");
            registrations.save(r);
        }
        Registration rej = registration(e6, pool.get(21), Registration.Status.REJECTED, null);
        rej.setReason("Duplicate request");
        rej.setDecidedAt(now.minus(Duration.ofHours(3)));
        rej.setDecidedBy(org2.getId());
        registrations.save(rej);

        // e7 — cancelled: everyone's registration cancelled and passes revoked.
        cancelled(e7, simran, "Event cancelled: " + e7.getCancelReason());
        for (User u : shuffled(students, simran).subList(0, 17)) {
            cancelled(e7, u, "Event cancelled: " + e7.getCancelReason());
        }

        // e9 — upcoming cultural night.
        confirmed(e9, simran, null);
        for (User u : shuffled(students.stream().filter(x -> x.getProfile().isEnrolled()).toList(), simran).subList(0, 69)) {
            confirmed(e9, u, null);
        }

        // e10 — completed quiz.
        List<Registration> e10Regs = new ArrayList<>();
        for (User u : shuffled(eligible(students, e10), null).subList(0, 40)) {
            e10Regs.add(confirmed(e10, u, null));
        }
        for (int i = 0; i < 31; i++) {
            enter(e10Regs.get(i), it.getGates().get(0), e10.getStartsAt().minus(Duration.ofMinutes(30)).plusSeconds(i * 55L), sec3);
        }

        registrations.flush();
        passes.expireForEvent(e5.getId());
        passes.expireForEvent(e10.getId());
        events.recountSeats();

        audit.logAs(admin.getId(), "STUDENT_IMPORT", "User", null, "Imported " + (students.size() - 2) + " students from students_batch.csv (0 skipped)");
        audit.logAs(org1.getId(), "EVENT_PUBLISHED", "Event", e1.getId(), e1.getTitle());
        audit.logAs(org1.getId(), "EVENT_PUBLISHED", "Event", e3.getId(), e3.getTitle());
        audit.logAs(org2.getId(), "PASSES_BULK_ASSIGNED", "Event", e4.getId(), "Passes issued to every enrolled student");
        audit.logAs(org2.getId(), "EVENT_CANCELLED", "Event", e7.getId(), e7.getCancelReason());
    }

    // ------------------------------------------------------------------ builders

    private static String yy(int batch) {
        return String.valueOf(batch).substring(2);
    }

    private static int semFor(int batch, int ayStart, boolean oddSem) {
        return (ayStart - batch) * 2 + (oddSem ? 1 : 2);
    }

    private static int yr(int yearOfStudy, boolean oddSem) {
        return oddSem ? 2 * yearOfStudy - 1 : 2 * yearOfStudy;
    }

    private User staff(Role role, String name, String email, String unit, String hash) {
        User u = new User();
        u.setRole(role);
        u.setFullName(name);
        u.setEmail(email);
        u.setUnit(unit);
        u.setPhone("+91 99999 " + (10000 + rand.nextInt(89999)));
        u.setPasswordHash(hash);
        return users.save(u);
    }

    private User student(String name, String urn, String email, String dept, int semester, String section, int batch, String hash) {
        User u = new User();
        u.setRole(Role.STUDENT);
        u.setFullName(name);
        u.setEmail(email);
        u.setPhone("+91 99999 " + (10000 + rand.nextInt(89999)));
        u.setPasswordHash(hash);
        StudentProfile p = new StudentProfile();
        p.setUrn(urn);
        p.setDepartmentCode(dept);
        p.setSemester(semester);
        p.setSection(section);
        p.setBatch(batch);
        p.setDob(LocalDate.of(batch - 18, 1 + rand.nextInt(12), 1 + rand.nextInt(27)));
        u.attachProfile(p);
        return u;
    }

    private Venue venue(String name, Venue.Type type, String building, String floor, double lat, double lng, String description,
            boolean canHost, Integer capacity, String... gateNames) {
        Venue v = new Venue();
        v.setName(name);
        v.setType(type);
        v.setBuilding(building);
        v.setFloor(floor);
        v.setLatitude(lat);
        v.setLongitude(lng);
        v.setDescription(description);
        v.setCanHostEvents(canHost);
        v.setCapacity(capacity);
        for (String g : gateNames) {
            v.addGate(g);
        }
        return venues.save(v);
    }

    private Event event(String title, Event.Category category, Venue venue, Instant start, Instant end, Instant regOpens,
            Instant regCloses, int capacity, Event.Mode mode, boolean outsiders, Event.Status status, User organizer,
            String description, Set<String> depts, Set<Integer> sems, List<Gate> gates) {
        Event e = new Event();
        e.setTitle(title);
        e.setCategory(category);
        e.setVenue(venue);
        e.setStartsAt(start);
        e.setEndsAt(end);
        e.setRegOpensAt(regOpens);
        e.setRegClosesAt(regCloses);
        e.setCapacity(capacity);
        e.setMode(mode);
        e.setAllowOutsiders(outsiders);
        e.setStatus(status);
        e.setCreatedBy(organizer.getId());
        e.setDescription(description);
        e.getOrganizers().add(organizer);
        e.getEligibleDepartments().addAll(depts);
        e.getEligibleSemesters().addAll(sems);
        e.getGates().addAll(new LinkedHashSet<>(gates));
        e.backdate(regOpens.minus(Duration.ofDays(2)));
        return events.save(e);
    }

    private void assign(Event e, Gate g, User u) {
        assignments.save(new SecurityAssignment(e, g, u));
    }

    private List<User> eligible(List<User> students, Event e) {
        return students.stream().filter(u -> eligibility.check(u, e).eligible()).toList();
    }

    private List<User> shuffled(List<User> list, User exclude) {
        List<User> copy = new ArrayList<>(list.stream().filter(u -> u != exclude).toList());
        Collections.shuffle(copy, rand);
        return copy;
    }

    private Registration registration(Event e, User u, Registration.Status status, Instant at) {
        Registration r = new Registration();
        r.setEvent(e);
        r.setUser(u);
        r.setStatus(status);
        Instant upper = now.isBefore(e.getRegClosesAt()) ? now : e.getRegClosesAt();
        long range = Math.max(Duration.between(e.getRegOpensAt(), upper).toMillis(), 60_000);
        r.setRegisteredAt(at != null ? at : e.getRegOpensAt().plusMillis((long) (rand.nextDouble() * range)));
        return r;
    }

    private Registration confirmed(Event e, User u, Instant at) {
        Registration r = registration(e, u, Registration.Status.CONFIRMED, at);
        r.setDecidedAt(r.getRegisteredAt().plus(Duration.ofMinutes(e.getMode() == Event.Mode.APPROVAL ? 300 : 0)));
        if (r.getDecidedAt().isAfter(now)) {
            r.setDecidedAt(now.minus(Duration.ofMinutes(1)));
        }
        registrations.save(r);
        Pass p = passService.issue(r);
        p.setIssuedAt(r.getDecidedAt());
        return r;
    }

    private void cancelled(Event e, User u, String reason) {
        Registration r = confirmed(e, u, null);
        r.setStatus(Registration.Status.CANCELLED);
        r.setReason(reason);
        r.setDecidedAt(now.minus(Duration.ofDays(1)));
        registrations.flush();
        passes.revokeActiveForRegistration(r.getId(), r.getDecidedAt(), reason);
    }

    private void enter(Registration r, Gate g, Instant at, User by) {
        Pass p = passes.findByRegistrationIdAndStatus(r.getId(), Pass.Status.ACTIVE).stream().findFirst().orElse(null);
        if (p == null) {
            return;
        }
        p.setStatus(Pass.Status.USED);
        p.setUsedAt(at);
        Entry en = new Entry();
        en.setRegistrationId(r.getId());
        en.setPassId(p.getId());
        en.setEventId(r.getEvent().getId());
        en.setGateId(g.getId());
        en.setScannedBy(by.getId());
        en.setMethod(Entry.Method.QR);
        en.setEnteredAt(at);
        entries.save(en);
        ScanLog l = new ScanLog();
        l.setEventId(r.getEvent().getId());
        l.setGateId(g.getId());
        l.setPassId(p.getId());
        l.setParticipantId(r.getUser().getId());
        l.setScannedBy(by.getId());
        l.setResult(ScanResult.SUCCESS);
        l.setMethod(Entry.Method.QR);
        l.setDeviceId("seed");
        l.setScannedAt(at);
        scanLogs.save(l);
    }

    private void failedScan(Event e, Gate g, User by, ScanResult result, Instant at) {
        ScanLog l = new ScanLog();
        l.setEventId(e.getId());
        l.setGateId(g.getId());
        l.setScannedBy(by.getId());
        l.setResult(result);
        l.setMethod(Entry.Method.QR);
        l.setDeviceId("seed");
        l.setScannedAt(at);
        scanLogs.save(l);
    }
}
