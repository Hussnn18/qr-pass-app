package in.gndec.events.user;

import in.gndec.events.auth.AuthService;
import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CurrentUser;
import in.gndec.events.common.Secrets;
import in.gndec.events.user.UserDtos.Me;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** "My account": profile, password and photo for whoever is signed in. */
@Service
public class UserService {

    private final UserRepository users;
    private final UserMapper mapper;
    private final PasswordEncoder passwordEncoder;
    private final PhotoStorage photos;
    private final AuditService audit;
    private final AuthService auth;

    public UserService(UserRepository users, UserMapper mapper, PasswordEncoder passwordEncoder, PhotoStorage photos,
            AuditService audit, AuthService auth) {
        this.users = users;
        this.mapper = mapper;
        this.passwordEncoder = passwordEncoder;
        this.photos = photos;
        this.audit = audit;
        this.auth = auth;
    }

    public User current() {
        return users.findById(CurrentUser.id()).orElseThrow(() -> ApiException.notFound("Account"));
    }

    @Transactional(readOnly = true)
    public Me me() {
        return mapper.me(current());
    }

    @Transactional
    public Me updateMe(String phone) {
        User u = current();
        u.setPhone(phone == null || phone.isBlank() ? null : phone.trim());
        audit.log("PROFILE_UPDATED", "User", u.getId(), "phone");
        return mapper.me(u);
    }

    /**
     * Accounts on a temporary password don't need to repeat it (they just signed in with it);
     * everyone else must confirm the current password.
     */
    @Transactional
    public AuthService.Session changePassword(String current, String next) {
        User u = current();
        if (!u.isMustChangePassword() && (current == null || !passwordEncoder.matches(current, u.getPasswordHash()))) {
            throw ApiException.badRequest("WRONG_PASSWORD", "Your current password is incorrect.");
        }
        String problem = Secrets.passwordProblem(next);
        if (problem != null) {
            throw ApiException.badRequest("WEAK_PASSWORD", problem);
        }
        if (passwordEncoder.matches(next, u.getPasswordHash())) {
            throw ApiException.badRequest("SAME_PASSWORD", "Choose a password different from the current one.");
        }
        u.setPasswordHash(passwordEncoder.encode(next));
        u.setMustChangePassword(false);
        audit.log("PASSWORD_CHANGED", "User", u.getId(), null);
        return auth.restartSession(u);
    }

    @Transactional
    public Me setPhoto(MultipartFile file) {
        User u = current();
        String name = photos.save(file);
        photos.delete(u.getPhotoPath());
        u.setPhotoPath(name);
        audit.log("PHOTO_UPLOADED", "User", u.getId(), null);
        return mapper.me(u);
    }

    @Transactional
    public Me removePhoto() {
        User u = current();
        photos.delete(u.getPhotoPath());
        u.setPhotoPath(null);
        audit.log("PHOTO_REMOVED", "User", u.getId(), null);
        return mapper.me(u);
    }
}
