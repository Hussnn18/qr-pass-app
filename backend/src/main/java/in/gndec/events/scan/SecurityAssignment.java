package in.gndec.events.scan;

import in.gndec.events.event.Event;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Security staff member X may scan at gate Y for event Z. Without a row here the scanner refuses. */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "security_assignments")
public class SecurityAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "gate_id")
    private Gate gate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    public SecurityAssignment(Event event, Gate gate, User user) {
        this.event = event;
        this.gate = gate;
        this.user = user;
    }
}
