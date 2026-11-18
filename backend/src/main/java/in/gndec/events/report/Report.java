package in.gndec.events.report;

import java.util.List;

/**
 * A downloadable report (objective 5): a title, a few lines of context and one or more tables.
 * The same report renders as CSV, Excel or PDF (see ReportWriter).
 *
 * Cell values may be String, Number or java.time.Instant; null prints as an empty cell.
 */
public record Report(String title, String fileStem, List<String> meta, List<Section> sections) {

    /** One table. {@code widths} are relative column widths (also used as Excel column widths in characters). */
    public record Section(String name, List<String> headers, List<Integer> widths, List<List<Object>> rows) {

        public Section {
            if (widths.size() != headers.size()) {
                throw new IllegalArgumentException("widths and headers differ in length for " + name);
            }
        }
    }

    public int rowCount() {
        return sections.stream().mapToInt(s -> s.rows().size()).sum();
    }
}
