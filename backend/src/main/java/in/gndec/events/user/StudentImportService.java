package in.gndec.events.user;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.AuditService;
import in.gndec.events.common.CsvParser;
import in.gndec.events.common.Secrets;
import in.gndec.events.user.UserDtos.Credential;
import in.gndec.events.user.UserDtos.ImportPreview;
import in.gndec.events.user.UserDtos.ImportResult;
import in.gndec.events.user.UserDtos.ImportRow;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Bulk student import (requirement O2-07). Step 1 previews the CSV with an error list per row;
 * step 2 imports the valid rows. Each student gets a random temporary password that must be
 * changed at first sign-in; the list is returned once so the admin can hand it out.
 */
@Service
public class StudentImportService {

    public static final List<String> HEADERS = List.of("URN", "Name", "Email", "Phone", "Department", "Semester", "Section", "Batch", "DOB");
    private static final List<String> REQUIRED = List.of("URN", "Name", "Email", "Department", "Semester");
    private static final int MAX_ROWS = 5000;

    private final UserRepository users;
    private final StudentProfileRepository profiles;
    private final DepartmentRepository departments;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;

    public StudentImportService(UserRepository users, StudentProfileRepository profiles, DepartmentRepository departments,
            PasswordEncoder passwordEncoder, AuditService audit) {
        this.users = users;
        this.profiles = profiles;
        this.departments = departments;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public ImportPreview preview(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("FILE_MISSING", "Choose a CSV file to upload.");
        }
        List<List<String>> table;
        try {
            table = CsvParser.parse(new String(file.getBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw ApiException.badRequest("FILE_UNREADABLE", "The file could not be read.");
        }
        if (table.size() < 2) {
            throw ApiException.badRequest("FILE_EMPTY", "The file has no data rows.");
        }
        if (table.size() - 1 > MAX_ROWS) {
            throw ApiException.badRequest("FILE_TOO_LARGE", "Import at most " + MAX_ROWS + " rows at a time.");
        }
        Map<String, Integer> idx = new HashMap<>();
        List<String> head = table.get(0);
        for (int i = 0; i < head.size(); i++) {
            idx.put(head.get(i).trim().replace("﻿", "").toUpperCase(Locale.ROOT), i);
        }
        List<String> missing = REQUIRED.stream().filter(h -> !idx.containsKey(h.toUpperCase(Locale.ROOT))).toList();
        if (!missing.isEmpty()) {
            throw ApiException.badRequest("MISSING_COLUMNS", "Missing required column(s): " + String.join(", ", missing));
        }
        List<ImportRow> rows = new ArrayList<>();
        for (int r = 1; r < table.size(); r++) {
            List<String> cells = table.get(r);
            rows.add(new ImportRow(r + 1, cell(cells, idx, "URN"), cell(cells, idx, "NAME"), cell(cells, idx, "EMAIL"),
                    cell(cells, idx, "PHONE"), cell(cells, idx, "DEPARTMENT").toUpperCase(Locale.ROOT),
                    parseInt(cell(cells, idx, "SEMESTER")), cell(cells, idx, "SECTION").toUpperCase(Locale.ROOT),
                    parseInt(cell(cells, idx, "BATCH")), cell(cells, idx, "DOB"), List.of()));
        }
        List<ImportRow> checked = validate(rows);
        int invalid = (int) checked.stream().filter(x -> !x.errors().isEmpty()).count();
        return new ImportPreview(checked, checked.size() - invalid, invalid);
    }

    /** Re-validates on the server (the client could have edited the rows) and inserts the valid ones. */
    @Transactional
    public ImportResult commit(List<ImportRow> submitted) {
        List<ImportRow> checked = validate(submitted);
        List<ImportRow> valid = checked.stream().filter(r -> r.errors().isEmpty()).toList();
        List<String> temps = valid.stream().map(r -> Secrets.tempPassword()).toList();
        // BCrypt is deliberately slow; hash in parallel so a few hundred rows import in seconds.
        List<String> hashes = temps.parallelStream().map(passwordEncoder::encode).toList();
        List<Credential> creds = new ArrayList<>();
        List<User> batch = new ArrayList<>();
        for (int i = 0; i < valid.size(); i++) {
            ImportRow r = valid.get(i);
            User u = new User();
            u.setRole(Role.STUDENT);
            u.setFullName(r.name().trim());
            u.setEmail(r.email().trim().toLowerCase(Locale.ROOT));
            u.setPhone(r.phone() == null || r.phone().isBlank() ? null : r.phone().trim());
            u.setPasswordHash(hashes.get(i));
            u.setMustChangePassword(true);
            StudentProfile p = new StudentProfile();
            p.setUrn(r.urn());
            p.setDepartmentCode(r.dept());
            p.setSemester(r.semester());
            p.setSection(r.section() == null || r.section().isBlank() ? "A" : r.section());
            p.setBatch(r.batch());
            p.setDob(r.dob() == null || r.dob().isBlank() ? null : LocalDate.parse(r.dob()));
            u.attachProfile(p);
            batch.add(u);
            creds.add(new Credential(r.urn(), u.getFullName(), u.getEmail(), temps.get(i)));
        }
        users.saveAll(batch);
        int skipped = checked.size() - valid.size();
        audit.log("STUDENT_IMPORT", "User", null, "Imported " + valid.size() + " students (" + skipped + " skipped)");
        return new ImportResult(valid.size(), skipped, creds);
    }

    private List<ImportRow> validate(List<ImportRow> rows) {
        Set<String> depts = new HashSet<>(departments.findAll().stream().map(Department::getCode).toList());
        Set<String> existingUrns = new HashSet<>(profiles.findExistingUrns(rows.stream().map(ImportRow::urn).filter(x -> x != null).toList()));
        Set<String> seenUrns = new HashSet<>();
        Set<String> seenEmails = new HashSet<>();
        List<ImportRow> out = new ArrayList<>();
        for (ImportRow r : rows) {
            List<String> errors = new ArrayList<>();
            String urn = r.urn() == null ? "" : r.urn().trim();
            String name = r.name() == null ? "" : r.name().trim();
            String email = r.email() == null ? "" : r.email().trim().toLowerCase(Locale.ROOT);
            if (!urn.matches("\\d{7}")) {
                errors.add("URN must be 7 digits");
            } else if (existingUrns.contains(urn)) {
                errors.add("URN already exists");
            } else if (!seenUrns.add(urn)) {
                errors.add("Duplicate URN in file");
            }
            if (name.length() < 3) {
                errors.add("Name missing");
            }
            if (r.dept() == null || !depts.contains(r.dept())) {
                errors.add("Unknown department \"" + (r.dept() == null ? "" : r.dept()) + "\"");
            }
            if (r.semester() == null || r.semester() < 1 || r.semester() > 8) {
                errors.add("Semester must be 1-8");
            }
            if (r.section() != null && !r.section().isBlank() && !r.section().matches("[A-D]")) {
                errors.add("Section must be A-D");
            }
            if (r.dob() != null && !r.dob().isBlank()) {
                try {
                    LocalDate.parse(r.dob());
                } catch (DateTimeParseException e) {
                    errors.add("DOB must be YYYY-MM-DD");
                }
            }
            if (email.isEmpty()) {
                errors.add("Email missing");
            } else if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
                errors.add("Invalid email");
            } else if (!seenEmails.add(email) || users.existsByEmailIgnoreCase(email)) {
                errors.add("Email already used");
            }
            out.add(new ImportRow(r.line(), urn, name, email, r.phone(), r.dept(), r.semester(), r.section(), r.batch(), r.dob(), errors));
        }
        return out;
    }

    private static String cell(List<String> cells, Map<String, Integer> idx, String header) {
        Integer i = idx.get(header);
        return i == null || i >= cells.size() ? "" : cells.get(i).trim();
    }

    private static Integer parseInt(String s) {
        try {
            return s == null || s.isBlank() ? null : Integer.valueOf(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
