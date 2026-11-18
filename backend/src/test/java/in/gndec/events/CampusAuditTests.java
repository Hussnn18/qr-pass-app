package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.CampusCatalog;
import in.gndec.events.venue.Venue;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Objective 4 (campus map) and objective 5 (audit-log viewer). */
class CampusAuditTests extends IntegrationTest {

    @Test
    void campusMapShowsEachPlaceWithItsUpcomingEvents() throws Exception {
        User org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        Venue hall = fx.venue("Main Auditorium", "Gate A", "Gate B");
        fx.jdbc.update("update venues set latitude = 30.85888, longitude = 75.86074 where id = ?", hall.getId());
        fx.event(org, hall).title("Robotics Expo").startsIn(Duration.ofDays(3)).save();
        fx.event(org, hall).title("Secret Draft").status(Event.Status.DRAFT).startsIn(Duration.ofDays(4)).save();
        fx.event(org, hall).title("Last Month").startsIn(Duration.ofDays(-30)).save();
        Venue closed = fx.venue("Old Hall");
        fx.jdbc.update("update venues set active = false where id = ?", closed.getId());
        User s = fx.student("2302801", "CSE", 7, "A");

        MvcResult r = get_("/api/v1/campus/places", s).andExpect(status().isOk()).andReturn();
        List<Map<String, Object>> places = read(r, "$");
        assertThat(places).extracting(p -> p.get("name")).containsExactly("Main Auditorium");
        Map<String, Object> audi = places.get(0);
        assertThat(audi).containsEntry("lat", 30.85888).containsEntry("lng", 75.86074);
        assertThat((List<String>) audi.get("gates")).containsExactly("Gate A", "Gate B");
        assertThat((List<Map<String, Object>>) audi.get("events")).extracting(e -> e.get("title")).containsExactly("Robotics Expo");
        get_("/api/v1/campus/places", null).andExpect(status().isUnauthorized());
    }

    @Test
    void adminLoadsTheGndecCampusOnceWithoutDuplicates() throws Exception {
        User admin = fx.staff(Role.ADMIN, "admin@test.gndec");
        fx.venue("Central Library", "Library Foyer"); // already there, but without coordinates
        int places = CampusCatalog.PLACES.size();

        post_("/api/v1/admin/venues/campus", admin, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.added").value(places - 1))
                .andExpect(jsonPath("$.located").value(1));
        post_("/api/v1/admin/venues/campus", admin, null).andExpect(jsonPath("$.added").value(0))
                .andExpect(jsonPath("$.unchanged").value(places));
        assertThat(fx.jdbc.queryForObject("select count(*) from venues", Integer.class)).isEqualTo(places);
        assertThat(fx.jdbc.queryForObject("select count(*) from venues where latitude is null", Integer.class)).isZero();
        assertThat(fx.jdbc.queryForObject("select count(*) from gates g join venues v on v.id = g.venue_id where v.name = 'Open Air Theatre'",
                Integer.class)).isEqualTo(2);
        post_("/api/v1/admin/venues/campus", fx.staff(Role.ORGANIZER, "org@test.gndec"), null).andExpect(status().isForbidden());
    }

    @Test
    void adminsBrowseFilterAndExportTheAuditLog() throws Exception {
        User admin = fx.staff(Role.ADMIN, "admin@test.gndec");
        User s = fx.student("2302811", "CSE", 7, "A");
        // A failed and a successful sign-in, both audited since objective 2.
        post_("/api/v1/auth/login", null, "{\"identifier\":\"2302811\",\"password\":\"wrong-password\"}").andExpect(status().isUnauthorized());
        post_("/api/v1/auth/login", null, "{\"identifier\":\"2302811\",\"password\":\"" + Fixtures.PASSWORD + "\"}").andExpect(status().isOk());

        get_("/api/v1/admin/audit-logs", admin).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].action").value("LOGIN"))
                .andExpect(jsonPath("$.items[0].actor.name").value(s.getFullName()))
                .andExpect(jsonPath("$.items[1].action").value("LOGIN_FAILED"));
        get_("/api/v1/admin/audit-logs?action=LOGIN_FAILED", admin).andExpect(jsonPath("$.total").value(1));
        get_("/api/v1/admin/audit-logs?q=2302811", admin).andExpect(jsonPath("$.total").value(1)); // matches the actor's URN
        get_("/api/v1/admin/audit-logs?q=attempt", admin).andExpect(jsonPath("$.total").value(1)); // matches the details
        List<String> actions = read(get_("/api/v1/admin/audit-logs/actions", admin).andReturn(), "$");
        assertThat(actions).containsExactly("LOGIN", "LOGIN_FAILED");

        String csv = new String(get_("/api/v1/admin/audit-logs/export?format=csv", admin).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("Time,Action,By,Role").contains("LOGIN_FAILED").contains(s.getFullName());
        assertThat(fx.jdbc.queryForObject("select count(*) from audit_logs where action = 'AUDIT_LOG_EXPORTED'", Integer.class)).isOne();

        get_("/api/v1/admin/audit-logs", fx.staff(Role.ORGANIZER, "org@test.gndec")).andExpect(status().isForbidden());
        get_("/api/v1/admin/audit-logs", s).andExpect(status().isForbidden());
    }
}
