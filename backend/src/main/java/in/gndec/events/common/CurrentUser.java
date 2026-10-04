package in.gndec.events.common;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Who is calling. Always taken from the verified access token — never from an id in the URL
 * (the Minor project trusted /api/passes/:urn, which let anyone read anyone's passes).
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static Long id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null || !auth.getName().matches("\\d+")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Please sign in.");
        }
        return Long.valueOf(auth.getName());
    }

    public static Long idOrNull() {
        try {
            return id();
        } catch (ApiException e) {
            return null;
        }
    }

    public static boolean hasRole(String role) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
    }
}
