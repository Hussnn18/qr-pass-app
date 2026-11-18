package in.gndec.events.report;

import in.gndec.events.common.CsvParser;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.ColumnText;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfPageEventHelper;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

/** Renders a Report as CSV, Excel (.xlsx) or PDF. Times are shown in IST. */
@Component
public class ReportWriter {

    public enum Format {
        CSV("text/csv; charset=UTF-8", "csv"),
        XLSX("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
        PDF("application/pdf", "pdf");

        public final String contentType;
        public final String extension;

        Format(String contentType, String extension) {
            this.contentType = contentType;
            this.extension = extension;
        }

        public static Format parse(String s) {
            try {
                return s == null ? CSV : valueOf(s.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw in.gndec.events.common.ApiException.badRequest("UNKNOWN_FORMAT", "Choose csv, xlsx or pdf.");
            }
        }
    }

    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final DateTimeFormatter TEXT_TIME = DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm").withZone(IST);
    private static final String COLLEGE = "GURU NANAK DEV ENGINEERING COLLEGE, LUDHIANA";
    private static final Color MAROON = new Color(0x8f, 0x1d, 0x1d);
    private static final Color NAVY = new Color(0x26, 0x2a, 0x7a);
    private static final Color MUTED = new Color(0x5f, 0x66, 0x72);
    private static final Color STRIPE = new Color(0xf4, 0xf5, 0xf8);

    public byte[] write(Report report, Format format) {
        return switch (format) {
            case CSV -> csv(report);
            case XLSX -> xlsx(report);
            case PDF -> pdf(report);
        };
    }

    static String text(Object v) {
        if (v == null) {
            return "";
        }
        if (v instanceof Instant i) {
            return TEXT_TIME.format(i);
        }
        return v.toString();
    }

    // ------------------------------------------------------------------ CSV

    /** A single table stays a plain table (row 1 = headers) so it imports cleanly; several tables are labelled. */
    private static byte[] csv(Report report) {
        StringBuilder sb = new StringBuilder("﻿"); // BOM so Excel reads UTF-8 names correctly
        boolean several = report.sections().size() > 1;
        for (Report.Section s : report.sections()) {
            if (several) {
                if (sb.length() > 1) {
                    sb.append("\r\n");
                }
                sb.append(CsvParser.row(s.name()));
            }
            sb.append(CsvParser.row(s.headers().toArray()));
            for (List<Object> row : s.rows()) {
                sb.append(CsvParser.row(row.stream().map(ReportWriter::text).toArray()));
            }
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    // ------------------------------------------------------------------ Excel

    private static byte[] xlsx(Report report) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Workbook wb = new Workbook(out, "Smart Campus Events", "1.0");
            int n = 0;
            for (Report.Section s : report.sections()) {
                Worksheet ws = wb.newWorksheet(sheetName(s.name(), ++n));
                int r = 0;
                ws.value(r, 0, report.title());
                ws.style(r, 0).bold().fontSize(14).fontColor("262A7A").set();
                r++;
                for (String line : report.meta()) {
                    ws.value(r, 0, line);
                    ws.style(r, 0).fontColor("5F6672").set();
                    r++;
                }
                r++;
                int header = r;
                for (int c = 0; c < s.headers().size(); c++) {
                    ws.value(header, c, s.headers().get(c));
                    ws.style(header, c).bold().fontColor("FFFFFF").fillColor("262A7A").set();
                    ws.width(c, Math.max(8, s.widths().get(c)));
                }
                for (List<Object> row : s.rows()) {
                    r++;
                    for (int c = 0; c < row.size(); c++) {
                        Object v = row.get(c);
                        if (v instanceof Number num) {
                            ws.value(r, c, num);
                        } else if (v instanceof Instant i) {
                            ws.value(r, c, LocalDateTime.ofInstant(i, IST));
                            ws.style(r, c).format("dd-mm-yyyy hh:mm").set();
                        } else if (v != null) {
                            ws.value(r, c, v.toString());
                        }
                    }
                }
                if (!s.rows().isEmpty()) {
                    ws.setAutoFilter(header, 0, s.headers().size() - 1);
                }
                ws.freezePane(0, header + 1);
            }
            wb.finish();
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not create the Excel report", e);
        }
    }

    /** Excel sheet names: at most 31 characters and none of : \ / ? * [ ]. */
    static String sheetName(String name, int n) {
        String clean = name.replaceAll("[:\\\\/?*\\[\\]]", " ").trim();
        if (clean.isEmpty()) {
            clean = "Sheet " + n;
        }
        return clean.length() > 31 ? clean.substring(0, 31) : clean;
    }

    // ------------------------------------------------------------------ PDF

    private static byte[] pdf(Report report) {
        int widest = report.sections().stream().mapToInt(s -> s.widths().stream().mapToInt(Integer::intValue).sum()).max().orElse(0);
        boolean landscape = widest > 90;
        String generated = TEXT_TIME.format(Instant.now());
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document doc = new Document(landscape ? PageSize.A4.rotate() : PageSize.A4, 28, 28, 28, 36);
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            writer.setPageEvent(new PdfPageEventHelper() {
                @Override
                public void onEndPage(PdfWriter w, Document d) {
                    Phrase footer = new Phrase("Smart Campus Events · " + report.title() + " · generated " + generated + " IST · page " + w.getPageNumber(),
                            new Font(Font.HELVETICA, 7, Font.NORMAL, MUTED));
                    ColumnText.showTextAligned(w.getDirectContent(), Element.ALIGN_CENTER, footer,
                            (d.left() + d.right()) / 2, d.bottom() - 18, 0);
                }
            });
            doc.addTitle(report.title());
            doc.open();

            PdfPTable band = new PdfPTable(1);
            band.setWidthPercentage(100);
            PdfPCell bandCell = new PdfPCell(new Phrase(COLLEGE, new Font(Font.HELVETICA, 9, Font.BOLD, Color.WHITE)));
            bandCell.setBackgroundColor(MAROON);
            bandCell.setBorder(Rectangle.NO_BORDER);
            bandCell.setPadding(7);
            band.addCell(bandCell);
            doc.add(band);

            Paragraph title = new Paragraph(report.title(), new Font(Font.HELVETICA, 15, Font.BOLD, NAVY));
            title.setSpacingBefore(10);
            doc.add(title);
            for (String line : report.meta()) {
                doc.add(new Paragraph(line, new Font(Font.HELVETICA, 8.5f, Font.NORMAL, MUTED)));
            }

            Font head = new Font(Font.HELVETICA, 7.5f, Font.BOLD, Color.WHITE);
            Font body = new Font(Font.HELVETICA, 7.5f, Font.NORMAL, Color.BLACK);
            for (Report.Section s : report.sections()) {
                Paragraph name = new Paragraph(s.name() + " (" + s.rows().size() + ")", new Font(Font.HELVETICA, 10.5f, Font.BOLD, NAVY));
                name.setSpacingBefore(12);
                name.setSpacingAfter(5);
                doc.add(name);
                if (s.rows().isEmpty()) {
                    doc.add(new Paragraph("No rows.", body));
                    continue;
                }
                float[] widths = new float[s.widths().size()];
                for (int k = 0; k < widths.length; k++) {
                    widths[k] = s.widths().get(k);
                }
                PdfPTable table = new PdfPTable(widths);
                table.setWidthPercentage(100);
                table.setHeaderRows(1);
                for (String h : s.headers()) {
                    PdfPCell c = new PdfPCell(new Phrase(h, head));
                    c.setBackgroundColor(NAVY);
                    c.setPadding(4);
                    c.setBorderColor(Color.WHITE);
                    table.addCell(c);
                }
                int i = 0;
                for (List<Object> row : s.rows()) {
                    Color bg = i++ % 2 == 1 ? STRIPE : Color.WHITE;
                    for (Object v : row) {
                        PdfPCell c = new PdfPCell(new Phrase(text(v), body));
                        c.setBackgroundColor(bg);
                        c.setPadding(3.5f);
                        c.setBorderColor(new Color(0xe3, 0xe5, 0xea));
                        if (v instanceof Number) {
                            c.setHorizontalAlignment(Element.ALIGN_RIGHT);
                        }
                        table.addCell(c);
                    }
                }
                doc.add(table);
            }
            doc.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Could not create the PDF report", e);
        }
    }
}
