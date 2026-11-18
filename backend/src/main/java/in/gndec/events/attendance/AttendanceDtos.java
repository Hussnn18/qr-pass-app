package in.gndec.events.attendance;

import in.gndec.events.scan.ScanService.ScanLogView;
import in.gndec.events.user.UserDtos.Person;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/** Attendance management (objective 4). Times are epoch milliseconds. */
public final class AttendanceDtos {

    private AttendanceDtos() {
    }

    /** UPCOMING (gates not open yet), OPEN (entry window running), ENDED, plus DRAFT and CANCELLED. */
    public enum Phase { DRAFT, UPCOMING, OPEN, ENDED, CANCELLED }

    public record GateCount(Long gateId, String gateName, long entries, List<String> staff, Long lastEntryAt) {
    }

    /** One time slot: entries in it and everyone inside by its end. */
    public record Bucket(long at, long entries, long cumulative) {
    }

    /** Confirmed vs attended for one department or semester. */
    public record GroupCount(String key, String label, long confirmed, long attended) {
    }

    public record Summary(Long eventId, String title, String status, Phase phase, long startsAt, long endsAt, long entryOpensAt,
            int capacity, long confirmed, long attended, long absent, int attendanceRate, long lastHour, long rejectedScans,
            Map<String, Long> byMethod, List<GateCount> gates, int bucketMinutes, List<Bucket> timeline,
            List<GroupCount> departments, List<GroupCount> semesters, List<ScanLogView> recent) {
    }

    /** A confirmed participant and whether (and how) they were recorded as present. */
    public record Attendee(Long registrationId, Person person, boolean present, Long enteredAt, Long gateId, String gateName,
            String method, String overrideReason, String recordedBy) {
    }

    public record MarkPresentRequest(@NotNull Long registrationId, Long gateId, @NotBlank @Size(max = 300) String reason) {
    }

    public record MarkAbsentRequest(@NotBlank @Size(max = 300) String reason) {
    }
}
