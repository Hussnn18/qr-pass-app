package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.common.AuditService;
import in.gndec.events.config.AppProperties;
import in.gndec.events.user.AdminBootstrap;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MvcResult;

/** What the Render deployment relies on: site and API on one URL, photos in the database, the first admin. */
class DeploymentTests extends IntegrationTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0};

    @Autowired
    UserRepository users;

    @Autowired
    PasswordEncoder passwordEncoder;

    @Autowired
    AuditService audit;

    @Autowired
    AppProperties props;

    private MvcResult upload(User u, byte[] bytes) throws Exception {
        return mvc.perform(multipart("/api/v1/me/photo").file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", bytes))
                .header("Authorization", fx.bearer(u))).andReturn();
    }

    @Test
    void photosAreStoredInTheDatabase() throws Exception {
        User s = fx.student("2302301", "CSE", 7, "A");
        MvcResult first = upload(s, JPEG);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        String url = read(first, "$.photoUrl");
        assertThat(fx.jdbc.queryForObject("select count(*) from photos", Integer.class)).isOne();

        mvc.perform(get(url)).andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(content().bytes(JPEG));

        // Replacing the photo removes the old one; removing it leaves nothing behind.
        String second = read(upload(s, JPEG), "$.photoUrl");
        mvc.perform(get(url)).andExpect(status().isNotFound());
        mvc.perform(get(second)).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/me/photo").header("Authorization", fx.bearer(s))).andExpect(status().isOk());
        mvc.perform(get(second)).andExpect(status().isNotFound());
        assertThat(fx.jdbc.queryForObject("select count(*) from photos", Integer.class)).isZero();

        assertThat(upload(s, "not an image".getBytes()).getResponse().getContentAsString()).contains("FILE_TYPE");
    }

    @Test
    void onlyTheConfiguredSitesMayCallTheApi() throws Exception {
        fx.student("2302302", "CSE", 7, "A");
        String login = "{\"identifier\":\"2302302\",\"password\":\"" + Fixtures.PASSWORD + "\"}";
        // application-test.yml lists the dev server and a Render URL, as RENDER_EXTERNAL_URL does in production.
        mvc.perform(post("/api/v1/auth/login").header("Origin", "https://gndec-events.onrender.com")
                .contentType(MediaType.APPLICATION_JSON).content(login)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/login").header("Origin", "https://someone-else.onrender.com")
                .contentType(MediaType.APPLICATION_JSON).content(login)).andExpect(status().isForbidden());
    }

    @Test
    void theWebsiteIsServedFromTheSameUrl() throws Exception {
        // src/test/resources/static stands in for the React build the Dockerfile copies in.
        mvc.perform(get("/")).andExpect(status().isOk()).andExpect(forwardedUrl("index.html")); // Boot's welcome page
        // Client-side routes, even deep ones, load the app without signing in first.
        mvc.perform(get("/manage/events/6")).andExpect(status().isOk())
                .andExpect(content().string(containsString("<div id=\"root\">")))
                .andExpect(header().string("Cache-Control", containsString("no-cache")));
        mvc.perform(get("/assets/app-3f9a1c.js")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=31536000")));
        // Missing files and API paths are not swallowed by the app page.
        mvc.perform(get("/assets/missing.js")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/events")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/no-such-endpoint").header("Authorization", fx.bearer(fx.student("2302303", "CSE", 7, "A"))))
                .andExpect(status().isNotFound());
    }

    private AdminBootstrap bootstrap(String email, String password) {
        AppProperties withAdmin = new AppProperties(props.frontendOrigin(), props.jwt(), props.passKey(), props.cookieSecure(),
                props.seed(), new AppProperties.BootstrapAdmin(email, password, "College Admin"));
        return new AdminBootstrap(users, passwordEncoder, audit, withAdmin);
    }

    @Test
    void firstAdministratorComesFromTheEnvironment() throws Exception {
        assertThatThrownBy(() -> bootstrap("admin@gndec.ac.in", "short").run(null))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("ADMIN_PASSWORD");
        assertThat(users.countByRole(Role.ADMIN)).isZero();

        bootstrap(" Admin@GNDEC.ac.in ", "Start@2026").run(null);
        bootstrap("admin@gndec.ac.in", "Start@2026").run(null); // already has an admin: no-op
        assertThat(users.countByRole(Role.ADMIN)).isOne();

        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"admin@gndec.ac.in\",\"password\":\"Start@2026\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("ADMIN"))
                .andExpect(jsonPath("$.user.name").value("College Admin"))
                .andExpect(jsonPath("$.user.mustChangePassword").value(true));

        bootstrap("", "").run(null); // not configured: nothing happens
        assertThat(users.count()).isOne();
    }
}
