package in.gndec.events.common;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Writes security-relevant actions to audit_logs (requirement O2-14). The viewer screen comes in objective 5. */
@Service
public class AuditService {

    private final AuditLogRepository repo;

    public AuditService(AuditLogRepository repo) {
        this.repo = repo;
    }

    public void log(String action, String entityType, Object entityId, String details) {
        logAs(CurrentUser.idOrNull(), action, entityType, entityId, details);
    }

    public void logAs(Long actorId, String action, String entityType, Object entityId, String details) {
        AuditLog a = new AuditLog();
        a.setActorId(actorId);
        a.setAction(action);
        a.setEntityType(entityType);
        a.setEntityId(entityId == null ? null : String.valueOf(entityId));
        a.setDetails(details == null ? null : details.length() > 500 ? details.substring(0, 500) : details);
        a.setIp(clientIp());
        a.setCreatedAt(Instant.now());
        repo.save(a);
    }

    public static String clientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest req = attrs.getRequest();
            String forwarded = req.getHeader("X-Forwarded-For");
            return forwarded != null && !forwarded.isBlank() ? forwarded.split(",")[0].trim() : req.getRemoteAddr();
        }
        return null;
    }
}
