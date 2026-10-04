package in.gndec.events.event;

import in.gndec.events.common.PageResponse;
import in.gndec.events.event.EventDtos.EligibilityCheck;
import in.gndec.events.event.EventDtos.EventView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Event discovery for every signed-in user. */
@RestController
@RequestMapping("/api/v1/events")
public class EventController {

    private final EventService service;

    public EventController(EventService service) {
        this.service = service;
    }

    /** when = upcoming (default) | week | month | past | all */
    @GetMapping
    public PageResponse<EventView> browse(@RequestParam(required = false) String q,
            @RequestParam(required = false) Event.Category category, @RequestParam(required = false) String when,
            @RequestParam(defaultValue = "false") boolean eligibleOnly, @RequestParam(defaultValue = "false") boolean openOnly,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "9") int size) {
        return service.browse(q, category, when, eligibleOnly, openOnly, page, size);
    }

    @GetMapping("/{id}")
    public EventView detail(@PathVariable Long id) {
        return service.detail(id);
    }

    /** Why the signed-in student can or can't join, rule by rule. */
    @GetMapping("/{id}/eligibility")
    public EligibilityCheck eligibility(@PathVariable Long id) {
        return service.checkEligibility(id);
    }
}
