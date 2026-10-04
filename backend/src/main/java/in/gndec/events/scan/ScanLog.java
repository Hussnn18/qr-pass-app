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

/** Every scan attempt, allowed or not (requirement O3-10). */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "scan_logs")
public class ScanLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false)
    private Long eventId;

    @Column(name = "gate_id", nullable = false)
    private Long gateId;

    @Column(name = "pass_id")
    private Long passId;

    @Column(name = "participant_id")
    private Long participantId;

    @Column(name = "scanned_by", nullable = false)
    private Long scannedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ScanResult result;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Entry.Method method;

    private String deviceId;

    @Column(nullable = false)
    private Instant scannedAt;
}
