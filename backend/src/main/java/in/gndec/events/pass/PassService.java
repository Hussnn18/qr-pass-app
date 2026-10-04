package in.gndec.events.pass;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.Secrets;
import in.gndec.events.event.Event;
import in.gndec.events.event.EventAccess;
import in.gndec.events.event.EventDtos.EntryRef;
import in.gndec.events.event.EventViews;
import in.gndec.events.registration.Registration;
import in.gndec.events.registration.RegistrationRepository;
import in.gndec.events.scan.Entry;
import in.gndec.events.scan.EntryRepository;
import in.gndec.events.user.UserDtos.Person;
import in.gndec.events.user.UserMapper;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.GateRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Digital passes (requirements O3-01 … O3-05). */
@Service
public class PassService {

    public static final String QR_PREFIX = "EQR1:";
    private static final Logger log = LoggerFactory.getLogger(PassService.class);

    public record PassEvent(Long id, String title, long startsAt, long endsAt, String status, Long venueId, String venueName,
            List<String> gates) {
    }

    /** "qr" is only filled for ACTIVE passes, and only for the owner. */
    public record PassView(Long id, String code, String status, String qr, long issuedAt, Long usedAt, String revokedReason,
            PassEvent event, Person holder, EntryRef entry) {
    }

    private final PassRepository passes;
    private final RegistrationRepository registrations;
    private final EntryRepository entries;
    private final GateRepository gates;
    private final TokenCrypto crypto;
    private final QrService qr;
    private final PassPdfService pdf;
    private final EventAccess access;
    private final AuditService audit;

    public PassService(PassRepository passes, RegistrationRepository registrations, EntryRepository entries,
            GateRepository gates, TokenCrypto crypto, QrService qr, PassPdfService pdf, EventAccess access, AuditService audit) {
        this.passes = passes;
        this.registrations = registrations;
        this.entries = entries;
        this.gates = gates;
        this.crypto = crypto;
        this.qr = qr;
        this.pdf = pdf;
        this.access = access;
        this.audit = audit;
    }

    /** Called on every path that confirms a registration. Any older active pass for it stops working. */
    @Transactional
    public Pass issue(Registration r) {
        Instant now = Instant.now();
        passes.revokeActiveForRegistration(r.getId(), now, "Replaced by a new pass");
        String token = Secrets.token();
        String code;
        do {
            code = "GN-" + Secrets.code(4) + "-" + Secrets.code(4);
        } while (passes.existsByCode(code));
        Pass p = new Pass();
        p.setRegistration(r);
        p.setEvent(r.getEvent());
        p.setUser(r.getUser());
        p.setTokenHash(Secrets.sha256Hex(token));
        p.setTokenEnc(crypto.encrypt(token));
        p.setCode(code);
        p.setStatus(Pass.Status.ACTIVE);
        p.setIssuedAt(now);
        return passes.save(p);
    }

    @Transactional(readOnly = true)
    public List<PassView> mine() {
        Long me = CurrentUser.id();
        List<Pass> list = passes.findMine(me);
        Map<Long, Entry> entryByReg = new HashMap<>();
        entries.findByRegistrationIdIn(list.stream().map(p -> p.getRegistration().getId()).toList())
                .forEach(e -> entryByReg.put(e.getRegistrationId(), e));
        Map<Long, String> gateNames = new HashMap<>();
        gates.findAllById(entryByReg.values().stream().map(Entry::getGateId).toList()).forEach(g -> gateNames.put(g.getId(), g.getName()));
        return list.stream().map(p -> {
            Entry en = p.getStatus() == Pass.Status.USED ? entryByReg.get(p.getRegistration().getId()) : null;
            return view(p, en == null ? null : new EntryRef(en.getEnteredAt().toEpochMilli(), gateNames.get(en.getGateId())));
        }).toList();
    }

    private PassView view(Pass p, EntryRef entry) {
        Event e = p.getEvent();
        PassEvent ev = new PassEvent(e.getId(), e.getTitle(), e.getStartsAt().toEpochMilli(), e.getEndsAt().toEpochMilli(),
                e.getStatus().name(), e.getVenue().getId(), e.getVenue().getName(),
                e.getGates().stream().sorted(Comparator.comparing(Gate::getId)).map(Gate::getName).toList());
        String qrValue = p.getStatus() == Pass.Status.ACTIVE ? QR_PREFIX + crypto.decrypt(p.getTokenEnc()) : null;
        return new PassView(p.getId(), p.getCode(), p.getStatus().name(), qrValue, p.getIssuedAt().toEpochMilli(),
                EventViews.millis(p.getUsedAt()), p.getRevokedReason(), ev, UserMapper.person(p.getUser()), entry);
    }

    /** The pass owner, or an organizer/admin of its event. */
    Pass readable(Long passId) {
        Pass p = passes.findById(passId).orElseThrow(() -> ApiException.notFound("Pass"));
        if (!p.getUser().getId().equals(CurrentUser.id()) && !access.canManage(p.getEvent())) {
            throw ApiException.notFound("Pass");
        }
        return p;
    }

    @Transactional(readOnly = true)
    public byte[] qrPng(Long passId) {
        Pass p = readable(passId);
        if (p.getStatus() != Pass.Status.ACTIVE) {
            throw ApiException.conflict("PASS_NOT_ACTIVE", "This pass is " + p.getStatus().name().toLowerCase() + ".");
        }
        return qr.png(QR_PREFIX + crypto.decrypt(p.getTokenEnc()), 480);
    }

    @Transactional(readOnly = true)
    public byte[] pdf(Long passId) {
        Pass p = readable(passId);
        if (p.getStatus() != Pass.Status.ACTIVE) {
            throw ApiException.conflict("PASS_NOT_ACTIVE", "Only valid passes can be downloaded. This one is " + p.getStatus().name().toLowerCase() + ".");
        }
        return pdf.render(p, qr.png(QR_PREFIX + crypto.decrypt(p.getTokenEnc()), 480));
    }

    @Transactional
    public void revoke(Long passId, String reason) {
        Pass p = passes.findById(passId).orElseThrow(() -> ApiException.notFound("Pass"));
        access.requireManage(p.getEvent());
        if (p.getStatus() != Pass.Status.ACTIVE) {
            throw ApiException.conflict("PASS_NOT_ACTIVE", "Only valid passes can be revoked.");
        }
        p.setStatus(Pass.Status.REVOKED);
        p.setRevokedAt(Instant.now());
        p.setRevokedReason(reason.trim());
        audit.log("PASS_REVOKED", "Pass", p.getId(), p.getUser().getFullName() + " · " + reason);
    }

    /** New token for a confirmed participant (e.g. the old QR was shared). The old QR stops working. */
    @Transactional
    public void reissue(Long registrationId) {
        Registration r = registrations.findById(registrationId).orElseThrow(() -> ApiException.notFound("Registration"));
        access.requireManage(r.getEvent());
        if (r.getStatus() != Registration.Status.CONFIRMED) {
            throw ApiException.conflict("NOT_CONFIRMED", "Only confirmed participants can get a new pass.");
        }
        if (entries.findByRegistrationId(r.getId()).isPresent()) {
            throw ApiException.conflict("ALREADY_ENTERED", "This participant has already entered the event.");
        }
        Pass p = issue(r);
        audit.log("PASS_REISSUED", "Pass", p.getId(), r.getUser().getFullName());
    }

    /** Passes stop working once their event ends (requirement O3-05). */
    @Scheduled(fixedDelay = 600_000, initialDelay = 60_000)
    @Transactional
    public void expireEndedPasses() {
        int n = passes.expireEnded(Instant.now());
        if (n > 0) {
            log.info("Expired {} passes for events that have ended", n);
        }
    }
}
