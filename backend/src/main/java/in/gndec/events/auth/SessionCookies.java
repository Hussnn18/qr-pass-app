package in.gndec.events.auth;

import in.gndec.events.config.AppProperties;
import in.gndec.events.user.UserDtos.Me;
import in.gndec.events.user.UserMapper;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * The refresh token travels only in an httpOnly, SameSite=Strict cookie scoped to /api/v1/auth, so page
 * scripts can't read it. The access token is returned in the JSON body and kept in memory by the frontend.
 */
@Component
public class SessionCookies {

    public static final String NAME = "scems_rt";
    private static final String PATH = "/api/v1/auth";

    public record AuthResponse(String accessToken, long expiresIn, Me user) {
    }

    private final AppProperties props;
    private final UserMapper mapper;

    public SessionCookies(AppProperties props, UserMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    public ResponseEntity<AuthResponse> respond(AuthService.Session s) {
        ResponseCookie cookie = ResponseCookie.from(NAME, s.refreshToken())
                .httpOnly(true).secure(props.cookieSecure()).sameSite("Strict").path(PATH)
                .maxAge(props.jwt().refreshTtl()).build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AuthResponse(s.accessToken(), s.expiresIn(), mapper.me(s.user())));
    }

    public String clearHeader() {
        return ResponseCookie.from(NAME, "").httpOnly(true).secure(props.cookieSecure()).sameSite("Strict")
                .path(PATH).maxAge(Duration.ZERO).build().toString();
    }
}
