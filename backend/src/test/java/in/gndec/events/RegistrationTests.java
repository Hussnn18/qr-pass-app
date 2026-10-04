package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Venue;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Plan §12: T-ELIG-01/02 and T-REG-01 … T-REG-05 (objective 2). */
class RegistrationTests extends IntegrationTest {

    User org;
    Venue hall;

    @BeforeEach
    void setUp() {
        org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        hall = fx.venue("Seminar Hall", "Main Door");
    }

    private MvcResult register(Event e, User s) throws Exception {
        return post_("/api/v1/events/" + e.getId() + "/registrations", s, "{}").andReturn();
    }

    @Test
    void eligibilityIsCheckedRuleByRule_T_ELIG_01() throws Exception {
        Event e = fx.event(org, hall).departments("CSE", "IT").semesters(5, 7).save();
        User me = fx.student("2502301", "ME", 3, "B");

        MvcResult check = get_("/api/v1/events/" + e.getId() + "/eligibility", me).andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(false)).andReturn();
        List<Map<String, Object>> reasons = read(check, "$.reasons");
        assertThat(reasons).anySatisfy(r -> {
            assertThat((String) r.get("label")).startsWith("Department");
            assertThat(r.get("ok")).isEqualTo(false);
            assertThat(r.get("detail")).isEqualTo("You: ME");
        });
        assertThat(reasons).anySatisfy(r -> assertThat((String) r.get("label")).startsWith("Semester"));
        post_("/api/v1/events/" + e.getId() + "/registrations", me, "{}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_ELIGIBLE"));

        User cse = fx.student("2302302", "CSE", 7, "A");
        get_("/api/v1/events/" + e.getId() + "/eligibility", cse).andExpect(jsonPath("$.eligible").value(true));
    }

    @Test
    void eligibilityFailsClosed_T_ELIG_02() throws Exception {
        Event e = fx.event(org, hall).save();
        // Staff accounts are never "eligible", and a suspended student is refused even with no rules set.
        get_("/api/v1/events/" + e.getId() + "/eligibility", org).andExpect(jsonPath("$.eligible").value(false));
        User suspended = fx.student("2302303", "CSE", 7, "A");
        suspended.getProfile().setEnrolled(false);
        fx.users.save(suspended);
        get_("/api/v1/events/" + e.getId() + "/eligibility", suspended).andExpect(jsonPath("$.eligible").value(false));
        assertThat(register(e, suspended).getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void openModeConfirmsUntilFullThenWaitlists_T_REG_01() throws Exception {
        Event e = fx.event(org, hall).capacity(2).save();
        assertThat((String) read(register(e, fx.student("2302311", "CSE", 7, "A")), "$.status")).isEqualTo("CONFIRMED");
        assertThat((String) read(register(e, fx.student("2302312", "CSE", 7, "A")), "$.status")).isEqualTo("CONFIRMED");
        User third = fx.student("2302313", "CSE", 7, "A");
        assertThat((String) read(register(e, third), "$.status")).isEqualTo("WAITLISTED");
        get_("/api/v1/me/passes", third).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void fiftyParallelRegistrationsForTenSeats_T_REG_02() throws Exception {
        Event e = fx.event(org, hall).capacity(10).save();
        List<User> students = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            students.add(fx.student(String.valueOf(2302400 + i), "CSE", 7, "A"));
        }
        List<Callable<String>> tasks = new ArrayList<>();
        for (User s : students) {
            tasks.add(() -> read(register(e, s), "$.status"));
        }
        Map<String, Long> outcome = parallel(tasks).stream().collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));

        assertThat(outcome).containsEntry("CONFIRMED", 10L).containsEntry("WAITLISTED", 40L);
        assertThat(fx.jdbc.queryForObject("select confirmed_count from events where id = ?", Integer.class, e.getId())).isEqualTo(10);
        assertThat(fx.jdbc.queryForObject("select count(*) from passes where event_id = ? and status = 'ACTIVE'", Integer.class, e.getId())).isEqualTo(10);
    }

    @Test
    void secondRegistrationIsRejected_T_REG_03() throws Exception {
        Event e = fx.event(org, hall).save();
        User s = fx.student("2302321", "CSE", 7, "A");
        assertThat(register(e, s).getResponse().getStatus()).isEqualTo(200);
        MvcResult again = register(e, s);
        assertThat(again.getResponse().getStatus()).isEqualTo(409);
        assertThat((String) read(again, "$.code")).isEqualTo("ALREADY_REGISTERED");
    }

    @Test
    void cancellingAConfirmedSeatPromotesTheWaitlist_T_REG_04() throws Exception {
        Event e = fx.event(org, hall).capacity(1).save();
        User a = fx.student("2302331", "CSE", 7, "A");
        User b = fx.student("2302332", "CSE", 7, "A");
        Integer regA = read(register(e, a), "$.registrationId");
        assertThat((String) read(register(e, b), "$.status")).isEqualTo("WAITLISTED");

        MvcResult cancel = post_("/api/v1/me/registrations/" + regA + "/cancel", a, null).andExpect(status().isOk()).andReturn();
        assertThat((String) read(cancel, "$.message")).contains("waitlist");
        get_("/api/v1/me/registrations", b).andExpect(jsonPath("$[0].status").value("CONFIRMED"));
        get_("/api/v1/me/passes", b).andExpect(jsonPath("$[0].status").value("ACTIVE"));
        get_("/api/v1/me/passes", a).andExpect(jsonPath("$[0].status").value("REVOKED"));
        // Someone else can't cancel b's registration.
        Integer regB = read(get_("/api/v1/me/registrations", b).andReturn(), "$[0].id");
        post_("/api/v1/me/registrations/" + regB + "/cancel", a, null).andExpect(status().isNotFound());
    }

    @Test
    void approvalModeAndCapacityLimits_T_REG_05() throws Exception {
        Event e = fx.event(org, hall).mode(Event.Mode.APPROVAL).capacity(1).save();
        User a = fx.student("2302341", "CSE", 7, "A");
        User b = fx.student("2302342", "CSE", 7, "A");
        Integer ra = read(register(e, a), "$.registrationId");
        Integer rb = read(register(e, b), "$.registrationId");
        get_("/api/v1/me/registrations", a).andExpect(jsonPath("$[0].status").value("PENDING"));

        post_("/api/v1/manage/registrations/approve", org, "{\"ids\":[" + ra + "]}").andExpect(jsonPath("$.done").value(1));
        post_("/api/v1/manage/registrations/approve", org, "{\"ids\":[" + rb + "]}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EVENT_FULL"));
        post_("/api/v1/manage/registrations/reject", org, "{\"ids\":[" + rb + "],\"reason\":\"\"}").andExpect(status().isBadRequest());
        post_("/api/v1/manage/registrations/reject", org, "{\"ids\":[" + rb + "],\"reason\":\"Team too large\"}")
                .andExpect(jsonPath("$.done").value(1));
        get_("/api/v1/me/registrations", b).andExpect(jsonPath("$[0].status").value("REJECTED"))
                .andExpect(jsonPath("$[0].reason").value("Team too large"));
        get_("/api/v1/me/passes", a).andExpect(jsonPath("$[0].status").value("ACTIVE"));
    }

    @Test
    void autoAssignEventsIssuePassesInBulk() throws Exception {
        Event e = fx.event(org, hall).mode(Event.Mode.AUTO_ASSIGN).capacity(100).departments("CSE").save();
        User cse = fx.student("2302351", "CSE", 7, "A");
        fx.student("2302352", "CSE", 5, "B");
        fx.student("2502353", "ME", 3, "A");
        post_("/api/v1/events/" + e.getId() + "/registrations", cse, "{}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AUTO_ASSIGNED"));

        post_("/api/v1/manage/events/" + e.getId() + "/bulk-assign", org, "{}")
                .andExpect(jsonPath("$.done").value(2)).andExpect(jsonPath("$.skippedIneligible").value(1));
        get_("/api/v1/me/passes", cse).andExpect(jsonPath("$[0].status").value("ACTIVE"));
        post_("/api/v1/manage/events/" + e.getId() + "/bulk-assign", org, "{\"urns\":[\"2302351\",\"0000000\"]}")
                .andExpect(jsonPath("$.done").value(0)).andExpect(jsonPath("$.skippedExisting").value(1)).andExpect(jsonPath("$.unknown").value(1));
    }
}
