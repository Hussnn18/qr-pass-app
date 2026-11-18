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

    List<Entry> findByEventId(Long eventId);

    @Query("select e.enteredAt from Entry e where e.eventId in :eventIds")
    List<Instant> findEntryTimes(Collection<Long> eventIds);

    @Query("select e.gateId, count(e) from Entry e where e.eventId in :eventIds group by e.gateId")
    List<Object[]> countByGates(Collection<Long> eventIds);

    /** event id, department code, semester, entries — for department- and semester-wise attendance. */
    @Query("""
            select e.eventId, p.departmentCode, p.semester, count(e)
              from Entry e join Registration r on r.id = e.registrationId join r.user u left join u.profile p
             where e.eventId in :eventIds
             group by e.eventId, p.departmentCode, p.semester
            """)
    List<Object[]> countByEventDepartmentSemester(Collection<Long> eventIds);

    long countByEventIdAndGateId(Long eventId, Long gateId);

    long countByEnteredAtAfter(Instant after);

    @Query("select e.eventId, count(e) from Entry e where e.eventId in :eventIds group by e.eventId")
    List<Object[]> countByEvents(Collection<Long> eventIds);

    @Query("select e.eventId, e.gateId, count(e) from Entry e where e.eventId in :eventIds group by e.eventId, e.gateId")
    List<Object[]> countByEventsAndGates(Collection<Long> eventIds);
}
