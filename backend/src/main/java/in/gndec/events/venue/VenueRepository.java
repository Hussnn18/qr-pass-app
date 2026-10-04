package in.gndec.events.venue;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VenueRepository extends JpaRepository<Venue, Long> {

    @Query("select distinct v from Venue v left join fetch v.gates order by v.name")
    List<Venue> findAllWithGates();

    @Query("select distinct v from Venue v left join fetch v.gates where v.active = true and v.canHostEvents = true order by v.name")
    List<Venue> findEventVenues();
}
