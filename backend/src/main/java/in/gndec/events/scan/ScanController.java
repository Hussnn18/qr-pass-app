package in.gndec.events.scan;

import in.gndec.events.common.PageResponse;
import in.gndec.events.scan.ScanService.ScanLogView;
import in.gndec.events.scan.ScanService.ScanOption;
import in.gndec.events.scan.ScanService.Summary;
import in.gndec.events.scan.ScanService.VerifyRequest;
import in.gndec.events.scan.ScanService.VerifyResult;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Security staff, organizers and admins (enforced for /api/v1/scan/** in SecurityConfig). */
@RestController
@RequestMapping("/api/v1/scan")
public class ScanController {

    private final ScanService service;

    public ScanController(ScanService service) {
        this.service = service;
    }

    /** Send either "qr" (the scanned text) or "code" (pass code / URN typed by hand). */
    @PostMapping("/verify")
    public VerifyResult verify(@Valid @RequestBody VerifyRequest req) {
        return service.verify(req);
    }

    /** Event + gate combinations the caller may scan at. */
    @GetMapping("/assignments")
    public List<ScanOption> assignments(@RequestParam(defaultValue = "false") boolean includePast) {
        return service.options(includePast);
    }

    /** result = FAIL (all rejections) or one ScanResult name */
    @GetMapping("/history")
    public PageResponse<ScanLogView> history(@RequestParam(required = false) Long eventId,
            @RequestParam(required = false) String result, @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.history(eventId, result, page, size);
    }

    @GetMapping("/summary")
    public Summary summary() {
        return service.summary();
    }
}
