package in.gndec.events.venue;

import in.gndec.events.common.CurrentUser;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Interactive campus map (objective 4): every active place with its entry gates and the upcoming events
 * held there, so participants can find their venue. Open to every signed-in user.
 */
@RestController
public class CampusController {

    public record PlaceEvent(Long id, String title, String category, long startsAt, long endsAt, boolean live) {
    }

    public record Place(Long id, String name, String type, String building, String floor, String description, Integer capacity,
            boolean canHostEvents, Double lat, Double lng, List<String> gates, List<PlaceEvent> events) {
    }

    private static final int EVENTS_PER_PLACE = 5;

    private final VenueRepository venues;
    private final EventRepository events;

    public CampusController(VenueRepository venues, EventRepository events) {
        this.venues = venues;
        this.events = events;
    }

    @GetMapping("/api/v1/campus/places")
    @Transactional(readOnly = true)
    public List<Place> places() {
        Instant now = Instant.now();
        boolean guest = CurrentUser.hasRole("GUEST");
        Map<Long, List<Event>> upcoming = events.findByStatusIn(EnumSet.of(Event.Status.PUBLISHED, Event.Status.CLOSED)).stream()
                .filter(e -> e.getEndsAt().isAfter(now))
                .filter(e -> !guest || e.isAllowOutsiders())
                .sorted(Comparator.comparing(Event::getStartsAt))
                .collect(Collectors.groupingBy(e -> e.getVenue().getId()));
        return venues.findAllWithGates().stream()
                .filter(Venue::isActive)
                .sorted(Comparator.comparing(Venue::getName, String.CASE_INSENSITIVE_ORDER))
                .map(v -> new Place(v.getId(), v.getName(), v.getType().name(), v.getBuilding(), v.getFloor(), v.getDescription(),
                        v.getCapacity(), v.isCanHostEvents(), v.getLatitude(), v.getLongitude(),
                        v.getGates().stream().map(Gate::getName).toList(),
                        upcoming.getOrDefault(v.getId(), List.of()).stream().limit(EVENTS_PER_PLACE)
                                .map(e -> new PlaceEvent(e.getId(), e.getTitle(), e.getCategory().name(), e.getStartsAt().toEpochMilli(),
                                        e.getEndsAt().toEpochMilli(), !now.isBefore(e.entryOpensAt())))
                                .toList()))
                .toList();
    }
}
