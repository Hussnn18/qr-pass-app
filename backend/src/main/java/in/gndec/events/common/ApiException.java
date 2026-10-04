package in.gndec.events.common;

import java.util.Map;
import org.springframework.http.HttpStatus;

/** A business-rule failure with an HTTP status and a stable machine-readable code for the frontend. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private Map<String, String> errors;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Map<String, String> getErrors() {
        return errors;
    }

    /** 400 pointing at one form field, so the UI can highlight it. */
    public static ApiException field(String field, String message) {
        ApiException e = new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message);
        e.errors = Map.of(field, message);
        return e;
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found.");
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }
}
