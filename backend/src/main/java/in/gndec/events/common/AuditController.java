package in.gndec.events.common;

import in.gndec.events.report.Report;
import in.gndec.events.report.ReportWriter;
import in.gndec.events.user.User;
import in.gndec.events.user.UserMapper;
import in.gndec.events.user.UserDtos.Person;
import in.gndec.events.user.UserRepository;
import jakarta.persistence.criteria.Predicate;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Audit-log viewer (objective 5, admin only via /api/v1/admin/**). Entries have been written since
 * objective 2: sign-ins, password and role changes, imports, approvals, cancellations, manual entries,
 * attendance corrections and report exports.
 */
@RestController
public class AuditController {

    public record AuditView(Long id, long at, String action, String entityType, String entityId, String details, String ip, Person actor) {
    }

    private static final int MAX_EXPORT_ROWS = 10_000;

    private final AuditLogRepository logs;
    private final UserRepository users;
    private final ReportWriter writer;
    private final AuditService audit;

    public AuditController(AuditLogRepository logs, UserRepository users, ReportWriter writer, AuditService audit) {
        this.logs = logs;
        this.users = users;
        this.writer = writer;
        this.audit = audit;
    }

    @GetMapping("/api/v1/admin/audit-logs")
    @Transactional(readOnly = true)
    public PageResponse<AuditView> search(@RequestParam(required = false) String action, @RequestParam(required = false) String q,
            @RequestParam(required = false) Long actorId, @RequestParam(required = false) Long from, @RequestParam(required = false) Long to,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "25") int size) {
        Page<AuditLog> result = logs.findAll(spec(action, q, actorId, from, to),
                PageResponse.request(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id"))));
        List<AuditView> items = views(result.getContent());
        return new PageResponse<>(items, result.getNumber() + 1, result.getSize(), result.getTotalElements(), Math.max(result.getTotalPages(), 1));
    }

    @GetMapping("/api/v1/admin/audit-logs/actions")
    @Transactional(readOnly = true)
    public List<String> actions() {
        return logs.findActions();
    }

    @GetMapping("/api/v1/admin/audit-logs/export")
    @Transactional // not read-only: the export itself is written to the audit log
    public ResponseEntity<byte[]> export(@RequestParam(required = false) String action, @RequestParam(required = false) String q,
            @RequestParam(required = false) Long actorId, @RequestParam(required = false) Long from, @RequestParam(required = false) Long to,
            @RequestParam(defaultValue = "csv") String format) {
        ReportWriter.Format f = ReportWriter.Format.parse(format);
        List<AuditLog> list = logs.findAll(spec(action, q, actorId, from, to),
                PageRequest.of(0, MAX_EXPORT_ROWS, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")))).getContent();
        List<List<Object>> rows = views(list).stream().map(v -> new ArrayList<Object>(Arrays.asList(Instant.ofEpochMilli(v.at()), v.action(),
                v.actor() == null ? "" : v.actor().name(), v.actor() == null ? "" : v.actor().role(),
                v.entityType(), v.entityId(), v.details(), v.ip()))).collect(Collectors.toList());
        Report report = new Report("Audit log", "audit-log",
                List.of(rows.size() + " entries" + (rows.size() == MAX_EXPORT_ROWS ? " (newest " + MAX_EXPORT_ROWS + " only — narrow the filters for more)" : "")
                        + (action == null || action.isBlank() ? "" : " · action " + action) + (q == null || q.isBlank() ? "" : " · matching \"" + q + "\"")),
                List.of(new Report.Section("Entries", List.of("Time", "Action", "By", "Role", "Entity", "Id", "Details", "IP"),
                        List.of(14, 22, 18, 9, 11, 8, 40, 13), rows)));
        byte[] body = writer.write(report, f);
        audit.log("AUDIT_LOG_EXPORTED", "Report", null, rows.size() + " rows · " + f.extension);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("audit-log-" + LocalDate.now(ZoneId.of("Asia/Kolkata")) + "." + f.extension).build().toString())
                .body(body);
    }

    /** q matches the details, the entity id, the action, or the name / e-mail / URN of the person who acted. */
    private Specification<AuditLog> spec(String action, String q, Long actorId, Long from, Long to) {
        List<Long> matchingActors = q == null || q.isBlank() ? List.of()
                : users.findIdsMatching("%" + q.trim().toLowerCase(Locale.ROOT) + "%", PageRequest.of(0, 200));
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (action != null && !action.isBlank()) {
                ps.add(cb.equal(root.get("action"), action));
            }
            if (actorId != null) {
                ps.add(cb.equal(root.get("actorId"), actorId));
            }
            if (from != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), Instant.ofEpochMilli(from)));
            }
            if (to != null) {
                ps.add(cb.lessThan(root.get("createdAt"), Instant.ofEpochMilli(to)));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                List<Predicate> any = new ArrayList<>(List.of(cb.like(cb.lower(root.get("details")), like),
                        cb.like(cb.lower(root.get("entityId")), like), cb.like(cb.lower(root.get("action")), like)));
                if (!matchingActors.isEmpty()) {
                    any.add(root.get("actorId").in(matchingActors));
                }
                ps.add(cb.or(any.toArray(Predicate[]::new)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }

    private List<AuditView> views(List<AuditLog> list) {
        Map<Long, User> people = users.findAllById(list.stream().map(AuditLog::getActorId).filter(Objects::nonNull).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        return list.stream().map(a -> new AuditView(a.getId(), a.getCreatedAt().toEpochMilli(), a.getAction(), a.getEntityType(),
                a.getEntityId(), a.getDetails(), a.getIp(), a.getActorId() == null || !people.containsKey(a.getActorId()) ? null
                        : UserMapper.person(people.get(a.getActorId())))).toList();
    }
}
