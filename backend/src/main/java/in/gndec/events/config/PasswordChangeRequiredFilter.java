package in.gndec.events.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Accounts created with a temporary password (admin-created or bulk-imported) must set their own
 * password first. Until then the token carries "pwc": true and only these endpoints work.
 */
public class PasswordChangeRequiredFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken jwt
                && Boolean.TRUE.equals(jwt.getToken().getClaim("pwc"))
                && !allowed(request)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/problem+json");
            response.getWriter().write("{\"status\":403,\"code\":\"PASSWORD_CHANGE_REQUIRED\","
                    + "\"detail\":\"Set a new password before using the portal.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean allowed(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/v1/auth/")
                || path.equals("/api/v1/me/password")
                || (path.equals("/api/v1/me") && "GET".equals(request.getMethod()))
                || path.startsWith("/api/v1/departments");
    }
}
