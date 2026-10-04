package in.gndec.events.event;

import in.gndec.events.user.UserDtos.Person;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/** Event request/response shapes. Times are epoch milliseconds. */
public final class EventDtos {

    private EventDtos() {
    }

    public record NamedRef(Long id, String name) {
    }

    public record VenueRef(Long id, String name, String building, String floor, String description, Integer capacity,
            Double lat, Double lng) {
    }

    public record Eligibility(List<String> departments, List<Integer> semesters, List<String> sections) {
        public static Eligibility none() {
            return new Eligibility(List.of(), List.of(), List.of());
        }
    }

    public record Reason(String label, boolean ok, String detail) {
    }

    public record EligibilityCheck(boolean eligible, List<Reason> reasons) {
    }

    public record RegistrationWindow(boolean open, String reason) {
    }

    public record Stats(int capacity, long confirmed, long pending, long waitlisted, long rejected, long cancelled,
            long entered, long remaining) {
    }

    public record PassRef(Long id, String status, String code) {
    }

    public record EntryRef(Long at, String gateName) {
    }

    public record MyRegistration(Long id, String status, Long registeredAt, Long decidedAt, String note, String reason,
            Integer waitlistPosition, PassRef pass, EntryRef entry) {
    }

    public record GateStaff(Long gateId, String gateName, List<NamedRef> staff, long entered) {
    }

    /** One event as the current viewer sees it. Viewer-specific parts are null where they don't apply. */
    public record EventView(Long id, String title, String description, String category, VenueRef venue,
            long startsAt, long endsAt, long regOpensAt, long regClosesAt, String mode, boolean allowOutsiders,
            String status, String cancelReason, Eligibility eligibility, Stats stats, List<NamedRef> organizers,
            List<NamedRef> gates, boolean canManage, RegistrationWindow window, EligibilityCheck eligibilityCheck,
            MyRegistration myRegistration, List<GateStaff> gateStaff) {
    }

    public record EventRequest(
            @NotBlank @Size(min = 5, max = 120) String title,
            @NotBlank @Size(min = 20, max = 4000) String description,
            @NotNull Event.Category category,
            @NotNull Long venueId,
            @NotNull Long startsAt,
            @NotNull Long endsAt,
            Long regOpensAt,
            Long regClosesAt,
            @NotNull @Min(1) @Max(100000) Integer capacity,
            @NotNull Event.Mode mode,
            Boolean allowOutsiders,
            @Valid Eligibility eligibility,
            List<Long> gateIds,
            List<Long> organizerIds,
            Map<Long, List<Long>> gateStaff) {
    }

    public record ReasonRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record StaffRequest(@NotNull List<Long> userIds) {
    }

    public record CountResponse(long count) {
    }

    public record ParticipantView(Long registrationId, Person person, String status, String note, String reason,
            long registeredAt, Long decidedAt, Integer waitlistPosition, PassRef pass, EntryRef entry) {
    }

    public record PendingRequest(Long registrationId, Long eventId, String eventTitle, Person person, long registeredAt, String note) {
    }
}
