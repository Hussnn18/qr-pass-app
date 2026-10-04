package in.gndec.events.scan;

/** Outcome of a gate scan, in the order the checks run (see ScanService#verify). */
public enum ScanResult {
    SUCCESS("Pass verified. Allow entry."),
    NOT_ASSIGNED("You are not assigned to scan at this gate."),
    INVALID_FORMAT("This QR code is not a campus event pass."),
    INVALID_TOKEN("This pass was not found in the system."),
    REVOKED("This pass was revoked by the organizer."),
    EXPIRED("This pass has expired."),
    NOT_APPROVED("The registration for this pass is not confirmed."),
    WRONG_EVENT("This pass belongs to a different event."),
    OUTSIDE_WINDOW("Entry is not open right now."),
    ACCOUNT_INACTIVE("The pass holder's account or enrollment is inactive."),
    ALREADY_USED("This pass has already been used for entry.");

    private final String message;

    ScanResult(String message) {
        this.message = message;
    }

    public String message() {
        return message;
    }
}
