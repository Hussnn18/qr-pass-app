package in.gndec.events.auth;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.Secrets;
import in.gndec.events.config.AppProperties;
import in.gndec.events.user.User;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Access token: short-lived JWT (15 min) with the user id, role and the "must change password" flag.
 * Refresh token: random, 7 days, stored hashed, rotated on every use. Reusing an old refresh token
 * is treated as theft and signs the user out everywhere.
 */
@Service
public class TokenService {

    private final JwtEncoder encoder;
    private final AppProperties props;
    private final RefreshTokenRepository refreshTokens;

    public TokenService(JwtEncoder encoder, AppProperties props, RefreshTokenRepository refreshTokens) {
        this.encoder = encoder;
        this.props = props;
        this.refreshTokens = refreshTokens;
    }

    public String accessToken(User user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("smart-campus-events")
                .subject(String.valueOf(user.getId()))
                .issuedAt(now)
                .expiresAt(now.plus(props.jwt().accessTtl()))
                .claim("role", user.getRole().name())
                .claim("pwc", user.isMustChangePassword())
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    public long accessTtlSeconds() {
        return props.jwt().accessTtl().toSeconds();
    }

    @Transactional
    public String issueRefreshToken(User user) {
        String raw = Secrets.token();
        RefreshToken t = new RefreshToken();
        t.setUser(user);
        t.setTokenHash(Secrets.sha256Hex(raw));
        t.setCreatedAt(Instant.now());
        t.setExpiresAt(Instant.now().plus(props.jwt().refreshTtl()));
        refreshTokens.save(t);
        return raw;
    }

    /** Validates and consumes a refresh token, returning its owner. The caller issues a new pair. */
    @Transactional(noRollbackFor = ApiException.class)
    public User consumeRefreshToken(String raw) {
        if (raw == null || raw.isBlank()) {
            throw expired();
        }
        RefreshToken t = refreshTokens.findByTokenHash(Secrets.sha256Hex(raw)).orElseThrow(TokenService::expired);
        Instant now = Instant.now();
        if (t.getRevokedAt() != null) {
            refreshTokens.revokeAllForUser(t.getUser().getId(), now);
            throw expired();
        }
        if (t.getExpiresAt().isBefore(now)) {
            throw expired();
        }
        t.setRevokedAt(now);
        return t.getUser();
    }

    @Transactional
    public void revokeRefreshToken(String raw) {
        if (raw != null && !raw.isBlank()) {
            refreshTokens.findByTokenHash(Secrets.sha256Hex(raw)).ifPresent(t -> t.setRevokedAt(Instant.now()));
        }
    }

    @Transactional
    public void revokeAll(Long userId) {
        refreshTokens.revokeAllForUser(userId, Instant.now());
    }

    private static ApiException expired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Your session has ended. Please sign in again.");
    }
}
