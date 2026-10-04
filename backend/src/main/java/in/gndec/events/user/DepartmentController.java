package in.gndec.events.user;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.event.EventRepository;
import in.gndec.events.user.UserDtos.DepartmentDto;
import in.gndec.events.user.UserDtos.DepartmentRequest;
import jakarta.validation.Valid;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Departments master data (requirement O1-01). */
@RestController
public class DepartmentController {

    private final DepartmentRepository departments;
    private final StudentProfileRepository profiles;
    private final EventRepository events;
    private final AuditService audit;

    public DepartmentController(DepartmentRepository departments, StudentProfileRepository profiles, EventRepository events,
            AuditService audit) {
        this.departments = departments;
        this.profiles = profiles;
        this.events = events;
        this.audit = audit;
    }

    /** Any signed-in user (forms need the list). */
    @GetMapping("/api/v1/departments")
    public List<DepartmentDto> list() {
        return departments.findAll().stream().sorted(Comparator.comparing(Department::getCode))
                .map(d -> new DepartmentDto(d.getCode(), d.getName(), 0, 0)).toList();
    }

    @GetMapping("/api/v1/admin/departments")
    @Transactional(readOnly = true)
    public List<DepartmentDto> listWithCounts() {
        return departments.findAll().stream().sorted(Comparator.comparing(Department::getCode))
                .map(d -> new DepartmentDto(d.getCode(), d.getName(), profiles.countByDepartmentCode(d.getCode()),
                        events.countRestrictedToDepartment(d.getCode())))
                .toList();
    }

    @PostMapping("/api/v1/admin/departments")
    @Transactional
    public DepartmentDto create(@Valid @RequestBody DepartmentRequest req) {
        String code = req.code().toUpperCase(Locale.ROOT);
        if (departments.existsById(code)) {
            throw ApiException.conflict("DEPARTMENT_EXISTS", "A department with code " + code + " already exists.");
        }
        departments.save(new Department(code, req.name().trim()));
        audit.log("DEPARTMENT_CREATED", "Department", code, req.name());
        return new DepartmentDto(code, req.name().trim(), 0, 0);
    }

    @PutMapping("/api/v1/admin/departments/{code}")
    @Transactional
    public DepartmentDto rename(@PathVariable String code, @Valid @RequestBody DepartmentRequest req) {
        Department d = departments.findById(code).orElseThrow(() -> ApiException.notFound("Department"));
        d.setName(req.name().trim());
        audit.log("DEPARTMENT_UPDATED", "Department", code, req.name());
        return new DepartmentDto(code, d.getName(), profiles.countByDepartmentCode(code), events.countRestrictedToDepartment(code));
    }

    @DeleteMapping("/api/v1/admin/departments/{code}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable String code) {
        if (profiles.countByDepartmentCode(code) > 0) {
            throw ApiException.conflict("DEPARTMENT_IN_USE", "Students still belong to this department.");
        }
        if (events.countRestrictedToDepartment(code) > 0) {
            throw ApiException.conflict("DEPARTMENT_IN_USE", "Event eligibility rules still mention this department.");
        }
        departments.deleteById(code);
        audit.log("DEPARTMENT_DELETED", "Department", code, null);
        return ResponseEntity.noContent().build();
    }
}
