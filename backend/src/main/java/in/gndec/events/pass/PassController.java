package in.gndec.events.pass;

import in.gndec.events.pass.PassService.PassView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PassController {

    public record ReasonRequest(@NotBlank @Size(max = 300) String reason) {
    }

    private final PassService service;

    public PassController(PassService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/me/passes")
    public List<PassView> mine() {
        return service.mine();
    }

    @GetMapping(value = "/api/v1/passes/{id}/qr.png", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> qr(@PathVariable Long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.qrPng(id));
    }

    @GetMapping(value = "/api/v1/passes/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> pdf(@PathVariable Long id) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("entry-pass-" + id + ".pdf").build().toString())
                .body(service.pdf(id));
    }

    @PostMapping("/api/v1/manage/passes/{id}/revoke")
    public ResponseEntity<Void> revoke(@PathVariable Long id, @Valid @RequestBody ReasonRequest req) {
        service.revoke(id, req.reason());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/manage/registrations/{id}/reissue-pass")
    public ResponseEntity<Void> reissue(@PathVariable Long id) {
        service.reissue(id);
        return ResponseEntity.noContent().build();
    }
}
