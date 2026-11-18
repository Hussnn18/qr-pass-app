package in.gndec.events.report;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.report.ReportWriter.Format;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Report downloads (objective 5) as CSV, Excel or PDF. Every export is written to the audit log. */
@RestController
public class ReportController {

    private final ReportService reports;
    private final ReportWriter writer;
    private final AuditService audit;

    public ReportController(ReportService reports, ReportWriter writer, AuditService audit) {
        this.reports = reports;
        this.writer = writer;
        this.audit = audit;
    }

    /** kind = registrations | attendance | absentees */
    @GetMapping("/api/v1/manage/reports/events/{id}/{kind}")
    public ResponseEntity<byte[]> event(@PathVariable Long id, @PathVariable String kind, @RequestParam(defaultValue = "csv") String format) {
        ReportService.Kind k;
        try {
            k = ReportService.Kind.valueOf(kind.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound("Report");
        }
        Report report = reports.event(id, k);
        return send(report, Format.parse(format), "Event", id);
    }

    @GetMapping("/api/v1/manage/reports/summary")
    public ResponseEntity<byte[]> summary(@RequestParam(defaultValue = "xlsx") String format, @RequestParam(required = false) Long from,
            @RequestParam(required = false) Long to) {
        return send(reports.summary(from, to), Format.parse(format), "Report", null);
    }

    private ResponseEntity<byte[]> send(Report report, Format format, String entityType, Object entityId) {
        byte[] body = writer.write(report, format);
        audit.log("REPORT_EXPORTED", entityType, entityId, report.title() + " · " + format.extension + " · " + report.rowCount() + " rows");
        String file = report.fileStem() + "-" + LocalDate.now(ZoneId.of("Asia/Kolkata")) + "." + format.extension;
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(format.contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file).build().toString())
                .body(body);
    }
}
