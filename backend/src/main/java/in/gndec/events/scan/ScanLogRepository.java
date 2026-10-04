package in.gndec.events.scan;

import java.time.Instant;
import java.util.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ScanLogRepository extends JpaRepository<ScanLog, Long> {

    @Query("""
            select l from ScanLog l
             where (:allEvents = true or l.eventId in :eventIds)
               and (:scannedBy is null or l.scannedBy = :scannedBy)
               and (:eventId is null or l.eventId = :eventId)
               and (:onlyFailures = false or l.result <> in.gndec.events.scan.ScanResult.SUCCESS)
               and (:result is null or l.result = :result)
            """)
    Page<ScanLog> search(boolean allEvents, Collection<Long> eventIds, Long scannedBy, Long eventId,
            boolean onlyFailures, ScanResult result, Pageable pageable);

    long countByScannedByAndScannedAtAfterAndResult(Long scannedBy, Instant after, ScanResult result);

    long countByScannedByAndScannedAtAfter(Long scannedBy, Instant after);

    long countByEventId(Long eventId);

    long countByEventIdAndResult(Long eventId, ScanResult result);
}
