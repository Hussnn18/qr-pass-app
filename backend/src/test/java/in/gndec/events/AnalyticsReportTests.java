package in.gndec.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.gndec.events.event.Event;
import in.gndec.events.user.Role;
import in.gndec.events.user.User;
import in.gndec.events.venue.Gate;
import in.gndec.events.venue.Venue;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Objective 5: dashboards, analytics and downloadable reports. */
class AnalyticsReportTests extends IntegrationTest {

    User org;
    User other;
    User admin;
    User guard;
    Venue hall;
    Gate gate;
    Event fest;
    Event talk;

    @BeforeEach
    void setUp() throws Exception {
        org = fx.staff(Role.ORGANIZER, "org@test.gndec");
        other = fx.staff(Role.ORGANIZER, "other@test.gndec");
        admin = fx.staff(Role.ADMIN, "admin@test.gndec");
        guard = fx.staff(Role.SECURITY, "guard@test.gndec");
        hall = fx.venue("Main Auditorium", "Gate A");
        gate = fx.gatesOf(hall).get(0);
        // fest: gates open now, 4 confirmed, 3 scanned in, then completed -> 1 no-show.
        fest = fx.event(org, hall).title("Cultural Fest").startsIn(Duration.ofMinutes(30))
                .regClosesAt(Instant.now().plus(Duration.ofMinutes(25))).capacity(10).save();
        fx.assign(fest, gate, guard);
        String[][] people = {{"2302701", "CSE", "7"}, {"2302702", "CSE", "7"}, {"2415703", "IT", "5"}, {"2415704", "IT", "5"}};
        for (int i = 0; i < people.length; i++) {
            User s = fx.student(people[i][0], people[i][1], Integer.parseInt(people[i][2]), "A");
            post_("/api/v1/events/" + fest.getId() + "/registrations", s, "{}").andExpect(status().isOk());
            if (i < 3) {
                String qr = qrOf(s, fest);
                post_("/api/v1/scan/verify", guard, "{\"eventId\":" + fest.getId() + ",\"gateId\":" + gate.getId() + ",\"qr\":\"" + qr + "\"}")
                        .andExpect(jsonPath("$.result").value("SUCCESS"));
            }
        }
        fx.jdbc.update("update events set status = 'COMPLETED' where id = ?", fest.getId());
        // talk: next week, other organizer, 1 registration.
        talk = fx.event(other, hall).title("Guest Talk").startsIn(Duration.ofDays(7)).capacity(5).save();
        post_("/api/v1/events/" + talk.getId() + "/registrations", fx.student("2302705", "CSE", 7, "B"), "{}").andExpect(status().isOk());
    }

    private String qrOf(User s, Event e) throws Exception {
        List<Map<String, Object>> passes = read(get_("/api/v1/me/passes", s).andReturn(), "$");
        return passes.stream().filter(p -> ((Map<?, ?>) p.get("event")).get("id").equals(e.getId().intValue()))
                .map(p -> (String) p.get("qr")).findFirst().orElseThrow();
    }

    @Test
    void adminDashboardCoversEveryEvent() throws Exception {
        MvcResult r = get_("/api/v1/manage/analytics", admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.allEvents").value(true))
                .andExpect(jsonPath("$.kpis.events").value(2))
                .andExpect(jsonPath("$.kpis.ended").value(1))
                .andExpect(jsonPath("$.kpis.upcoming").value(1))
                .andExpect(jsonPath("$.kpis.registrations").value(5))
                .andExpect(jsonPath("$.kpis.confirmed").value(5))
                .andExpect(jsonPath("$.kpis.attended").value(3))
                .andExpect(jsonPath("$.kpis.noShows").value(1))
                .andExpect(jsonPath("$.kpis.attendanceRate").value(75)) // 3 of 4 at the event that has happened
                .andExpect(jsonPath("$.kpis.fillRate").value(33))       // 5 confirmed of 15 seats
                .andExpect(jsonPath("$.registrationStatus.CONFIRMED").value(5))
                .andExpect(jsonPath("$.gates[0].entries").value(3))
                .andExpect(jsonPath("$.gates[0].venueName").value("Main Auditorium"))
                .andReturn();
        List<Map<String, Object>> depts = read(r, "$.departments");
        assertThat(depts).extracting(d -> d.get("key") + ":" + d.get("registrations") + "/" + d.get("confirmed") + "/" + d.get("attended"))
                .containsExactly("CSE:3/3/2", "IT:2/2/1");
        assertThat(depts).extracting(d -> d.get("attendanceRate")).containsExactly(100, 50);
        List<Map<String, Object>> sems = read(r, "$.semesters");
        assertThat(sems).extracting(d -> d.get("key") + ":" + d.get("attended")).containsExactly("5:1", "7:2");
        List<Map<String, Object>> events = read(r, "$.events");
        // Popularity: the fest is 40% full, the talk 20%.
        assertThat(events).extracting(e -> e.get("title")).containsExactly("Cultural Fest", "Guest Talk");
        assertThat(events.get(0)).containsEntry("attendanceRate", 75).containsEntry("noShows", 1).containsEntry("fillRate", 40);
        assertThat(events.get(1).get("attendanceRate")).isNull();
        List<Integer> regsPerDay = read(r, "$.trend[*].registrations");
        assertThat(regsPerDay.stream().mapToInt(Integer::intValue).sum()).isEqualTo(5);
    }

    @Test
    void organizersSeeOnlyTheirOwnEventsAndDatesFilter() throws Exception {
        get_("/api/v1/manage/analytics", other).andExpect(jsonPath("$.allEvents").value(false))
                .andExpect(jsonPath("$.kpis.events").value(1))
                .andExpect(jsonPath("$.events[0].title").value("Guest Talk"));
        long from = Instant.now().plus(Duration.ofDays(2)).toEpochMilli();
        get_("/api/v1/manage/analytics?from=" + from, admin).andExpect(jsonPath("$.kpis.events").value(1));
        get_("/api/v1/manage/analytics", fx.student("2302799", "CSE", 7, "A")).andExpect(status().isForbidden());
        get_("/api/v1/manage/analytics", guard).andExpect(status().isForbidden());
    }

    @Test
    void eventReportsDownloadAsCsvExcelAndPdf() throws Exception {
        String url = "/api/v1/manage/reports/events/" + fest.getId();
        MvcResult csv = get_(url + "/attendance?format=csv", org).andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("cultural-fest-attendance-")))
                .andReturn();
        String text = new String(csv.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(text).contains("Present").contains("Student 2302701").contains("QR scan").contains("Entries by gate").doesNotContain("Student 2415704");

        MvcResult xlsx = get_(url + "/absentees?format=xlsx", org).andExpect(status().isOk()).andReturn();
        assertThat(xlsx.getResponse().getContentType()).contains("spreadsheetml");
        try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(xlsx.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getFirstSheet();
            assertThat(sheet.getName()).isEqualTo("No-shows");
            List<String> cells = sheet.read().stream().map(row -> row.stream().map(c -> c == null ? "" : c.getRawValue()).collect(Collectors.joining("|")))
                    .toList();
            assertThat(cells.get(0)).isEqualTo("No-shows — Cultural Fest");
            assertThat(cells).anyMatch(l -> l.startsWith("Name|URN / Email|Department"));
            assertThat(cells).anyMatch(l -> l.startsWith("Student 2415704|2415704|IT|5|A"));
        }

        MvcResult pdf = get_(url + "/registrations?format=pdf", org).andExpect(status().isOk()).andReturn();
        assertThat(pdf.getResponse().getContentType()).isEqualTo("application/pdf");
        assertThat(new String(pdf.getResponse().getContentAsByteArray(), 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");

        get_(url + "/attendance", other).andExpect(status().isForbidden());
        get_(url + "/salaries", org).andExpect(status().isNotFound());
        get_(url + "/attendance?format=doc", org).andExpect(status().isBadRequest());
        assertThat(fx.jdbc.queryForObject("select count(*) from audit_logs where action = 'REPORT_EXPORTED'", Integer.class)).isEqualTo(3);
    }

    @Test
    void summaryReportHasOneSheetPerBreakdown() throws Exception {
        MvcResult r = get_("/api/v1/manage/reports/summary?format=xlsx", admin).andExpect(status().isOk()).andReturn();
        try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(r.getResponse().getContentAsByteArray()))) {
            assertThat(wb.getSheets().map(Sheet::getName).toList()).containsExactly("Events", "Department-wise", "Semester-wise", "Category-wise");
            List<Row> rows = wb.getSheets().filter(s -> s.getName().equals("Department-wise")).findFirst().orElseThrow().read();
            List<String> lines = rows.stream().map(row -> row.stream().map(c -> c == null ? "" : c.getRawValue()).collect(Collectors.joining("|"))).toList();
            // CSE: 3 registered, 3 confirmed, 2 attended; the rate counts only the event that happened (2 of 2).
            assertThat(lines).anyMatch(l -> l.startsWith("Computer Science & Engineering|3|3|2|100"));
        }
        String csv = get_("/api/v1/manage/reports/summary?format=csv", other).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(csv).contains("Guest Talk").doesNotContain("Cultural Fest").contains("Department-wise");
        get_("/api/v1/manage/reports/summary?format=pdf&from=" + Instant.now().plus(Duration.ofDays(30)).toEpochMilli(), admin)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("NO_EVENTS"));
    }
}
