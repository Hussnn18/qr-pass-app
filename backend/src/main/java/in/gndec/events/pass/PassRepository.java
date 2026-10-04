package in.gndec.events.pass;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PassRepository extends JpaRepository<Pass, Long> {

    Optional<Pass> findByTokenHash(String tokenHash);

    Optional<Pass> findByCode(String code);

    boolean existsByCode(String code);

    List<Pass> findByRegistrationIdAndStatus(Long registrationId, Pass.Status status);

    List<Pass> findByRegistrationIdIn(Collection<Long> registrationIds);

    @Query("select p from Pass p join fetch p.event e join fetch e.venue join fetch p.user where p.user.id = :userId order by e.startsAt asc")
    List<Pass> findMine(Long userId);

    List<Pass> findByUserIdAndEventIdOrderByIssuedAtDesc(Long userId, Long eventId);

    List<Pass> findByUserIdAndStatus(Long userId, Pass.Status status);

    /**
     * The atomic "claim" at the gate (objective 3, repeated-access prevention): only one scan can move
     * a pass from ACTIVE to USED. A second gate scanning at the same moment gets 0 rows back.
     */
    @Modifying(flushAutomatically = true)
    @Query("update Pass p set p.status = in.gndec.events.pass.Pass.Status.USED, p.usedAt = :now where p.id = :id and p.status = in.gndec.events.pass.Pass.Status.ACTIVE")
    int claim(Long id, Instant now);

    @Modifying(flushAutomatically = true)
    @Query("update Pass p set p.status = in.gndec.events.pass.Pass.Status.REVOKED, p.revokedAt = :now, p.revokedReason = :reason where p.registration.id = :registrationId and p.status = in.gndec.events.pass.Pass.Status.ACTIVE")
    int revokeActiveForRegistration(Long registrationId, Instant now, String reason);

    @Modifying(flushAutomatically = true)
    @Query("update Pass p set p.status = in.gndec.events.pass.Pass.Status.REVOKED, p.revokedAt = :now, p.revokedReason = :reason where p.event.id = :eventId and p.status = in.gndec.events.pass.Pass.Status.ACTIVE")
    int revokeAllForEvent(Long eventId, Instant now, String reason);

    @Modifying(flushAutomatically = true)
    @Query("update Pass p set p.status = in.gndec.events.pass.Pass.Status.EXPIRED where p.status = in.gndec.events.pass.Pass.Status.ACTIVE and p.event.id in (select e.id from Event e where e.endsAt < :now or e.status = in.gndec.events.event.Event.Status.COMPLETED)")
    int expireEnded(Instant now);

    @Modifying(flushAutomatically = true)
    @Query("update Pass p set p.status = in.gndec.events.pass.Pass.Status.EXPIRED where p.event.id = :eventId and p.status = in.gndec.events.pass.Pass.Status.ACTIVE")
    int expireForEvent(Long eventId);
}
