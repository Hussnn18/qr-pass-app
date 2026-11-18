package in.gndec.events.attendance;

import in.gndec.events.attendance.AttendanceDtos.Attendee;
import in.gndec.events.attendance.AttendanceDtos.MarkAbsentRequest;
import in.gndec.events.attendance.AttendanceDtos.MarkPresentRequest;
import in.gndec.events.attendance.AttendanceDtos.Summary;
import in.gndec.events.common.PageResponse;
import in.gndec.events.scan.LiveFeed;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Attendance for one event (objective 4). Organizers of the event and admins only (see SecurityConfig). */
@RestController
@RequestMapping("/api/v1/manage/events/{id}")
public class AttendanceController {

    private final AttendanceService service;
    private final LiveFeed liveFeed;

    public AttendanceController(AttendanceService service, LiveFeed liveFeed) {
        this.service = service;
        this.liveFeed = liveFeed;
    }

    @GetMapping("/attendance")
    public Summary summary(@PathVariable Long id) {
        return service.summary(id);
    }

    /** filter = ALL | PRESENT | ABSENT */
    @GetMapping("/attendance/list")
    public PageResponse<Attendee> list(@PathVariable Long id, @RequestParam(defaultValue = "ALL") String filter,
            @RequestParam(required = false) String q, @RequestParam(required = false) String dept,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(id, filter, q, dept, page, size);
    }

    @PostMapping("/attendance")
    public Attendee markPresent(@PathVariable Long id, @Valid @RequestBody MarkPresentRequest req) {
        return service.markPresent(id, req);
    }

    @PostMapping("/attendance/{registrationId}/remove")
    public Attendee markAbsent(@PathVariable Long id, @PathVariable Long registrationId, @Valid @RequestBody MarkAbsentRequest req) {
        return service.markAbsent(id, registrationId, req.reason());
    }

    /** Server-Sent Events: "hello" with the current count, then one "scan" event per scan or correction. */
    @GetMapping(path = "/live", produces = "text/event-stream")
    public ResponseEntity<SseEmitter> live(@PathVariable Long id) {
        service.managed(id);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache())
                .header("X-Accel-Buffering", "no") // ask proxies not to buffer the stream
                .body(liveFeed.subscribe(id));
    }
}
