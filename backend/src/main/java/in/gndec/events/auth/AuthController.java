package in.gndec.events.auth;

import in.gndec.events.auth.SessionCookies.AuthResponse;
import in.gndec.events.common.AuditService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    public record LoginRequest(@NotBlank @Size(max = 160) String identifier, @NotBlank @Size(max = 100) String password) {
    }

    private final AuthService auth;
    private final SessionCookies cookies;

    public AuthController(AuthService auth, SessionCookies cookies) {
        this.auth = auth;
        this.cookies = cookies;
    }

    /** Students sign in with their URN, staff with their email. */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        return cookies.respond(auth.login(req.identifier(), req.password(), String.valueOf(AuditService.clientIp())));
    }

    /** Called by the frontend on page load and whenever the access token expires. */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@CookieValue(name = SessionCookies.NAME, required = false) String refreshToken) {
        return cookies.respond(auth.refresh(refreshToken));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = SessionCookies.NAME, required = false) String refreshToken) {
        auth.logout(refreshToken);
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookies.clearHeader()).build();
    }
}
