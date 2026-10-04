package in.gndec.events.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "departments")
public class Department {

    @Id
    private String code;

    @Column(nullable = false)
    private String name;

    public Department(String code, String name) {
        this.code = code;
        this.name = name;
    }
}
