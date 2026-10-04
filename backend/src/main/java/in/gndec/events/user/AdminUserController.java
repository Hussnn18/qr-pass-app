package in.gndec.events.user;

import in.gndec.events.common.PageResponse;
import in.gndec.events.user.UserDtos.AdminUser;
import in.gndec.events.user.UserDtos.CreateUserRequest;
import in.gndec.events.user.UserDtos.CreatedUser;
import in.gndec.events.user.UserDtos.EnrollmentRequest;
import in.gndec.events.user.UserDtos.ImportPreview;
import in.gndec.events.user.UserDtos.ImportRequest;
import in.gndec.events.user.UserDtos.ImportResult;
import in.gndec.events.user.UserDtos.StatusRequest;
import in.gndec.events.user.UserDtos.TempPassword;
import in.gndec.events.user.UserDtos.UpdateUserRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Admin only (enforced for /api/v1/admin/** in SecurityConfig). */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminUserController {

    private final AdminUserService service;
    private final StudentImportService imports;

    public AdminUserController(AdminUserService service, StudentImportService imports) {
        this.service = service;
        this.imports = imports;
    }

    @GetMapping("/users")
    public PageResponse<AdminUser> search(@RequestParam(required = false) Role role,
            @RequestParam(required = false) User.Status status, @RequestParam(required = false) String q,
            @RequestParam(required = false) String dept, @RequestParam(required = false) Integer semester,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "15") int size) {
        return service.search(role, status, q, dept, semester, page, size);
    }

    @GetMapping("/users/counts")
    public Map<String, Long> counts() {
        return service.counts();
    }

    @PostMapping("/users")
    public CreatedUser create(@Valid @RequestBody CreateUserRequest req) {
        return service.create(req);
    }

    @PatchMapping("/users/{id}")
    public AdminUser update(@PathVariable Long id, @Valid @RequestBody UpdateUserRequest req) {
        return service.update(id, req);
    }

    @PatchMapping("/users/{id}/status")
    public AdminUser status(@PathVariable Long id, @Valid @RequestBody StatusRequest req) {
        return service.setStatus(id, req.status());
    }

    @PatchMapping("/users/{id}/enrollment")
    public AdminUser enrollment(@PathVariable Long id, @RequestBody EnrollmentRequest req) {
        return service.setEnrollment(id, req.enrolled());
    }

    @PostMapping("/users/{id}/reset-password")
    public TempPassword resetPassword(@PathVariable Long id) {
        return new TempPassword(service.resetPassword(id));
    }

    @PostMapping(path = "/students/import/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportPreview preview(@RequestParam("file") MultipartFile file) {
        return imports.preview(file);
    }

    @PostMapping("/students/import")
    public ImportResult importStudents(@Valid @RequestBody ImportRequest req) {
        return imports.commit(req.rows());
    }
}
