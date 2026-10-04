package in.gndec.events.user;

import in.gndec.events.auth.TokenService;
import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.PageResponse;
import in.gndec.events.common.Secrets;
import in.gndec.events.user.UserDtos.AdminUser;
import in.gndec.events.user.UserDtos.CreateUserRequest;
import in.gndec.events.user.UserDtos.CreatedUser;
import in.gndec.events.user.UserDtos.StudentInput;
import in.gndec.events.user.UserDtos.UpdateUserRequest;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Admin control panel: create staff and students, deactivate, unlock, enrollment, password resets. */
@Service
public class AdminUserService {

    private final UserRepository users;
    private final StudentProfileRepository profiles;
    private final DepartmentRepository departments;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper mapper;
    private final AuditService audit;
    private final TokenService tokens;

    public AdminUserService(UserRepository users, StudentProfileRepository profiles, DepartmentRepository departments,
            PasswordEncoder passwordEncoder, UserMapper mapper, AuditService audit, TokenService tokens) {
        this.users = users;
        this.profiles = profiles;
        this.departments = departments;
        this.passwordEncoder = passwordEncoder;
        this.mapper = mapper;
        this.audit = audit;
        this.tokens = tokens;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminUser> search(Role role, User.Status status, String q, String dept, Integer semester, int page, int size) {
        Specification<User> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            Join<User, StudentProfile> p = root.join("profile", JoinType.LEFT);
            if (role != null) {
                ps.add(cb.equal(root.get("role"), role));
            }
            if (status != null) {
                ps.add(cb.equal(root.get("status"), status));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(cb.like(cb.lower(root.get("fullName")), like), cb.like(cb.lower(root.get("email")), like),
                        cb.like(p.get("urn"), like)));
            }
            if (dept != null && !dept.isBlank()) {
                ps.add(cb.equal(p.get("departmentCode"), dept));
            }
            if (semester != null) {
                ps.add(cb.equal(p.get("semester"), semester));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Sort sort = Sort.by("role").and(Sort.by("fullName"));
        return PageResponse.of(users.findAll(spec, PageResponse.request(page, size, sort)), mapper.adminUser());
    }

    @Transactional(readOnly = true)
    public Map<String, Long> counts() {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("ALL", users.count());
        for (Role r : Role.values()) {
            m.put(r.name(), users.countByRole(r));
        }
        m.put("LOCKED", users.countByStatus(User.Status.LOCKED));
        return m;
    }

    @Transactional
    public CreatedUser create(CreateUserRequest req) {
        if (req.role() == Role.GUEST) {
            throw ApiException.badRequest("ROLE_NOT_AVAILABLE", "Guest accounts are not part of this phase.");
        }
        if (users.existsByEmailIgnoreCase(req.email())) {
            throw ApiException.conflict("EMAIL_TAKEN", "That email is already used by another account.");
        }
        User u = new User();
        u.setRole(req.role());
        u.setFullName(req.name().trim());
        u.setEmail(req.email().trim().toLowerCase());
        u.setPhone(blankToNull(req.phone()));
        u.setUnit(req.role() == Role.STUDENT ? null : blankToNull(req.unit()));
        String temp = Secrets.tempPassword();
        u.setPasswordHash(passwordEncoder.encode(temp));
        u.setMustChangePassword(true);
        if (req.role() == Role.STUDENT) {
            if (req.student() == null) {
                throw ApiException.badRequest("STUDENT_DETAILS_REQUIRED", "Students need a URN, department, semester and section.");
            }
            if (profiles.existsByUrn(req.student().urn())) {
                throw ApiException.conflict("URN_TAKEN", "A student with that URN already exists.");
            }
            StudentProfile p = new StudentProfile();
            p.setUrn(req.student().urn());
            applyStudent(p, req.student());
            u.attachProfile(p);
        }
        users.save(u);
        audit.log("USER_CREATED", "User", u.getId(), u.getRole() + ": " + u.getFullName());
        return new CreatedUser(mapper.adminUser().apply(u), temp);
    }

    @Transactional
    public AdminUser update(Long id, UpdateUserRequest req) {
        User u = find(id);
        if (!u.getEmail().equalsIgnoreCase(req.email()) && users.existsByEmailIgnoreCase(req.email())) {
            throw ApiException.conflict("EMAIL_TAKEN", "That email is already used by another account.");
        }
        u.setFullName(req.name().trim());
        u.setEmail(req.email().trim().toLowerCase());
        u.setPhone(blankToNull(req.phone()));
        if (u.isStudent()) {
            if (req.student() != null) {
                applyStudent(u.getProfile(), req.student());
            }
        } else {
            u.setUnit(blankToNull(req.unit()));
        }
        audit.log("USER_UPDATED", "User", u.getId(), u.getFullName());
        return mapper.adminUser().apply(u);
    }

    @Transactional
    public AdminUser setStatus(Long id, User.Status status) {
        User u = find(id);
        if (u.getId().equals(CurrentUser.id()) && status != User.Status.ACTIVE) {
            throw ApiException.badRequest("SELF_DEACTIVATE", "You can't deactivate your own account.");
        }
        if (status == User.Status.LOCKED) {
            throw ApiException.badRequest("INVALID_STATUS", "Accounts are locked automatically; choose ACTIVE or INACTIVE.");
        }
        u.setStatus(status);
        u.setFailedLogins(0);
        u.setLockedUntil(null);
        if (status == User.Status.INACTIVE) {
            tokens.revokeAll(u.getId());
        }
        audit.log(status == User.Status.ACTIVE ? "USER_ACTIVATED" : "USER_DEACTIVATED", "User", u.getId(), u.getFullName());
        return mapper.adminUser().apply(u);
    }

    @Transactional
    public AdminUser setEnrollment(Long id, boolean enrolled) {
        User u = find(id);
        if (!u.isStudent()) {
            throw ApiException.badRequest("NOT_A_STUDENT", "Only students have an enrollment status.");
        }
        u.getProfile().setEnrolled(enrolled);
        audit.log(enrolled ? "ENROLLMENT_RESTORED" : "ENROLLMENT_SUSPENDED", "User", u.getId(), u.getFullName());
        return mapper.adminUser().apply(u);
    }

    @Transactional
    public String resetPassword(Long id) {
        User u = find(id);
        String temp = Secrets.tempPassword();
        u.setPasswordHash(passwordEncoder.encode(temp));
        u.setMustChangePassword(true);
        u.setFailedLogins(0);
        u.setLockedUntil(null);
        if (u.getStatus() == User.Status.LOCKED) {
            u.setStatus(User.Status.ACTIVE);
        }
        tokens.revokeAll(u.getId());
        audit.log("PASSWORD_RESET_BY_ADMIN", "User", u.getId(), u.getFullName());
        return temp;
    }

    void applyStudent(StudentProfile p, StudentInput in) {
        if (!departments.existsById(in.dept())) {
            throw ApiException.badRequest("UNKNOWN_DEPARTMENT", "Unknown department " + in.dept() + ".");
        }
        p.setDepartmentCode(in.dept());
        p.setSemester(in.semester());
        p.setSection(in.section());
        p.setBatch(in.batch());
        p.setDob(in.dob() == null || in.dob().isBlank() ? null : LocalDate.parse(in.dob()));
    }

    private User find(Long id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
