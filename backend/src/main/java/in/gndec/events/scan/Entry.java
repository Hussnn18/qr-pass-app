package in.gndec.events.scan;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One row per participant who entered an event (UNIQUE registration_id). Objective 3 needs it to
 * refuse repeated entry; objective 4 builds attendance reports on top of it.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "entries")
public class Entry {

    public enum Method { QR, MANUAL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "registration_id", nullable = false)
    private Long registrationId;

    @Column(name = "pass_id")
    private Long passId;

    @Column(name = "event_id", nullable = false)
    private Long eventId;

    @Column(name = "gate_id", nullable = false)
    private Long gateId;

    @Column(name = "scanned_by", nullable = false)
    private Long scannedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Method method;

    @Column(nullable = false)
    private Instant enteredAt;
}
