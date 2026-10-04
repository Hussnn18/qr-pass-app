package in.gndec.events.user;

import in.gndec.events.common.ApiException;
import in.gndec.events.config.AppProperties;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Profile photos on local disk (app.upload-dir). Files get random names, so a photo URL can't be guessed
 * from a URN (the Minor project saved them as <URN>.jpg in a public folder).
 * The type is checked from the file's first bytes, not from its name.
 */
@Component
public class PhotoStorage {

    public static final String NAME_PATTERN = "[0-9a-f\\-]{36}\\.(jpg|png)";
    private static final long MAX_BYTES = 2L * 1024 * 1024;

    private final Path dir;

    public PhotoStorage(AppProperties props) {
        this.dir = Path.of(props.uploadDir() == null ? "uploads" : props.uploadDir()).toAbsolutePath();
    }

    public String save(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("FILE_MISSING", "Choose an image to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw ApiException.badRequest("FILE_TOO_LARGE", "The image must be 2 MB or smaller.");
        }
        try {
            byte[] bytes = file.getBytes();
            String ext = isJpeg(bytes) ? "jpg" : isPng(bytes) ? "png" : null;
            if (ext == null) {
                throw ApiException.badRequest("FILE_TYPE", "Only JPEG or PNG images are allowed.");
            }
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            Files.write(dir.resolve(name), bytes);
            return name;
        } catch (IOException e) {
            throw new IllegalStateException("Could not store the photo", e);
        }
    }

    public void delete(String name) {
        if (name != null && name.matches(NAME_PATTERN)) {
            try {
                Files.deleteIfExists(dir.resolve(name));
            } catch (IOException ignored) {
                // a stale file is harmless
            }
        }
    }

    public InputStream open(String name) throws IOException {
        if (name == null || !name.matches(NAME_PATTERN) || !Files.exists(dir.resolve(name))) {
            throw ApiException.notFound("Photo");
        }
        return Files.newInputStream(dir.resolve(name));
    }

    private static boolean isJpeg(byte[] b) {
        return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    private static boolean isPng(byte[] b) {
        return b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
    }
}
