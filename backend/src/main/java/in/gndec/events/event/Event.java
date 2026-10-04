package in.gndec.events.event;

import in.gndec.events.common.AuditedEntity;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.Venue;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicUpdate;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "events")
@DynamicUpdate
public class Event extends AuditedEntity {

    public enum Category { TECHNICAL, WORKSHOP, CULTURAL, SPORTS, ACADEMIC, SOCIAL }

    /** OPEN = first come first served with waitlist, APPROVAL = organizer decides, AUTO_ASSIGN = organizer issues passes. */
    public enum Mode { OPEN, APPROVAL, AUTO_ASSIGN }

    public enum Status { DRAFT, PUBLISHED, CLOSED, COMPLETED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "venue_id")
    private Venue venue;

    @Column(nullable = false)
    private Instant startsAt;

    @Column(nullable = false)
    private Instant endsAt;

    @Column(name = "reg_opens_at", nullable = false)
    private Instant regOpensAt;

    @Column(name = "reg_closes_at", nullable = false)
    private Instant regClosesAt;

    @Column(nullable = false)
    private int capacity;

    /**
     * Confirmed seats. Never written from this entity (updatable = false): it only changes through the
     * conditional UPDATEs in EventRepository, which is what makes over-booking impossible under load.
     */
    @Column(name = "confirmed_count", nullable = false, updatable = false)
    private int confirmedCount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Mode mode;

    @Column(name = "allow_outsiders", nullable = false)
    private boolean allowOutsiders;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DRAFT;

    private String cancelReason;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @ManyToMany
    @JoinTable(name = "event_organizers", joinColumns = @JoinColumn(name = "event_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    private Set<User> organizers = new LinkedHashSet<>();

    @ManyToMany
    @JoinTable(name = "event_gates", joinColumns = @JoinColumn(name = "event_id"), inverseJoinColumns = @JoinColumn(name = "gate_id"))
    private Set<Gate> gates = new LinkedHashSet<>();

    @ElementCollection
    @CollectionTable(name = "event_eligible_departments", joinColumns = @JoinColumn(name = "event_id"))
    @Column(name = "department_code")
    private Set<String> eligibleDepartments = new LinkedHashSet<>();

    @ElementCollection
    @CollectionTable(name = "event_eligible_semesters", joinColumns = @JoinColumn(name = "event_id"))
    @Column(name = "semester")
    private Set<Integer> eligibleSemesters = new LinkedHashSet<>();

    @ElementCollection
    @CollectionTable(name = "event_eligible_sections", joinColumns = @JoinColumn(name = "event_id"))
    @Column(name = "section")
    private Set<String> eligibleSections = new LinkedHashSet<>();

    public boolean isOrganizer(Long userId) {
        return organizers.stream().anyMatch(o -> o.getId().equals(userId));
    }

    public boolean hasGate(Long gateId) {
        return gates.stream().anyMatch(g -> g.getId().equals(gateId));
    }

    /** Gates open this long before the start time. */
    public static final long ENTRY_WINDOW_MINUTES = 60;

    public Instant entryOpensAt() {
        return startsAt.minusSeconds(ENTRY_WINDOW_MINUTES * 60);
    }
}
