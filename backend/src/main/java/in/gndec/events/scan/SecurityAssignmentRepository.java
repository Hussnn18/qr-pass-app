package in.gndec.events.scan;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface SecurityAssignmentRepository extends JpaRepository<SecurityAssignment, Long> {

    boolean existsByEventIdAndGateIdAndUserId(Long eventId, Long gateId, Long userId);

    @Query("select a from SecurityAssignment a join fetch a.event e join fetch e.venue join fetch a.gate where a.user.id = :userId")
    List<SecurityAssignment> findForUser(Long userId);

    @Query("select a from SecurityAssignment a join fetch a.user join fetch a.gate where a.event.id in :eventIds")
    List<SecurityAssignment> findForEvents(Collection<Long> eventIds);

    @Modifying(flushAutomatically = true)
    @Query("delete from SecurityAssignment a where a.event.id = :eventId and a.gate.id = :gateId")
    int deleteForGate(Long eventId, Long gateId);

    @Modifying(flushAutomatically = true)
    @Query("delete from SecurityAssignment a where a.event.id = :eventId")
    int deleteForEvent(Long eventId);

    @Modifying(flushAutomatically = true)
    @Query("delete from SecurityAssignment a where a.event.id = :eventId and a.gate.id not in :keepGateIds")
    int deleteOutsideGates(Long eventId, Collection<Long> keepGateIds);
}
