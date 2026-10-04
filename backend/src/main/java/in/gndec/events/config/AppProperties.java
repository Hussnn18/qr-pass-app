package in.gndec.events.config;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Settings under the {@code app.*} prefix in application.yml. */
@ConfigurationProperties("app")
public record AppProperties(
        String frontendOrigin,
        Jwt jwt,
        String passKey,
        boolean cookieSecure,
        Seed seed,
        BootstrapAdmin bootstrapAdmin) {

    public record Jwt(String secret, Duration accessTtl, Duration refreshTtl) {
    }

    public record Seed(boolean enabled) {
    }

    /** First administrator for an empty production database (demo data is never loaded there). */
    public record BootstrapAdmin(String email, String password, String name) {

        public boolean configured() {
            return email != null && !email.isBlank() && password != null && !password.isBlank();
        }
    }

    /** {@code frontend-origin} may list several origins separated by commas (e.g. production and a preview URL). */
    public List<String> frontendOrigins() {
        return frontendOrigin == null ? List.of()
                : Arrays.stream(frontendOrigin.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
