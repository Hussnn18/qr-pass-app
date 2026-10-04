package in.gndec.events.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Random tokens, hashes and passwords. */
public final class Secrets {

    private static final SecureRandom RANDOM = new SecureRandom();
    /** No 0/O/1/I so codes are easy to read aloud and type. */
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private Secrets() {
    }

    /** 32 random bytes as URL-safe Base64 without padding (43 characters). */
    public static String token() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String code(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    /** Temporary password that already meets the password policy; the user must change it at first sign-in. */
    public static String tempPassword() {
        return "Gn@" + code(4) + (10 + RANDOM.nextInt(90));
    }

    /** Password policy (requirement O2): 8-64 characters with upper case, lower case and a digit. */
    public static String passwordProblem(String password) {
        if (password == null || password.length() < 8) {
            return "Use at least 8 characters.";
        }
        if (password.length() > 64) {
            return "Use at most 64 characters.";
        }
        if (!password.matches(".*[A-Z].*") || !password.matches(".*[a-z].*") || !password.matches(".*\\d.*")) {
            return "Include an upper-case letter, a lower-case letter and a number.";
        }
        return null;
    }
}
