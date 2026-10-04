package in.gndec.events.venue;

import in.gndec.events.common.AuditedEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "venues")
public class Venue extends AuditedEntity {

    public enum Type { ACADEMIC, ADMIN, LAB, AUDITORIUM, SEMINAR_HALL, LIBRARY, SPORTS, CAFETERIA, PARKING, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Type type;

    private String building;
    private String floor;
    private String description;
    private Integer capacity;

    @Column(name = "can_host_events", nullable = false)
    private boolean canHostEvents = true;

    @Column(nullable = false)
    private boolean active = true;

    /** Used by the campus map in objective 4. */
    private Double latitude;
    private Double longitude;

    @OneToMany(mappedBy = "venue", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id")
    private List<Gate> gates = new ArrayList<>();

    public Gate addGate(String name) {
        Gate g = new Gate();
        g.setVenue(this);
        g.setName(name);
        gates.add(g);
        return g;
    }
}
