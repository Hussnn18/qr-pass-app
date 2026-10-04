package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** Plan §12: T-AUTH-01 … T-AUTH-05 (objective 2). */
class AuthTests extends IntegrationTest {

    private MvcResult login(String identifier, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"identifier\":\"" + identifier + "\",\"password\":\"" + password + "\"}")).andReturn();
    }

    @Test
    void studentsSignInWithUrnAndStaffWithEmail_T_AUTH_01() throws Exception {
        fx.student("2302001", "CSE", 7, "A");
        fx.staff(Role.ORGANIZER, "org@test.gndec");

        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"2302001\",\"password\":\"" + Fixtures.PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.user.role").value("STUDENT"))
                .andExpect(jsonPath("$.user.student.urn").value("2302001"))
                .andExpect(cookie().httpOnly("scems_rt", true));
        assertThat(login("ORG@test.gndec", Fixtures.PASSWORD).getResponse().getStatus()).isEqualTo(200);

        MvcResult wrong = login("2302001", "nope");
        assertThat(wrong.getResponse().getStatus()).isEqualTo(401);
        assertThat((String) read(wrong, "$.code")).isEqualTo("INVALID_CREDENTIALS");
        assertThat(login("9999999", Fixtures.PASSWORD).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void fiveFailedAttemptsLockTheAccount_T_AUTH_02() throws Exception {
        fx.student("2302002", "CSE", 7, "A");
        for (int i = 0; i < 4; i++) {
            assertThat((String) read(login("2302002", "bad"), "$.code")).isEqualTo("INVALID_CREDENTIALS");
        }
        assertThat((String) read(login("2302002", "bad"), "$.code")).isEqualTo("ACCOUNT_LOCKED");
        // Even the right password is refused while locked.
        MvcResult locked = login("2302002", Fixtures.PASSWORD);
        assertThat(locked.getResponse().getStatus()).isEqualTo(401);
        assertThat((String) read(locked, "$.code")).isEqualTo("ACCOUNT_LOCKED");
        assertThat(fx.users.findByUrn("2302002").orElseThrow().getStatus()).isEqualTo(User.Status.LOCKED);
    }

    @Test
    void temporaryPasswordMustBeChangedFirst_T_AUTH_03() throws Exception {
        User u = fx.student("2302003", "CSE", 7, "A");
        u.setMustChangePassword(true);
        fx.users.save(u);
        String token = read(login("2302003", Fixtures.PASSWORD), "$.accessToken");

        mvc.perform(get("/api/v1/events").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        mvc.perform(put("/api/v1/me/password").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"weak\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));

        MvcResult changed = mvc.perform(put("/api/v1/me/password").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"newPassword\":\"NewPass@2026\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.mustChangePassword").value(false)).andReturn();
        String fresh = read(changed, "$.accessToken");
        mvc.perform(get("/api/v1/events").header("Authorization", "Bearer " + fresh)).andExpect(status().isOk());
        assertThat(login("2302003", "NewPass@2026").getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void refreshTokensRotateAndReuseSignsOutEverywhere_T_AUTH_04() throws Exception {
        fx.student("2302004", "CSE", 7, "A");
        Cookie first = login("2302004", Fixtures.PASSWORD).getResponse().getCookie("scems_rt");

        MvcResult refreshed = mvc.perform(post("/api/v1/auth/refresh").cookie(first)).andExpect(status().isOk()).andReturn();
        Cookie second = refreshed.getResponse().getCookie("scems_rt");
        assertThat(second.getValue()).isNotEqualTo(first.getValue());

        // Replaying the old token is treated as theft: it fails and the newer token is revoked too.
        mvc.perform(post("/api/v1/auth/refresh").cookie(first)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh").cookie(second)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void passwordsAreStoredAsBcryptHashes_T_AUTH_05() {
        User u = fx.student("2302005", "CSE", 7, "A");
        String stored = fx.users.findById(u.getId()).orElseThrow().getPasswordHash();
        assertThat(stored).startsWith("$2a$10$").doesNotContain(Fixtures.PASSWORD);
    }
}
