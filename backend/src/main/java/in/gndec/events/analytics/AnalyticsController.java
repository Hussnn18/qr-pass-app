package in.gndec.events.analytics;

import in.gndec.events.analytics.AnalyticsService.Overview;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Dashboards (objective 5): admins see every event, organizers their own. */
@RestController
public class AnalyticsController {

    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    /** from / to: epoch milliseconds, applied to the event start time; both optional. */
    @GetMapping("/api/v1/manage/analytics")
    public Overview overview(@RequestParam(required = false) Long from, @RequestParam(required = false) Long to) {
        return service.overview(from, to);
    }
}
