package in.gndec.events.pass;

import in.gndec.events.config.AppProperties;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * AES-256-GCM for pass tokens at rest. The key (PASS_KEY, 32 bytes base64) lives outside the database,
 * so a database leak alone can't produce working QR codes.
 */
@Component
public class TokenCrypto {

    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec key;

    public TokenCrypto(AppProperties props) {
        byte[] k;
        try {
            k = Base64.getDecoder().decode(props.passKey() == null ? "" : props.passKey());
        } catch (IllegalArgumentException e) {
            k = new byte[0];
        }
        if (k.length != 32) {
            throw new IllegalStateException("app.pass-key (PASS_KEY) must be 32 random bytes, base64-encoded");
        }
        this.key = new SecretKeySpec(k, "AES");
    }

    public String encrypt(String plain) {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not encrypt pass token", e);
        }
    }

    public String decrypt(String encoded) {
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("Could not decrypt pass token (wrong PASS_KEY?)", e);
        }
    }
}
