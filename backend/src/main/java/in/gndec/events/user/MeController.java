package in.gndec.events.user;

import in.gndec.events.auth.SessionCookies;
import in.gndec.events.auth.SessionCookies.AuthResponse;
import in.gndec.events.user.UserDtos.ChangePasswordRequest;
import in.gndec.events.user.UserDtos.Me;
import in.gndec.events.user.UserDtos.UpdateMeRequest;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MeController {

    private final UserService service;
    private final SessionCookies cookies;
    private final PhotoStorage photos;

    public MeController(UserService service, SessionCookies cookies, PhotoStorage photos) {
        this.service = service;
        this.cookies = cookies;
        this.photos = photos;
    }

    @GetMapping("/api/v1/me")
    public Me me() {
        return service.me();
    }

    @PutMapping("/api/v1/me")
    public Me update(@Valid @RequestBody UpdateMeRequest req) {
        return service.updateMe(req.phone());
    }

    /** Returns a fresh session: other devices are signed out and the "must change password" flag is cleared. */
    @PutMapping("/api/v1/me/password")
    public ResponseEntity<AuthResponse> changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        return cookies.respond(service.changePassword(req.currentPassword(), req.newPassword()));
    }

    @PostMapping(path = "/api/v1/me/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Me uploadPhoto(@RequestParam("file") MultipartFile file) {
        return service.setPhoto(file);
    }

    @DeleteMapping("/api/v1/me/photo")
    public Me removePhoto() {
        return service.removePhoto();
    }

    /** Photo URLs contain a random 128-bit name, so they can be loaded by <img> without an auth header. */
    @GetMapping("/api/v1/photos/{name}")
    public ResponseEntity<InputStreamResource> photo(@PathVariable String name) throws IOException {
        InputStream in = photos.open(name);
        return ResponseEntity.ok()
                .contentType(name.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(30)).cachePrivate())
                .body(new InputStreamResource(in));
    }
}
