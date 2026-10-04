package in.gndec.events.common;

import java.util.ArrayList;
import java.util.List;

/** Minimal RFC 4180 CSV reader/writer: quoted fields, escaped quotes, CRLF or LF line endings. */
public final class CsvParser {

    private CsvParser() {
    }

    public static List<List<String>> parse(String text) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (c == '"') {
                    quoted = false;
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++;
                }
                row.add(field.toString());
                field.setLength(0);
                if (row.stream().anyMatch(x -> !x.isBlank())) {
                    rows.add(row);
                }
                row = new ArrayList<>();
            } else {
                field.append(c);
            }
        }
        row.add(field.toString());
        if (row.stream().anyMatch(x -> !x.isBlank())) {
            rows.add(row);
        }
        return rows;
    }

    public static String escape(Object value) {
        String s = value == null ? "" : String.valueOf(value);
        // Neutralise spreadsheet formulas (CSV injection) in exported data.
        if (!s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        return s.matches("(?s).*[\",\r\n].*") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }

    public static String row(Object... values) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escape(values[i]));
        }
        return sb.append("\r\n").toString();
    }
}
