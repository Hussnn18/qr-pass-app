package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Venue;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Plan §12: T-RBAC-01 … T-RBAC-03 (objective 2). */
class AccessControlTests extends IntegrationTest {

    @Test
    void everyRoleReachesOnlyItsOwnArea_T_RBAC_01() throws Exception {
        User admin = fx.staff(Role.ADMIN, "admin@test.gndec");
        User org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        User sec = fx.staff(Role.SECURITY, "sec@test.gndec");
        User stu = fx.student("2302100", "CSE", 7, "A");
        Map<String, User> roles = new LinkedHashMap<>();
        roles.put("ADMIN", admin);
        roles.put("ORGANIZER", org);
        roles.put("SECURITY", sec);
        roles.put("STUDENT", stu);

        // endpoint -> roles allowed (everyone else must get 403; anonymous must get 401)
        Map<String, List<String>> matrix = new LinkedHashMap<>();
        matrix.put("/api/v1/admin/users", List.of("ADMIN"));
        matrix.put("/api/v1/admin/venues", List.of("ADMIN"));
        matrix.put("/api/v1/admin/summary", List.of("ADMIN"));
        matrix.put("/api/v1/manage/events", List.of("ADMIN", "ORGANIZER"));
        matrix.put("/api/v1/manage/security-staff", List.of("ADMIN", "ORGANIZER"));
        matrix.put("/api/v1/scan/assignments", List.of("ADMIN", "ORGANIZER", "SECURITY"));
        matrix.put("/api/v1/scan/history", List.of("ADMIN", "ORGANIZER", "SECURITY"));
        matrix.put("/api/v1/events", List.of("ADMIN", "ORGANIZER", "SECURITY", "STUDENT"));
        matrix.put("/api/v1/me", List.of("ADMIN", "ORGANIZER", "SECURITY", "STUDENT"));

        for (var row : matrix.entrySet()) {
            get_(row.getKey(), null).andExpect(status().isUnauthorized());
            for (var role : roles.entrySet()) {
                int code = get_(row.getKey(), role.getValue()).andReturn().getResponse().getStatus();
                int expected = row.getValue().contains(role.getKey()) ? 200 : 403;
                assertThat(code).as(role.getKey() + " GET " + row.getKey()).isEqualTo(expected);
            }
        }
    }

    @Test
    void organizersCannotTouchOtherOrganizersEvents_T_RBAC_02() throws Exception {
        User a = fx.staff(Role.ORGANIZER, "a@test.gndec");
        User b = fx.staff(Role.ORGANIZER, "b@test.gndec");
        Venue v = fx.venue("Hall", "Gate 1");
        Event e = fx.event(a, v).status(Event.Status.DRAFT).save();

        get_("/api/v1/manage/events/" + e.getId(), b).andExpect(status().isForbidden());
        post_("/api/v1/manage/events/" + e.getId() + "/publish", b, null).andExpect(status().isForbidden());
        get_("/api/v1/manage/events/" + e.getId() + "/participants", b).andExpect(status().isForbidden());
        get_("/api/v1/manage/events/" + e.getId(), a).andExpect(status().isOk());
    }

    @Test
    void studentsCannotReadSomeoneElsesPass_T_RBAC_03() throws Exception {
        User org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        Venue v = fx.venue("Hall", "Gate 1");
        Event e = fx.event(org, v).save();
        User owner = fx.student("2302101", "CSE", 7, "A");
        User other = fx.student("2302102", "CSE", 7, "A");
        post_("/api/v1/events/" + e.getId() + "/registrations", owner, "{}").andExpect(status().isOk());
        Integer passId = read(get_("/api/v1/me/passes", owner).andReturn(), "$[0].id");

        get_("/api/v1/passes/" + passId + "/pdf", owner).andExpect(status().isOk());
        get_("/api/v1/passes/" + passId + "/pdf", other).andExpect(status().isNotFound());
        get_("/api/v1/passes/" + passId + "/qr.png", other).andExpect(status().isNotFound());
        // The organizer of the event may open it (e.g. to reprint at the help desk).
        get_("/api/v1/passes/" + passId + "/pdf", org).andExpect(status().isOk());
    }
}
