package in.gndec.events.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Academic details for STUDENT accounts. Shares its primary key with users.id. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "student_profiles")
public class StudentProfile {

    @Id
    private Long userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private String urn;

    @Column(name = "department_code", nullable = false)
    private String departmentCode;

    @Column(nullable = false)
    private int semester;

    @Column(nullable = false)
    private String section;

    private Integer batch;

    private LocalDate dob;

    @Column(nullable = false)
    private boolean enrolled = true;
}
