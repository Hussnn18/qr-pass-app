package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.common.Secrets;
import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.Venue;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Plan §12: T-PASS-01 … 03 and T-SCAN-01 … 12 (objective 3). */
class ScanTests extends IntegrationTest {

    User org;
    User guard;
    Venue hall;
    Gate gateA;
    Gate gateB;
    Event live;

    @BeforeEach
    void setUp() {
        org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        guard = fx.staff(Role.SECURITY, "guard@test.gndec");
        hall = fx.venue("Main Auditorium", "Gate A", "Gate B");
        List<Gate> gates = fx.gatesOf(hall);
        gateA = gates.get(0);
        gateB = gates.get(1);
        // Starts in 30 minutes, so the 60-minute entry window is already open and registration is still open.
        live = fx.event(org, hall).title("Live Lecture").startsIn(Duration.ofMinutes(30))
                .regClosesAt(Instant.now().plus(Duration.ofMinutes(25))).capacity(50).save();
        fx.assign(live, gateA, guard);
    }

    /** Registers the student and returns the QR text of their pass. */
    private String passFor(Event e, User s) throws Exception {
        post_("/api/v1/events/" + e.getId() + "/registrations", s, "{}").andExpect(status().isOk());
        List<Map<String, Object>> passes = read(get_("/api/v1/me/passes", s).andReturn(), "$");
        return passes.stream().filter(p -> ((Map<?, ?>) p.get("event")).get("id").equals(e.getId().intValue()))
                .map(p -> (String) p.get("qr")).findFirst().orElseThrow();
    }

    private MvcResult scan(User as, Event e, Gate g, String qr) throws Exception {
        String body = "{\"eventId\":" + e.getId() + ",\"gateId\":" + g.getId() + ",\"qr\":" + (qr == null ? "null" : "\"" + qr + "\"") + "}";
        return post_("/api/v1/scan/verify", as, body).andReturn();
    }

    private String result(MvcResult r) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return read(r, "$.result");
    }

    @Test
    void qrContainsOnlyAnOpaqueTokenStoredAsAHash_T_PASS_01() throws Exception {
        String qr = passFor(live, fx.student("2302501", "CSE", 7, "A"));
        assertThat(qr).matches("^EQR1:[A-Za-z0-9_-]{43}$");
        String token = qr.substring(5);
        Map<String, Object> row = fx.jdbc.queryForMap("select token_hash, token_enc from passes");
        assertThat(row.get("token_hash")).isEqualTo(Secrets.sha256Hex(token));
        assertThat((String) row.get("token_enc")).doesNotContain(token);
        assertThat(fx.jdbc.queryForObject("select count(*) from passes where token_hash = ? or token_enc = ?", Integer.class, token, token)).isZero();
    }

    @Test
    void validThenAlreadyUsed_T_SCAN_01() throws Exception {
        User s = fx.student("2302502", "CSE", 7, "A");
        String qr = passFor(live, s);
        MvcResult ok = scan(guard, live, gateA, qr);
        assertThat(result(ok)).isEqualTo("SUCCESS");
        assertThat((String) read(ok, "$.holder.name")).isEqualTo(s.getFullName());

        MvcResult again = scan(guard, live, gateA, qr);
        assertThat(result(again)).isEqualTo("ALREADY_USED");
        assertThat((String) read(again, "$.firstEntryGate")).isEqualTo("Gate A");
        assertThat(fx.jdbc.queryForObject("select count(*) from entries", Integer.class)).isEqualTo(1);
        assertThat((String) read(get_("/api/v1/me/passes", s).andReturn(), "$[0].status")).isEqualTo("USED");
    }

    @Test
    void wrongEventRevokedAndForgedPassesAreRefused_T_SCAN_02() throws Exception {
        Event other = fx.event(org, fx.venue("IT Block", "Main")).title("Other Event").startsIn(Duration.ofDays(3)).save();
        User s = fx.student("2302503", "CSE", 7, "A");
        String otherQr = passFor(other, s);
        assertThat(result(scan(guard, live, gateA, otherQr))).isEqualTo("WRONG_EVENT");

        String qr = passFor(live, s);
        Integer passId = fx.jdbc.queryForObject("select id from passes where event_id = ?", Integer.class, live.getId());
        post_("/api/v1/manage/passes/" + passId + "/revoke", org, "{\"reason\":\"Shared on WhatsApp\"}").andExpect(status().isNoContent());
        MvcResult revoked = scan(guard, live, gateA, qr);
        assertThat(result(revoked)).isEqualTo("REVOKED");
        assertThat((String) read(revoked, "$.message")).contains("Shared on WhatsApp");

        assertThat(result(scan(guard, live, gateA, "EQR1:" + Secrets.token()))).isEqualTo("INVALID_TOKEN");
        assertThat(result(scan(guard, live, gateA, "https://example.com/menu"))).isEqualTo("INVALID_FORMAT");
    }

    @Test
    void reissuedPassReplacesTheOldQr_T_PASS_02() throws Exception {
        User s = fx.student("2302504", "CSE", 7, "A");
        String oldQr = passFor(live, s);
        Integer regId = read(get_("/api/v1/me/registrations", s).andReturn(), "$[0].id");
        post_("/api/v1/manage/registrations/" + regId + "/reissue-pass", org, null).andExpect(status().isNoContent());
        List<Map<String, Object>> passes = read(get_("/api/v1/me/passes", s).andReturn(), "$");
        String newQr = passes.stream().filter(p -> "ACTIVE".equals(p.get("status"))).map(p -> (String) p.get("qr")).findFirst().orElseThrow();

        assertThat(newQr).isNotEqualTo(oldQr);
        assertThat(result(scan(guard, live, gateA, oldQr))).isEqualTo("REVOKED");
        assertThat(result(scan(guard, live, gateA, newQr))).isEqualTo("SUCCESS");
    }

    @Test
    void entryWindowExpiryAndInactiveHolders_T_SCAN_03() throws Exception {
        Event later = fx.event(org, hall).title("Evening Talk").startsIn(Duration.ofHours(5)).save();
        fx.assign(later, gateA, guard);
        User s = fx.student("2302505", "CSE", 7, "A");
        MvcResult early = scan(guard, later, gateA, passFor(later, s));
        assertThat(result(early)).isEqualTo("OUTSIDE_WINDOW");
        assertThat((String) read(early, "$.message")).startsWith("Entry opens at");

        String qr = passFor(live, s);
        User admin = fx.staff(Role.ADMIN, "admin@test.gndec");
        mvcPatch("/api/v1/admin/users/" + s.getId() + "/enrollment", admin, "{\"enrolled\":false}");
        assertThat(result(scan(guard, live, gateA, qr))).isEqualTo("ACCOUNT_INACTIVE");
        mvcPatch("/api/v1/admin/users/" + s.getId() + "/enrollment", admin, "{\"enrolled\":true}");

        post_("/api/v1/manage/events/" + live.getId() + "/complete", org, null).andExpect(status().isOk());
        assertThat(result(scan(guard, live, gateA, qr))).isEqualTo("EXPIRED");
    }

    @Test
    void registrationMustStillBeConfirmed_T_SCAN_04() throws Exception {
        User s = fx.student("2302506", "CSE", 7, "A");
        String qr = passFor(live, s);
        // Defensive check: a pass whose registration is no longer confirmed must not open the gate.
        fx.jdbc.update("update registrations set status = 'PENDING'");
        assertThat(result(scan(guard, live, gateA, qr))).isEqualTo("NOT_APPROVED");
    }

    @Test
    void onlyAssignedStaffMayScanAtAGate_T_SCAN_05() throws Exception {
        String qr = passFor(live, fx.student("2302507", "CSE", 7, "A"));
        User stranger = fx.staff(Role.SECURITY, "other-guard@test.gndec");
        assertThat(result(scan(stranger, live, gateA, qr))).isEqualTo("NOT_ASSIGNED");
        assertThat(result(scan(guard, live, gateB, qr))).isEqualTo("NOT_ASSIGNED");
        User student = fx.student("2302508", "CSE", 7, "A");
        assertThat(scan(student, live, gateA, qr).getResponse().getStatus()).isEqualTo(403);
        // The event's own organizer may scan at any of its gates.
        assertThat(result(scan(org, live, gateB, qr))).isEqualTo("SUCCESS");
    }

    @Test
    void manualEntryByPassCodeOrUrnIsAudited_T_SCAN_06() throws Exception {
        User s = fx.student("2302509", "CSE", 7, "A");
        passFor(live, s);
        String code = fx.jdbc.queryForObject("select code from passes", String.class);
        MvcResult byCode = post_("/api/v1/scan/verify", guard,
                "{\"eventId\":" + live.getId() + ",\"gateId\":" + gateA.getId() + ",\"code\":\"" + code.toLowerCase() + "\"}").andReturn();
        assertThat(result(byCode)).isEqualTo("SUCCESS");
        MvcResult byUrn = post_("/api/v1/scan/verify", guard,
                "{\"eventId\":" + live.getId() + ",\"gateId\":" + gateA.getId() + ",\"code\":\"2302509\"}").andReturn();
        assertThat(result(byUrn)).isEqualTo("ALREADY_USED");
        assertThat(fx.jdbc.queryForObject("select count(*) from audit_logs where action like 'MANUAL_ENTRY_%'", Integer.class)).isEqualTo(2);
    }

    @Test
    void fiveGatesScanningOnePassAtOnceAdmitExactlyOne_T_SCAN_11() throws Exception {
        String qr = passFor(live, fx.student("2302510", "CSE", 7, "A"));
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            Gate g = i % 2 == 0 ? gateA : gateB;
            tasks.add(() -> result(scan(org, live, g, qr)));
        }
        Map<String, Long> outcome = parallel(tasks).stream().collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        assertThat(outcome).containsEntry("SUCCESS", 1L).containsEntry("ALREADY_USED", 4L);
        assertThat(fx.jdbc.queryForObject("select count(*) from entries", Integer.class)).isEqualTo(1);
    }

    @Test
    void everyAttemptIsLogged_T_SCAN_12() throws Exception {
        String qr = passFor(live, fx.student("2302511", "CSE", 7, "A"));
        scan(guard, live, gateA, qr);
        scan(guard, live, gateA, qr);
        scan(guard, live, gateA, "nonsense");
        scan(guard, live, gateB, qr);
        assertThat(fx.jdbc.queryForList("select result from scan_logs order by id", String.class))
                .containsExactly("SUCCESS", "ALREADY_USED", "INVALID_FORMAT", "NOT_ASSIGNED");
        assertThat((Integer) read(get_("/api/v1/scan/history?result=FAIL", guard).andReturn(), "$.total")).isEqualTo(3);
        assertThat((Integer) read(get_("/api/v1/scan/summary", guard).andReturn(), "$.allowedToday")).isEqualTo(1);
    }

    private void mvcPatch(String url, User as, String json) throws Exception {
        mvc.perform(patch(url)
                .header("Authorization", fx.bearer(as)).contentType("application/json").content(json)).andExpect(status().isOk());
    }
}
