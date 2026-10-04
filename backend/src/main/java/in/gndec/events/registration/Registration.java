package in.gndec.events.registration;

import in.gndec.events.event.Event;
import in.gndec.events.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicUpdate;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "registrations")
@DynamicUpdate
public class Registration {

    public enum Status { PENDING, CONFIRMED, WAITLISTED, REJECTED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    /** What the participant wrote when requesting a seat (approval events). */
    private String note;

    /** Why it was rejected / cancelled. */
    private String reason;

    @Column(nullable = false)
    private Instant registeredAt;

    private Instant decidedAt;

    /** User id of the organizer who decided, or null when the system decided. */
    private Long decidedBy;

    public boolean isActive() {
        return status == Status.PENDING || status == Status.CONFIRMED || status == Status.WAITLISTED;
    }
}
