package in.gndec.events.venue;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.event.EventRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Venues and their entry gates (requirements O1-02, O1-03). */
@RestController
public class VenueController {

    public record GateDto(Long id, String name) {
    }

    public record VenueDto(Long id, String name, String type, String building, String floor, String description,
            Integer capacity, boolean canHostEvents, boolean active, Double lat, Double lng, List<GateDto> gates, long events) {
    }

    public record VenueRequest(
            @NotBlank @Size(max = 120) String name,
            @NotNull Venue.Type type,
            @Size(max = 120) String building,
            @Size(max = 30) String floor,
            @Size(max = 500) String description,
            @Min(1) Integer capacity,
            boolean canHostEvents,
            @DecimalMin("-90") @DecimalMax("90") Double lat,
            @DecimalMin("-180") @DecimalMax("180") Double lng) {
    }

    public record GateRequest(@NotBlank @Size(max = 80) String name) {
    }

    public record ActiveRequest(boolean active) {
    }

    private final VenueRepository venues;
    private final GateRepository gates;
    private final EventRepository events;
    private final AuditService audit;

    public VenueController(VenueRepository venues, GateRepository gates, EventRepository events, AuditService audit) {
        this.venues = venues;
        this.gates = gates;
        this.events = events;
        this.audit = audit;
    }

    private VenueDto dto(Venue v) {
        return new VenueDto(v.getId(), v.getName(), v.getType().name(), v.getBuilding(), v.getFloor(), v.getDescription(),
                v.getCapacity(), v.isCanHostEvents(), v.isActive(), v.getLatitude(), v.getLongitude(),
                v.getGates().stream().map(g -> new GateDto(g.getId(), g.getName())).toList(), events.countByVenueId(v.getId()));
    }

    /** Venues an organizer can pick in the event wizard. */
    @GetMapping("/api/v1/manage/venues")
    @Transactional(readOnly = true)
    public List<VenueDto> eventVenues() {
        return venues.findEventVenues().stream().map(this::dto).toList();
    }

    @GetMapping("/api/v1/admin/venues")
    @Transactional(readOnly = true)
    public List<VenueDto> all() {
        return venues.findAllWithGates().stream().map(this::dto).toList();
    }

    @PostMapping("/api/v1/admin/venues")
    @Transactional
    public VenueDto create(@Valid @RequestBody VenueRequest req) {
        Venue v = new Venue();
        apply(v, req);
        venues.save(v);
        audit.log("VENUE_CREATED", "Venue", v.getId(), v.getName());
        return dto(v);
    }

    @PutMapping("/api/v1/admin/venues/{id}")
    @Transactional
    public VenueDto update(@PathVariable Long id, @Valid @RequestBody VenueRequest req) {
        Venue v = find(id);
        apply(v, req);
        audit.log("VENUE_UPDATED", "Venue", v.getId(), v.getName());
        return dto(v);
    }

    @PatchMapping("/api/v1/admin/venues/{id}/active")
    @Transactional
    public VenueDto setActive(@PathVariable Long id, @RequestBody ActiveRequest req) {
        Venue v = find(id);
        v.setActive(req.active());
        audit.log(req.active() ? "VENUE_ACTIVATED" : "VENUE_DEACTIVATED", "Venue", v.getId(), v.getName());
        return dto(v);
    }

    @DeleteMapping("/api/v1/admin/venues/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        Venue v = find(id);
        if (events.countByVenueId(id) > 0) {
            throw ApiException.conflict("VENUE_IN_USE", "Events use this venue. Deactivate it instead so past records stay intact.");
        }
        venues.delete(v);
        audit.log("VENUE_DELETED", "Venue", id, v.getName());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/admin/venues/{id}/gates")
    @Transactional
    public VenueDto addGate(@PathVariable Long id, @Valid @RequestBody GateRequest req) {
        Venue v = find(id);
        if (v.getGates().stream().anyMatch(g -> g.getName().equalsIgnoreCase(req.name().trim()))) {
            throw ApiException.conflict("GATE_EXISTS", "This venue already has a gate with that name.");
        }
        v.addGate(req.name().trim());
        venues.flush();
        audit.log("GATE_CREATED", "Venue", id, req.name());
        return dto(v);
    }

    @DeleteMapping("/api/v1/admin/gates/{gateId}")
    @Transactional
    public ResponseEntity<Void> deleteGate(@PathVariable Long gateId) {
        Gate g = gates.findById(gateId).orElseThrow(() -> ApiException.notFound("Gate"));
        if (gates.countEventUses(gateId) > 0) {
            throw ApiException.conflict("GATE_IN_USE", "Events use this gate, so it can't be removed.");
        }
        g.getVenue().getGates().remove(g);
        audit.log("GATE_DELETED", "Gate", gateId, g.getName());
        return ResponseEntity.noContent().build();
    }

    private void apply(Venue v, VenueRequest r) {
        v.setName(r.name().trim());
        v.setType(r.type());
        v.setBuilding(r.building());
        v.setFloor(r.floor());
        v.setDescription(r.description());
        v.setCapacity(r.capacity());
        v.setCanHostEvents(r.canHostEvents());
        v.setLatitude(r.lat());
        v.setLongitude(r.lng());
    }

    private Venue find(Long id) {
        return venues.findById(id).orElseThrow(() -> ApiException.notFound("Venue"));
    }
}
