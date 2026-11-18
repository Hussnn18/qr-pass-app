package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.Venue;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Objective 4: attendance from gate entries, manual corrections with a reason, and the live feed. */
class AttendanceTests extends IntegrationTest {

    User org;
    User guard;
    Venue hall;
    Gate gateA;
    Gate gateB;
    Event live;
    String base;

    @BeforeEach
    void setUp() {
        org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        guard = fx.staff(Role.SECURITY, "guard@test.gndec");
        hall = fx.venue("Main Auditorium", "Gate A", "Gate B");
        List<Gate> gates = fx.gatesOf(hall);
        gateA = gates.get(0);
        gateB = gates.get(1);
        // Gates are open (start in 30 minutes) and registration is still open.
        live = fx.event(org, hall).title("Live Lecture").startsIn(Duration.ofMinutes(30))
                .regClosesAt(Instant.now().plus(Duration.ofMinutes(25))).capacity(50).save();
        fx.assign(live, gateA, guard);
        base = "/api/v1/manage/events/" + live.getId();
    }

    private String register(User s) throws Exception {
        post_("/api/v1/events/" + live.getId() + "/registrations", s, "{}").andExpect(status().isOk());
        List<Map<String, Object>> passes = read(get_("/api/v1/me/passes", s).andReturn(), "$");
        return passes.stream().filter(p -> ((Map<?, ?>) p.get("event")).get("id").equals(live.getId().intValue()))
                .map(p -> (String) p.get("qr")).findFirst().orElseThrow();
    }

    private String scan(String qr) throws Exception {
        MvcResult r = post_("/api/v1/scan/verify", guard,
                "{\"eventId\":" + live.getId() + ",\"gateId\":" + gateA.getId() + ",\"qr\":\"" + qr + "\"}").andReturn();
        return read(r, "$.result");
    }

    private Long registrationId(User s) {
        return fx.jdbc.queryForObject("select id from registrations where user_id = ?", Long.class, s.getId());
    }

    @Test
    void attendanceIsBuiltFromGateEntries() throws Exception {
        User a = fx.student("2302601", "CSE", 7, "A");
        User b = fx.student("2402602", "CSE", 5, "B");
        User c = fx.student("2315603", "IT", 7, "A");
        scan(register(a));
        scan(register(b));
        register(c);

        MvcResult r = get_(base + "/attendance", org).andExpect(status().isOk())
                .andExpect(jsonPath("$.phase").value("OPEN"))
                .andExpect(jsonPath("$.confirmed").value(3))
                .andExpect(jsonPath("$.attended").value(2))
                .andExpect(jsonPath("$.absent").value(1))
                .andExpect(jsonPath("$.attendanceRate").value(67))
                .andExpect(jsonPath("$.byMethod.QR").value(2))
                .andExpect(jsonPath("$.gates[0].gateName").value("Gate A"))
                .andExpect(jsonPath("$.gates[0].entries").value(2))
                .andExpect(jsonPath("$.gates[0].staff[0]").value(guard.getFullName()))
                .andExpect(jsonPath("$.gates[1].entries").value(0))
                .andExpect(jsonPath("$.bucketMinutes").value(15))
                .andExpect(jsonPath("$.recent[0].result").value("SUCCESS"))
                .andReturn();
        List<Map<String, Object>> depts = read(r, "$.departments");
        assertThat(depts).extracting(d -> d.get("key") + ":" + d.get("confirmed") + "/" + d.get("attended")).containsExactly("CSE:2/2", "IT:1/0");
        List<Map<String, Object>> sems = read(r, "$.semesters");
        assertThat(sems).extracting(d -> d.get("key") + ":" + d.get("confirmed") + "/" + d.get("attended")).containsExactly("5:1/1", "7:2/1");
        List<Integer> cumulative = read(r, "$.timeline[*].cumulative");
        assertThat(cumulative).isNotEmpty();
        assertThat(cumulative.get(cumulative.size() - 1)).isEqualTo(2);

        get_(base + "/attendance/list?filter=PRESENT", org).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].method").value("QR"))
                .andExpect(jsonPath("$.items[0].gateName").value("Gate A"))
                .andExpect(jsonPath("$.items[0].recordedBy").value(guard.getFullName()));
        get_(base + "/attendance/list?filter=ABSENT", org).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].person.idLabel").value("2315603"));
        get_(base + "/attendance/list?filter=ALL&dept=CSE&q=2402", org).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void organizersCorrectAttendanceByHandWithAReason() throws Exception {
        User s = fx.student("2302611", "CSE", 7, "A");
        String qr = register(s);
        Long reg = registrationId(s);

        post_(base + "/attendance", org, "{\"registrationId\":" + reg + ",\"reason\":\" \"}").andExpect(status().isBadRequest());
        post_(base + "/attendance", org, "{\"registrationId\":" + reg + ",\"gateId\":" + gateB.getId() + ",\"reason\":\"Phone battery dead, ID card checked\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.present").value(true))
                .andExpect(jsonPath("$.method").value("OVERRIDE"))
                .andExpect(jsonPath("$.gateName").value("Gate B"));
        post_(base + "/attendance", org, "{\"registrationId\":" + reg + ",\"reason\":\"again\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PRESENT"));
        // The pass was used up, so it can't also get someone in at a gate.
        assertThat(scan(qr)).isEqualTo("ALREADY_USED");
        assertThat(fx.jdbc.queryForObject("select override_reason from entries", String.class)).isEqualTo("Phone battery dead, ID card checked");

        post_(base + "/attendance/" + reg + "/remove", org, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        post_(base + "/attendance/" + reg + "/remove", org, "{\"reason\":\"Marked the wrong student\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.present").value(false));
        assertThat(fx.jdbc.queryForObject("select count(*) from entries", Integer.class)).isZero();
        // The pass works again while the event is running.
        assertThat(scan(qr)).isEqualTo("SUCCESS");

        assertThat(fx.jdbc.queryForObject("select count(*) from audit_logs where action in ('ATTENDANCE_MARKED_PRESENT', 'ATTENDANCE_MARKED_ABSENT')",
                Integer.class)).isEqualTo(2);
        assertThat(fx.jdbc.queryForObject("select details from audit_logs where action = 'ATTENDANCE_MARKED_ABSENT'", String.class))
                .contains("Marked the wrong student");
    }

    @Test
    void attendanceCanOnlyBeMarkedOnceGatesOpen() throws Exception {
        Event later = fx.event(org, hall).title("Next Week").startsIn(Duration.ofDays(7)).save();
        User s = fx.student("2302621", "CSE", 7, "A");
        post_("/api/v1/events/" + later.getId() + "/registrations", s, "{}").andExpect(status().isOk());
        post_("/api/v1/manage/events/" + later.getId() + "/attendance", org, "{\"registrationId\":" + registrationId(s) + ",\"reason\":\"test\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_STARTED"));
        get_("/api/v1/manage/events/" + later.getId() + "/attendance", org).andExpect(jsonPath("$.phase").value("UPCOMING"))
                .andExpect(jsonPath("$.timeline.length()").value(0));
    }

    @Test
    void onlyThisEventsOrganizersAndAdminsSeeAttendance() throws Exception {
        User other = fx.staff(Role.ORGANIZER, "other@test.gndec");
        User admin = fx.staff(Role.ADMIN, "admin@test.gndec");
        User s = fx.student("2302631", "CSE", 7, "A");
        register(s);
        String mark = "{\"registrationId\":" + registrationId(s) + ",\"reason\":\"test\"}";

        get_(base + "/attendance", other).andExpect(status().isForbidden());
        get_(base + "/attendance/list", other).andExpect(status().isForbidden());
        post_(base + "/attendance", other, mark).andExpect(status().isForbidden());
        get_(base + "/live", other).andExpect(status().isForbidden());
        get_(base + "/attendance", s).andExpect(status().isForbidden());
        get_(base + "/attendance", guard).andExpect(status().isForbidden());
        get_(base + "/attendance", null).andExpect(status().isUnauthorized());
        get_(base + "/attendance", admin).andExpect(status().isOk());
        post_(base + "/attendance", admin, mark).andExpect(status().isOk());
    }

    @Test
    void theLiveFeedPushesEveryScanAsItHappens() throws Exception {
        User s = fx.student("2302641", "CSE", 7, "A");
        String qr = register(s);
        MvcResult stream = mvc.perform(get(base + "/live").header("Authorization", fx.bearer(org)))
                .andExpect(request().asyncStarted()).andReturn();
        assertThat(stream.getResponse().getContentType()).startsWith("text/event-stream");

        assertThat(scan(qr)).isEqualTo("SUCCESS");
        assertThat(scan(qr)).isEqualTo("ALREADY_USED");

        String body = stream.getResponse().getContentAsString();
        assertThat(body).contains("event:hello").contains("\"entered\":0");
        assertThat(body).contains("event:scan").contains("\"result\":\"SUCCESS\"").contains("\"result\":\"ALREADY_USED\"")
                .contains("\"entered\":1").contains("Student 2302641").contains("Gate A");
    }
}
