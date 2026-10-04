package in.gndec.events.event;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface EventRepository extends JpaRepository<Event, Long>, JpaSpecificationExecutor<Event> {

    /**
     * Locks the event row (SELECT ... FOR UPDATE) for the rest of the transaction. Every change to an
     * event's registrations takes this lock first, so seat counts, waitlist promotion and approvals for
     * the same event are processed one at a time.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Event e where e.id = :id")
    Optional<Event> lockById(Long id);

    /**
     * Takes one seat if any is left. Returns 1 when the seat was taken, 0 when the event is full.
     * The database row lock makes concurrent registrations queue up, so the count can never pass capacity.
     */
    @Modifying(flushAutomatically = true)
    @Query("update Event e set e.confirmedCount = e.confirmedCount + 1 where e.id = :id and e.confirmedCount < e.capacity")
    int claimSeat(Long id);

    @Modifying(flushAutomatically = true)
    @Query("update Event e set e.confirmedCount = e.confirmedCount - 1 where e.id = :id and e.confirmedCount > 0")
    int releaseSeat(Long id);

    @Modifying(flushAutomatically = true)
    @Query("update Event e set e.confirmedCount = 0 where e.id = :id")
    int resetSeats(Long id);

    /** Rebuilds every counter from the registrations table (used after seeding demo data). */
    @Modifying(flushAutomatically = true)
    @Query(value = "update events e set confirmed_count = (select count(*) from registrations r where r.event_id = e.id and r.status = 'CONFIRMED')", nativeQuery = true)
    int recountSeats();

    @Query("""
            select e from Event e where e.venue.id = :venueId and e.id <> :excludeId
              and e.status in (in.gndec.events.event.Event.Status.PUBLISHED, in.gndec.events.event.Event.Status.CLOSED)
              and e.startsAt < :endsAt and e.endsAt > :startsAt
            """)
    List<Event> findVenueClashes(Long venueId, Long excludeId, Instant startsAt, Instant endsAt);

    @Query("select distinct e from Event e join e.organizers o where o.id = :userId")
    List<Event> findByOrganizer(Long userId);

    List<Event> findByStatusIn(Collection<Event.Status> statuses);

    long countByStatusAndStartsAtAfter(Event.Status status, Instant after);

    long countByVenueId(Long venueId);

    @Query("select count(distinct e) from Event e join e.eligibleDepartments d where d = :code")
    long countRestrictedToDepartment(String code);
}
