package in.gndec.events.user;

import in.gndec.events.common.AuditService;
import in.gndec.events.common.Secrets;
import in.gndec.events.config.AppProperties;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD when the database has none. This is
 * how a fresh production database gets its first sign-in (demo data is never loaded there). The password
 * is temporary: it must be changed at first sign-in, after which the variables can be removed.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE) // after the demo-data seeder, which brings its own administrator
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final AppProperties props;

    public AdminBootstrap(UserRepository users, PasswordEncoder passwordEncoder, AuditService audit, AppProperties props) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
        this.props = props;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        AppProperties.BootstrapAdmin cfg = props.bootstrapAdmin();
        if (cfg == null || !cfg.configured() || users.countByRole(Role.ADMIN) > 0) {
            return;
        }
        // Fail the start-up loudly: a silently skipped admin would leave nobody able to sign in.
        String problem = Secrets.passwordProblem(cfg.password());
        if (problem != null) {
            throw new IllegalStateException("ADMIN_PASSWORD is too weak. " + problem);
        }
        String email = cfg.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(email)) {
            throw new IllegalStateException("ADMIN_EMAIL " + email + " already belongs to an account that is not an administrator.");
        }
        User u = new User();
        u.setRole(Role.ADMIN);
        u.setFullName(cfg.name() == null || cfg.name().isBlank() ? "Portal Administrator" : cfg.name().trim());
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(cfg.password()));
        u.setMustChangePassword(true);
        users.save(u);
        audit.logAs(null, "ADMIN_BOOTSTRAPPED", "User", u.getId(), email);
        log.info("Created administrator {} from ADMIN_EMAIL. Sign in, set a new password, then remove ADMIN_PASSWORD.", email);
    }
}
