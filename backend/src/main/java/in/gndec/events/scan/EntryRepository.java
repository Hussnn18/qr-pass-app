package in.gndec.events.scan;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface EntryRepository extends JpaRepository<Entry, Long> {

    Optional<Entry> findByRegistrationId(Long registrationId);

    List<Entry> findByRegistrationIdIn(Collection<Long> registrationIds);

    long countByEventId(Long eventId);

    long countByEventIdAndGateId(Long eventId, Long gateId);

    long countByEnteredAtAfter(Instant after);

    @Query("select e.eventId, count(e) from Entry e where e.eventId in :eventIds group by e.eventId")
    List<Object[]> countByEvents(Collection<Long> eventIds);

    @Query("select e.eventId, e.gateId, count(e) from Entry e where e.eventId in :eventIds group by e.eventId, e.gateId")
    List<Object[]> countByEventsAndGates(Collection<Long> eventIds);
}
