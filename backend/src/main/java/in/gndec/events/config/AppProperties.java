package in.gndec.events.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Settings under the {@code app.*} prefix in application.yml. */
@ConfigurationProperties("app")
public record AppProperties(
        String frontendOrigin,
        Jwt jwt,
        String passKey,
        boolean cookieSecure,
        String uploadDir,
        Seed seed) {

    public record Jwt(String secret, Duration accessTtl, Duration refreshTtl) {
    }

    public record Seed(boolean enabled) {
    }
}
