package in.gndec.events.registration;

import in.gndec.events.registration.RegistrationService.BulkResult;
import in.gndec.events.registration.RegistrationService.MyRegistrationView;
import in.gndec.events.registration.RegistrationService.RegisterResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RegistrationController {

    public record RegisterRequest(@Size(max = 300) String note) {
    }

    public record IdsRequest(@NotEmpty List<Long> ids) {
    }

    public record RejectRequest(@NotEmpty List<Long> ids, @NotBlank @Size(max = 300) String reason) {
    }

    public record ReasonRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record BulkAssignRequest(List<String> urns) {
    }

    private final RegistrationService service;

    public RegistrationController(RegistrationService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/events/{id}/registrations")
    public RegisterResult register(@PathVariable Long id, @Valid @RequestBody(required = false) RegisterRequest req) {
        return service.register(id, req == null ? null : req.note());
    }

    @GetMapping("/api/v1/me/registrations")
    public List<MyRegistrationView> mine() {
        return service.mine();
    }

    @PostMapping("/api/v1/me/registrations/{id}/cancel")
    public Map<String, String> cancel(@PathVariable Long id) {
        return Map.of("message", service.cancelMine(id));
    }

    @PostMapping("/api/v1/manage/registrations/approve")
    public BulkResult approve(@Valid @RequestBody IdsRequest req) {
        return service.approve(req.ids());
    }

    @PostMapping("/api/v1/manage/registrations/reject")
    public BulkResult reject(@Valid @RequestBody RejectRequest req) {
        return service.reject(req.ids(), req.reason());
    }

    @PostMapping("/api/v1/manage/registrations/{id}/remove")
    public Map<String, String> remove(@PathVariable Long id, @Valid @RequestBody ReasonRequest req) {
        return Map.of("message", service.remove(id, req.reason()));
    }

    @PostMapping("/api/v1/manage/events/{id}/bulk-assign")
    public BulkResult bulkAssign(@PathVariable Long id, @RequestBody(required = false) BulkAssignRequest req) {
        return service.bulkAssign(id, req == null ? null : req.urns());
    }
}
