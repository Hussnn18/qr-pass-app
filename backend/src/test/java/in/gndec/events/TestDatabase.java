package in.gndec.events;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * Database for the integration tests. H2 in MySQL mode by default; {@code ./mvnw test -Ddb=postgres}
 * runs the same tests on a real PostgreSQL 17 laid out like the {@code supabase} profile.
 */
final class TestDatabase {

    private static EmbeddedPostgres postgres;

    private TestDatabase() {
    }

    static void register(DynamicPropertyRegistry registry) {
        if (!"postgres".equalsIgnoreCase(System.getProperty("db"))) {
            return;
        }
        EmbeddedPostgres pg = start();
        registry.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.hikari.schema", () -> "scems");
        registry.add("spring.flyway.locations", () -> "classpath:db/migration/common,classpath:db/migration/postgresql");
        registry.add("spring.flyway.default-schema", () -> "scems");
        registry.add("spring.flyway.schemas", () -> "scems");
    }

    private static synchronized EmbeddedPostgres start() {
        if (postgres == null) {
            try {
                postgres = EmbeddedPostgres.builder().setServerConfig("max_connections", "100").start();
            } catch (IOException e) {
                throw new UncheckedIOException("Could not start embedded PostgreSQL", e);
            }
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    postgres.close();
                } catch (IOException ignored) {
                    // the JVM is exiting anyway
                }
            }));
        }
        return postgres;
    }
}
