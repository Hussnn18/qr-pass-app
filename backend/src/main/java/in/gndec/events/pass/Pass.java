package in.gndec.events.pass;

import in.gndec.events.event.Event;
import in.gndec.events.registration.Registration;
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

/**
 * A digital entry pass. The QR shows "EQR1:" + a random 32-byte token. Only SHA-256(token) is used for
 * lookups; the token itself is kept AES-GCM encrypted so the owner can reopen the QR later.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "passes")
@DynamicUpdate
public class Pass {

    public enum Status { ACTIVE, USED, REVOKED, EXPIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "registration_id")
    private Registration registration;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "token_hash", nullable = false)
    private String tokenHash;

    @Column(name = "token_enc", nullable = false)
    private String tokenEnc;

    /** Short code printed under the QR for manual entry, e.g. GN-7F3K-92QA. */
    @Column(nullable = false)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ACTIVE;

    @Column(nullable = false)
    private Instant issuedAt;

    private Instant usedAt;
    private Instant revokedAt;
    private String revokedReason;
}
