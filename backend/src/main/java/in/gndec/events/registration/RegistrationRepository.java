package in.gndec.events.registration;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface RegistrationRepository extends JpaRepository<Registration, Long>, JpaSpecificationExecutor<Registration> {

    Optional<Registration> findByEventIdAndUserId(Long eventId, Long userId);

    /** Scalar lookups that don't load the entity, so it can be read fresh after the event lock is taken. */
    @Query("select r.event.id from Registration r where r.id = :id")
    Optional<Long> findEventId(Long id);

    @Query("select r.event.id from Registration r where r.id = :id and r.user.id = :userId")
    Optional<Long> findEventIdForUser(Long id, Long userId);

    @Query("select r.id, r.event.id from Registration r where r.id in :ids")
    List<Object[]> findEventIds(Collection<Long> ids);

    @Query("select r from Registration r join fetch r.event e join fetch e.venue where r.user.id = :userId order by e.startsAt desc")
    List<Registration> findMine(Long userId);

    List<Registration> findByUserIdAndEventIdIn(Long userId, Collection<Long> eventIds);

    @Query("select r from Registration r join fetch r.user u where r.event.id = :eventId and r.status = :status order by r.registeredAt asc, r.id asc")
    List<Registration> findByEventAndStatusOldestFirst(Long eventId, Registration.Status status);

    @Query("select r.event.id, r.status, count(r) from Registration r where r.event.id in :eventIds group by r.event.id, r.status")
    List<Object[]> countByEventAndStatus(Collection<Long> eventIds);

    @Query("select count(r) from Registration r where r.event.id = :eventId and r.status = in.gndec.events.registration.Registration.Status.WAITLISTED and (r.registeredAt < :at or (r.registeredAt = :at and r.id <= :id))")
    long waitlistPosition(Long eventId, Instant at, Long id);

    @Query("select r from Registration r join fetch r.event e join fetch r.user u where e.id in :eventIds and r.status = in.gndec.events.registration.Registration.Status.PENDING order by r.registeredAt desc")
    List<Registration> findPendingForEvents(Collection<Long> eventIds);

    long countByStatus(Registration.Status status);

    /** Event cancelled: every pending, confirmed or waitlisted registration is cancelled with the organizer's reason. */
    @Modifying(flushAutomatically = true)
    @Query("update Registration r set r.status = in.gndec.events.registration.Registration.Status.CANCELLED, r.reason = :reason, r.decidedAt = :now where r.event.id = :eventId and r.status in (in.gndec.events.registration.Registration.Status.PENDING, in.gndec.events.registration.Registration.Status.CONFIRMED, in.gndec.events.registration.Registration.Status.WAITLISTED)")
    int cancelAllForEvent(Long eventId, String reason, Instant now);

    long countByEventIdAndStatusIn(Long eventId, Collection<Registration.Status> statuses);
}
