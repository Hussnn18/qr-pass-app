package in.gndec.events.pass;

import in.gndec.events.event.EligibilityService;
import in.gndec.events.event.Event;
import in.gndec.events.user.PhotoStorage;
import in.gndec.events.user.StudentProfile;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.Comparator;
import java.util.stream.Collectors;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.Image;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

/** Printable ID-card style pass (A6 landscape) generated on the server with OpenPDF. */
@Component
public class PassPdfService {

    private static final Color MAROON = new Color(0x8f, 0x1d, 0x1d);
    private static final Color NAVY = new Color(0x26, 0x2a, 0x7a);
    private static final Color MUTED = new Color(0x5f, 0x66, 0x72);

    private final PhotoStorage photos;

    public PassPdfService(PhotoStorage photos) {
        this.photos = photos;
    }

    public byte[] render(Pass pass, byte[] qrPng) {
        Event e = pass.getEvent();
        User u = pass.getUser();
        StudentProfile p = u.getProfile();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document doc = new Document(PageSize.A6.rotate(), 18, 18, 16, 16);
            PdfWriter.getInstance(doc, out);
            doc.addTitle("Entry pass — " + e.getTitle());
            doc.open();

            PdfPTable header = new PdfPTable(1);
            header.setWidthPercentage(100);
            PdfPCell h = new PdfPCell(new Phrase("GURU NANAK DEV ENGINEERING COLLEGE, LUDHIANA  ·  OFFICIAL ENTRY PASS",
                    new Font(Font.HELVETICA, 7.5f, Font.BOLD, Color.WHITE)));
            h.setBackgroundColor(MAROON);
            h.setBorder(Rectangle.NO_BORDER);
            h.setPadding(6);
            header.addCell(h);
            doc.add(header);

            PdfPTable body = new PdfPTable(new float[] {1.55f, 1f});
            body.setWidthPercentage(100);
            body.setSpacingBefore(8);

            PdfPCell left = new PdfPCell();
            left.setBorder(Rectangle.NO_BORDER);
            Image photo = photo(u);
            if (photo != null) {
                photo.scaleToFit(52, 52);
                left.addElement(photo);
            }
            left.addElement(new Paragraph(u.getFullName(), new Font(Font.HELVETICA, 12, Font.BOLD, Color.BLACK)));
            left.addElement(new Paragraph(p != null ? p.getUrn() : u.getEmail(), new Font(Font.COURIER, 9, Font.BOLD, NAVY)));
            if (p != null) {
                left.addElement(new Paragraph(p.getDepartmentCode() + " · Sem " + p.getSemester() + " · Sec " + p.getSection(),
                        new Font(Font.HELVETICA, 8, Font.NORMAL, MUTED)));
            }
            Paragraph title = new Paragraph(e.getTitle(), new Font(Font.HELVETICA, 10.5f, Font.BOLD, NAVY));
            title.setSpacingBefore(8);
            left.addElement(title);
            Font small = new Font(Font.HELVETICA, 8, Font.NORMAL, Color.BLACK);
            left.addElement(new Paragraph("When: " + EligibilityService.format(e.getStartsAt()) + " – "
                    + EligibilityService.format(e.getEndsAt()).replaceFirst("^.*?, ", ""), small));
            left.addElement(new Paragraph("Venue: " + e.getVenue().getName(), small));
            left.addElement(new Paragraph("Entry: " + e.getGates().stream().sorted(Comparator.comparing(Gate::getId))
                    .map(Gate::getName).collect(Collectors.joining(", ")), small));
            body.addCell(left);

            PdfPCell right = new PdfPCell();
            right.setBorder(Rectangle.NO_BORDER);
            right.setHorizontalAlignment(Element.ALIGN_CENTER);
            Image qr = Image.getInstance(qrPng);
            qr.scaleToFit(118, 118);
            qr.setAlignment(Element.ALIGN_CENTER);
            right.addElement(qr);
            Paragraph code = new Paragraph(pass.getCode(), new Font(Font.COURIER, 9, Font.BOLD, Color.BLACK));
            code.setAlignment(Element.ALIGN_CENTER);
            right.addElement(code);
            body.addCell(right);
            doc.add(body);

            Paragraph foot = new Paragraph("Valid for one entry. Gates open 60 minutes before the start. Carry your college ID.",
                    new Font(Font.HELVETICA, 6.5f, Font.ITALIC, MUTED));
            foot.setSpacingBefore(6);
            doc.add(foot);
            doc.close();
            return out.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Could not create the pass PDF", ex);
        }
    }

    private Image photo(User u) {
        if (u.getPhotoPath() == null) {
            return null;
        }
        try {
            return Image.getInstance(photos.load(u.getPhotoPath()).data());
        } catch (Exception e) {
            return null;
        }
    }
}
