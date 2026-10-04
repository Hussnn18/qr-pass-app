package in.gndec.events.venue;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface GateRepository extends JpaRepository<Gate, Long> {

    @Query(value = "select count(*) from event_gates where gate_id = :gateId", nativeQuery = true)
    long countEventUses(Long gateId);
}
