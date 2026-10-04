package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.Venue;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Plan §12: T-EVT-01 … T-EVT-05 (objective 1). */
class EventManagementTests extends IntegrationTest {

    User org;
    Venue hall;
    Gate gate;

    @BeforeEach
    void setUp() {
        org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        hall = fx.venue("Seminar Hall", "Main Door");
        gate = fx.gatesOf(hall).get(0);
    }

    private String body(Instant start, Instant end, Instant regOpens, Instant regCloses) {
        return """
                {"title":"Cloud Computing Workshop","description":"Hands-on session on deploying apps to the cloud.",
                 "category":"WORKSHOP","venueId":%d,"startsAt":%d,"endsAt":%d,"regOpensAt":%d,"regClosesAt":%d,
                 "capacity":40,"mode":"OPEN","allowOutsiders":false,
                 "eligibility":{"departments":["CSE"],"semesters":[5,7],"sections":[]},"gateIds":[%d]}
                """.formatted(hall.getId(), start.toEpochMilli(), end.toEpochMilli(), regOpens.toEpochMilli(),
                regCloses.toEpochMilli(), gate.getId());
    }

    @Test
    void schedulingRulesAreValidated_T_EVT_01() throws Exception {
        Instant start = Instant.now().plus(Duration.ofDays(5));
        post_("/api/v1/manage/events", org, body(start, start.minus(Duration.ofHours(1)), Instant.now(), start.minus(Duration.ofDays(1))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.endsAt").exists());
        post_("/api/v1/manage/events", org, body(start, start.plus(Duration.ofHours(2)), Instant.now(), start.plus(Duration.ofHours(1))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.regClosesAt").exists());
        Instant past = Instant.now().minus(Duration.ofDays(1));
        post_("/api/v1/manage/events", org, body(past, past.plus(Duration.ofHours(2)), past.minus(Duration.ofDays(2)), past.minus(Duration.ofHours(1))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.startsAt").exists());
        post_("/api/v1/manage/events", org, "{\"title\":\"x\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        MvcResult ok = post_("/api/v1/manage/events", org, body(start, start.plus(Duration.ofHours(2)), Instant.now(), start.minus(Duration.ofDays(1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.eligibility.departments[0]").value("CSE")).andReturn();
        assertThat((List<?>) read(ok, "$.organizers")).hasSize(1);
    }

    @Test
    void publishingIsBlockedByAVenueClash_T_EVT_02() throws Exception {
        Instant start = Instant.now().plus(Duration.ofDays(5));
        fx.event(org, hall).title("Existing Talk").startsIn(Duration.ofDays(5)).length(Duration.ofHours(3)).save();

        MvcResult clash = post_("/api/v1/manage/events?publish=true", org,
                body(start.plus(Duration.ofHours(1)), start.plus(Duration.ofHours(2)), Instant.now(), start.minus(Duration.ofDays(1))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VENUE_CLASH")).andReturn();
        assertThat((String) read(clash, "$.detail")).contains("Existing Talk");

        post_("/api/v1/manage/events?publish=true", org,
                body(start.plus(Duration.ofHours(4)), start.plus(Duration.ofHours(6)), Instant.now(), start.minus(Duration.ofDays(1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    void lifecycleRulesAndCancellationRevokePasses_T_EVT_03() throws Exception {
        Event e = fx.event(org, hall).capacity(5).save();
        User s1 = fx.student("2302201", "CSE", 7, "A");
        User s2 = fx.student("2302202", "CSE", 7, "A");
        post_("/api/v1/events/" + e.getId() + "/registrations", s1, "{}").andExpect(status().isOk());
        post_("/api/v1/events/" + e.getId() + "/registrations", s2, "{}").andExpect(status().isOk());

        mvc.perform(delete("/api/v1/manage/events/" + e.getId()).header("Authorization", fx.bearer(org)))
                .andExpect(status().isConflict());
        post_("/api/v1/manage/events/" + e.getId() + "/cancel", org, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        post_("/api/v1/manage/events/" + e.getId() + "/cancel", org, "{\"reason\":\"Exams rescheduled\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.stats.confirmed").value(0))
                .andExpect(jsonPath("$.stats.cancelled").value(2));
        get_("/api/v1/me/passes", s1).andExpect(jsonPath("$[0].status").value("REVOKED"));
        assertThat(fx.jdbc.queryForObject("select confirmed_count from events where id = ?", Integer.class, e.getId())).isZero();

        Event draft = fx.event(org, hall).status(Event.Status.DRAFT).startsIn(Duration.ofDays(9)).save();
        mvc.perform(delete("/api/v1/manage/events/" + draft.getId()).header("Authorization", fx.bearer(org)))
                .andExpect(status().isNoContent());
    }

    @Test
    void draftsAreHiddenFromStudents_T_EVT_04() throws Exception {
        Event draft = fx.event(org, hall).status(Event.Status.DRAFT).title("Secret Draft").save();
        fx.event(org, hall).title("Visible Event").startsIn(Duration.ofDays(8)).save();
        User s = fx.student("2302203", "CSE", 7, "A");

        get_("/api/v1/events/" + draft.getId(), s).andExpect(status().isNotFound());
        MvcResult list = get_("/api/v1/events", s).andExpect(status().isOk()).andReturn();
        assertThat((List<String>) read(list, "$.items[*].title")).containsExactly("Visible Event");
        get_("/api/v1/events/" + draft.getId(), org).andExpect(status().isOk());

        // Cancelled events stay listed for reference, but "only events I can join" leaves them out.
        fx.event(org, hall).status(Event.Status.CANCELLED).title("Called Off").startsIn(Duration.ofDays(10)).save();
        MvcResult all = get_("/api/v1/events", s).andReturn();
        assertThat((List<String>) read(all, "$.items[*].title")).containsExactly("Visible Event", "Called Off");
        MvcResult joinable = get_("/api/v1/events?eligibleOnly=true", s).andReturn();
        assertThat((List<String>) read(joinable, "$.items[*].title")).containsExactly("Visible Event");
    }

    @Test
    void participantListAndCsvExport_T_EVT_05() throws Exception {
        Event e = fx.event(org, hall).capacity(2).save();
        for (String urn : List.of("2302211", "2302212", "2302213")) {
            post_("/api/v1/events/" + e.getId() + "/registrations", fx.student(urn, "CSE", 7, "A"), "{}").andExpect(status().isOk());
        }
        get_("/api/v1/manage/events/" + e.getId() + "/participants", org)
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items[2].status").value("WAITLISTED"))
                .andExpect(jsonPath("$.items[2].waitlistPosition").value(1));
        get_("/api/v1/manage/events/" + e.getId() + "/participants?status=CONFIRMED", org).andExpect(jsonPath("$.total").value(2));

        String csv = get_("/api/v1/manage/events/" + e.getId() + "/participants.csv", org)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(csv.trim().split("\r\n")).hasSize(4);
        assertThat(csv).contains("Name,URN / Email").contains("2302213").contains("WAITLISTED");
    }
}
