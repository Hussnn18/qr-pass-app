package in.gndec.events.user;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Request and response shapes for users. Timestamps are epoch milliseconds. */
public final class UserDtos {

    private UserDtos() {
    }

    public record StudentInfo(String urn, String dept, String deptName, int semester, String section,
            Integer batch, String dob, boolean enrolled) {
    }

    public record Me(Long id, String role, String name, String email, String phone, String unit, String photoUrl,
            boolean mustChangePassword, Long lastLoginAt, StudentInfo student) {
    }

    /** Compact person card used in participant lists, passes and scan results. */
    public record Person(Long id, String role, String name, String idLabel, String sub, String photoUrl, boolean enrolled) {
    }

    public record AdminUser(Long id, String role, String name, String email, String phone, String unit, String status,
            boolean mustChangePassword, Long lockedUntil, Long lastLoginAt, String photoUrl, StudentInfo student) {
    }

    public record StudentInput(
            @NotBlank @Pattern(regexp = "\\d{7}", message = "URN must be 7 digits") String urn,
            @NotBlank String dept,
            @NotNull @Min(1) @Max(8) Integer semester,
            @NotBlank @Pattern(regexp = "[A-D]", message = "Section must be A, B, C or D") String section,
            Integer batch,
            @Pattern(regexp = "(\\d{4}-\\d{2}-\\d{2})?", message = "Date of birth must be YYYY-MM-DD") String dob) {
    }

    public record CreateUserRequest(
            @NotNull Role role,
            @NotBlank @Size(min = 3, max = 120) String name,
            @NotBlank @Email @Size(max = 160) String email,
            @Size(max = 30) String phone,
            @Size(max = 120) String unit,
            @Valid StudentInput student) {
    }

    public record UpdateUserRequest(
            @NotBlank @Size(min = 3, max = 120) String name,
            @NotBlank @Email @Size(max = 160) String email,
            @Size(max = 30) String phone,
            @Size(max = 120) String unit,
            @Valid StudentInput student) {
    }

    public record CreatedUser(AdminUser user, String tempPassword) {
    }

    public record TempPassword(String tempPassword) {
    }

    public record StatusRequest(@NotNull User.Status status) {
    }

    public record EnrollmentRequest(boolean enrolled) {
    }

    public record UpdateMeRequest(@Size(max = 30) String phone) {
    }

    public record ChangePasswordRequest(String currentPassword, @NotBlank String newPassword) {
    }

    public record DepartmentDto(String code, String name, long students, long events) {
    }

    public record DepartmentRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z]{2,10}", message = "Code must be 2-10 letters") String code,
            @NotBlank @Size(min = 3, max = 120) String name) {
    }

    public record ImportRow(int line, String urn, String name, String email, String phone, String dept,
            Integer semester, String section, Integer batch, String dob, List<String> errors) {
    }

    public record ImportPreview(List<ImportRow> rows, int valid, int invalid) {
    }

    public record ImportRequest(@NotNull List<ImportRow> rows) {
    }

    public record Credential(String urn, String name, String email, String tempPassword) {
    }

    public record ImportResult(int added, int skipped, List<Credential> credentials) {
    }
}
