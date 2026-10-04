package in.gndec.events.event;

import in.gndec.events.common.PageResponse;
import in.gndec.events.event.EventDtos.CountResponse;
import in.gndec.events.event.EventDtos.EventRequest;
import in.gndec.events.event.EventDtos.EventView;
import in.gndec.events.event.EventDtos.NamedRef;
import in.gndec.events.event.EventDtos.ParticipantView;
import in.gndec.events.event.EventDtos.PendingRequest;
import in.gndec.events.event.EventDtos.ReasonRequest;
import in.gndec.events.event.EventDtos.StaffRequest;
import in.gndec.events.user.Role;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Organizers and admins (enforced for /api/v1/manage/** in SecurityConfig; ownership checked in the service). */
@RestController
@RequestMapping("/api/v1/manage")
public class ManageEventController {

    private final ManageEventService service;

    public ManageEventController(ManageEventService service) {
        this.service = service;
    }

    @GetMapping("/events")
    public List<EventView> list() {
        return service.list();
    }

    @GetMapping("/events/{id}")
    public EventView get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping("/events")
    public EventView create(@Valid @RequestBody EventRequest req, @RequestParam(defaultValue = "false") boolean publish) {
        return service.create(req, publish);
    }

    @PutMapping("/events/{id}")
    public EventView update(@PathVariable Long id, @Valid @RequestBody EventRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/events/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/events/{id}/publish")
    public EventView publish(@PathVariable Long id) {
        return service.publish(id);
    }

    @PostMapping("/events/{id}/close")
    public EventView close(@PathVariable Long id) {
        return service.close(id);
    }

    @PostMapping("/events/{id}/reopen")
    public EventView reopen(@PathVariable Long id) {
        return service.reopen(id);
    }

    @PostMapping("/events/{id}/complete")
    public EventView complete(@PathVariable Long id) {
        return service.complete(id);
    }

    @PostMapping("/events/{id}/cancel")
    public EventView cancel(@PathVariable Long id, @Valid @RequestBody ReasonRequest req) {
        return service.cancel(id, req.reason());
    }

    @PutMapping("/events/{id}/gates/{gateId}/staff")
    public EventView gateStaff(@PathVariable Long id, @PathVariable Long gateId, @Valid @RequestBody StaffRequest req) {
        return service.setGateStaff(id, gateId, req.userIds());
    }

    /** status = ALL | PENDING | CONFIRMED | WAITLISTED | REJECTED | CANCELLED | CHECKED_IN */
    @GetMapping("/events/{id}/participants")
    public PageResponse<ParticipantView> participants(@PathVariable Long id, @RequestParam(required = false) String status,
            @RequestParam(required = false) String q, @RequestParam(required = false) String dept,
            @RequestParam(required = false) Role type, @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "15") int size) {
        return service.participants(id, status, q, dept, type, page, size);
    }

    @GetMapping("/events/{id}/participants.csv")
    public ResponseEntity<byte[]> participantsCsv(@PathVariable Long id, @RequestParam(required = false) String status,
            @RequestParam(required = false) String q, @RequestParam(required = false) String dept,
            @RequestParam(required = false) Role type) {
        byte[] body = ("﻿" + service.participantsCsv(id, status, q, dept, type)).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("participants-event-" + id + ".csv").build().toString())
                .body(body);
    }

    /** How many enrolled students match a set of eligibility rules (wizard step 4). */
    @PostMapping("/eligibility-preview")
    public CountResponse eligibilityPreview(@RequestBody EventDtos.Eligibility rules) {
        return new CountResponse(service.eligiblePreview(rules));
    }

    @GetMapping("/security-staff")
    public List<NamedRef> securityStaff() {
        return service.staff(Role.SECURITY);
    }

    @GetMapping("/organizers")
    public List<NamedRef> organizers() {
        return service.staff(Role.ORGANIZER);
    }

    /** Latest registration requests waiting for a decision, across my events. */
    @GetMapping("/requests")
    public List<PendingRequest> pending(@RequestParam(defaultValue = "5") int limit) {
        return service.pending(limit);
    }
}
