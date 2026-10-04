package in.gndec.events.user;

import in.gndec.events.user.UserDtos.AdminUser;
import in.gndec.events.user.UserDtos.Me;
import in.gndec.events.user.UserDtos.Person;
import in.gndec.events.user.UserDtos.StudentInfo;
import java.time.Instant;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    private final DepartmentRepository departments;

    public UserMapper(DepartmentRepository departments) {
        this.departments = departments;
    }

    public static String photoUrl(User u) {
        return u.getPhotoPath() == null ? null : "/api/v1/photos/" + u.getPhotoPath();
    }

    static Long millis(Instant i) {
        return i == null ? null : i.toEpochMilli();
    }

    private Map<String, String> deptNames() {
        return departments.findAll().stream().collect(Collectors.toMap(Department::getCode, Department::getName));
    }

    public StudentInfo student(User u, Map<String, String> deptNames) {
        StudentProfile p = u.getProfile();
        if (p == null) {
            return null;
        }
        return new StudentInfo(p.getUrn(), p.getDepartmentCode(), deptNames.getOrDefault(p.getDepartmentCode(), p.getDepartmentCode()),
                p.getSemester(), p.getSection(), p.getBatch(), p.getDob() == null ? null : p.getDob().toString(), p.isEnrolled());
    }

    public Me me(User u) {
        return new Me(u.getId(), u.getRole().name(), u.getFullName(), u.getEmail(), u.getPhone(), u.getUnit(), photoUrl(u),
                u.isMustChangePassword(), millis(u.getLastLoginAt()), student(u, deptNames()));
    }

    public Function<User, AdminUser> adminUser() {
        Map<String, String> names = deptNames();
        return u -> new AdminUser(u.getId(), u.getRole().name(), u.getFullName(), u.getEmail(), u.getPhone(), u.getUnit(),
                u.getStatus().name(), u.isMustChangePassword(), millis(u.getLockedUntil()), millis(u.getLastLoginAt()),
                photoUrl(u), student(u, names));
    }

    public static Person person(User u) {
        StudentProfile p = u.getProfile();
        String idLabel = p != null ? p.getUrn() : u.getEmail();
        String sub = p != null ? p.getDepartmentCode() + " · Sem " + p.getSemester() + " · Sec " + p.getSection()
                : u.getUnit() != null ? u.getUnit() : u.getRole().name();
        boolean enrolled = p == null || p.isEnrolled();
        return new Person(u.getId(), u.getRole().name(), u.getFullName(), idLabel, sub, photoUrl(u), enrolled);
    }
}
