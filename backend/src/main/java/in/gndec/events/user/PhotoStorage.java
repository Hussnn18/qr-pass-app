package in.gndec.events.user;

import in.gndec.events.common.ApiException;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Profile photos, stored in the database so they survive redeploys on hosts whose disk is temporary.
 * Photos get random names, so a photo URL can't be guessed from a URN (the Minor project saved them as
 * <URN>.jpg in a public folder). The type is checked from the file's first bytes, not from its name.
 */
@Component
public class PhotoStorage {

    public static final String NAME_PATTERN = "[0-9a-f\\-]{36}\\.(jpg|png)";
    private static final long MAX_BYTES = 2L * 1024 * 1024;

    public record Stored(byte[] data, MediaType type) {
    }

    private final PhotoRepository repo;

    public PhotoStorage(PhotoRepository repo) {
        this.repo = repo;
    }

    /** Saves the image and returns its new name. Runs in the caller's transaction. */
    public String save(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("FILE_MISSING", "Choose an image to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("FILE_TOO_LARGE", "The image must be 2 MB or smaller.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new IllegalStateException("Could not read the uploaded photo", e);
        }
        String ext = isJpeg(bytes) ? "jpg" : isPng(bytes) ? "png" : null;
        if (ext == null) {
            throw ApiException.badRequest("FILE_TYPE", "Only JPEG or PNG images are allowed.");
        }
        Photo p = new Photo();
        p.setName(UUID.randomUUID() + "." + ext);
        p.setContentType("jpg".equals(ext) ? MediaType.IMAGE_JPEG_VALUE : MediaType.IMAGE_PNG_VALUE);
        p.setData(bytes);
        p.setCreatedAt(Instant.now());
        repo.save(p);
        return p.getName();
    }

    public void delete(String name) {
        if (name != null && name.matches(NAME_PATTERN)) {
            repo.deleteById(name);
        }
    }

    @Transactional(readOnly = true)
    public Stored load(String name) {
        if (name == null || !name.matches(NAME_PATTERN)) {
            throw ApiException.notFound("Photo");
        }
        return repo.findById(name)
                .map(p -> new Stored(p.getData(), MediaType.parseMediaType(p.getContentType())))
                .orElseThrow(() -> ApiException.notFound("Photo"));
    }

    private static boolean isJpeg(byte[] b) {
        return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    private static boolean isPng(byte[] b) {
        return b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
    }
}
