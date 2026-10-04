package in.gndec.events.auth;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.RateLimiter;
import in.gndec.events.user.User;
import in.gndec.events.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Sign-in with URN (students) or email (staff), lockout after repeated failures, token refresh. */
@Service
public class AuthService {

    static final int MAX_FAILED_LOGINS = 5;
    static final Duration LOCK_DURATION = Duration.ofMinutes(15);

    public record Session(String accessToken, String refreshToken, long expiresIn, User user) {
    }

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final AuditService audit;
    private final RateLimiter rateLimiter;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokens, AuditService audit,
            RateLimiter rateLimiter) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.audit = audit;
        this.rateLimiter = rateLimiter;
    }

    /** noRollbackFor: a failed attempt must still be counted and audited even though we answer 401. */
    @Transactional(noRollbackFor = ApiException.class)
    public Session login(String identifier, String password, String ip) {
        rateLimiter.check("login:" + ip, 20, Duration.ofMinutes(1));
        String id = identifier.trim();
        Optional<User> found = id.contains("@") ? users.findByEmailIgnoreCase(id) : users.findByUrn(id);
        if (found.isEmpty()) {
            audit.logAs(null, "LOGIN_FAILED", "User", null, "Unknown account: " + id);
            throw invalidCredentials();
        }
        User u = found.get();
        Instant now = Instant.now();
        if (u.getStatus() == User.Status.LOCKED) {
            if (u.getLockedUntil() != null && u.getLockedUntil().isAfter(now)) {
                long minutes = Math.max(1, Duration.between(now, u.getLockedUntil()).toMinutes() + 1);
                throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_LOCKED",
                        "This account is locked after too many failed attempts. Try again in " + minutes
                                + " minute(s), or ask the admin to unlock it.");
            }
            u.setStatus(User.Status.ACTIVE);
            u.setFailedLogins(0);
        }
        if (u.getStatus() == User.Status.INACTIVE) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_INACTIVE", "This account has been deactivated. Contact the Student Welfare office.");
        }
        if (!passwordEncoder.matches(password, u.getPasswordHash())) {
            u.setFailedLogins(u.getFailedLogins() + 1);
            audit.logAs(null, "LOGIN_FAILED", "User", u.getId(), "Attempt " + u.getFailedLogins());
            if (u.getFailedLogins() >= MAX_FAILED_LOGINS) {
                u.setStatus(User.Status.LOCKED);
                u.setLockedUntil(now.plus(LOCK_DURATION));
                audit.logAs(null, "ACCOUNT_LOCKED", "User", u.getId(), "Locked for 15 minutes after 5 failed attempts");
                throw new ApiException(HttpStatus.UNAUTHORIZED, "ACCOUNT_LOCKED", "Too many failed attempts. The account is locked for 15 minutes.");
            }
            throw invalidCredentials();
        }
        u.setFailedLogins(0);
        u.setLockedUntil(null);
        u.setLastLoginAt(now);
        audit.logAs(u.getId(), "LOGIN", "User", u.getId(), "Password sign-in");
        return newSession(u);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Session refresh(String rawRefreshToken) {
        User u = tokens.consumeRefreshToken(rawRefreshToken);
        if (u.getStatus() != User.Status.ACTIVE) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Your session has ended. Please sign in again.");
        }
        return newSession(u);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        tokens.revokeRefreshToken(rawRefreshToken);
    }

    Session newSession(User u) {
        return new Session(tokens.accessToken(u), tokens.issueRefreshToken(u), tokens.accessTtlSeconds(), u);
    }

    /** After a password change: sign out other devices and hand back a fresh pair without the "must change" flag. */
    @Transactional
    public Session restartSession(User u) {
        tokens.revokeAll(u.getId());
        return newSession(u);
    }

    private static ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
                "Incorrect URN/email or password. Accounts lock after 5 failed attempts.");
    }
}
