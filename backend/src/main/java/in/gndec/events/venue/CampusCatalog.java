package in.gndec.events.venue;

import java.util.List;

/**
 * GNDEC Ludhiana campus places with coordinates read off OpenStreetMap (objective 4, campus map).
 * Used by the demo data and by the admin action that loads the campus into a real database.
 */
public final class CampusCatalog {

    private CampusCatalog() {
    }

    public record Place(String name, Venue.Type type, String building, String floor, double lat, double lng, String description,
            boolean canHostEvents, Integer capacity, List<String> gates) {

        public Venue toVenue() {
            Venue v = new Venue();
            v.setName(name);
            v.setType(type);
            v.setBuilding(building);
            v.setFloor(floor);
            v.setLatitude(lat);
            v.setLongitude(lng);
            v.setDescription(description);
            v.setCanHostEvents(canHostEvents);
            v.setCapacity(capacity);
            gates.forEach(v::addGate);
            return v;
        }
    }

    public static final List<Place> PLACES = List.of(
            new Place("Main Gate (Gill Road)", Venue.Type.OTHER, "Security check post", "—", 30.86072, 75.8595, "Main entrance with the security check post and visitor desk.", false, null, List.of()),
            new Place("Admin Block", Venue.Type.ADMIN, "Admin Block", "G–2", 30.85884, 75.86033, "Principal's office, accounts and the Student Welfare office.", false, null, List.of()),
            new Place("Central Library", Venue.Type.LIBRARY, "Library Building", "G–1", 30.85832, 75.86034, "Reading halls, e-library and digital resource centre.", true, 60, List.of("Library Foyer")),
            new Place("Main Auditorium", Venue.Type.AUDITORIUM, "Auditorium", "G", 30.85888, 75.86074, "Auditorium with stage, projection and sound system.", true, 650, List.of("Gate A (Front)", "Gate B (Side)")),
            new Place("CSE Department", Venue.Type.ACADEMIC, "Dept. of Computer Sc. & Engg.", "G–3", 30.85989, 75.86009, "Department of Computer Science & Engineering — classrooms and labs.", true, 120, List.of("Ground Floor Entrance")),
            new Place("Seminar Hall (CSE Dept.)", Venue.Type.SEMINAR_HALL, "Dept. of Computer Sc. & Engg.", "1st floor", 30.86008, 75.86024, "Seminar hall with 150 seats, projector and podium.", true, 150, List.of("Main Door")),
            new Place("IT Department", Venue.Type.ACADEMIC, "Dept. of Information Technology", "G–2", 30.86041, 75.86029, "Department of Information Technology.", true, 100, List.of("Main Entrance")),
            new Place("ECE Department", Venue.Type.LAB, "Electronics & Communication Engg.", "G–2", 30.8581, 75.8612, "ECE department with robotics and embedded systems labs.", true, 60, List.of("Lab Entrance")),
            new Place("Applied Science Block", Venue.Type.ACADEMIC, "Dept. of Applied Science", "G–2", 30.85869, 75.8617, "Physics, chemistry and English labs.", true, 80, List.of("Main Entrance")),
            new Place("Central Workshop", Venue.Type.LAB, "Workshop", "G", 30.85898, 75.86201, "Machine shop, welding and fitting sections.", true, 40, List.of("Workshop Gate")),
            new Place("Open Air Theatre", Venue.Type.AUDITORIUM, "OAT", "—", 30.8607, 75.86214, "Open-air stage for cultural evenings and fests.", true, 1200, List.of("Gate 1", "Gate 2")),
            new Place("Running / Cricket Ground", Venue.Type.SPORTS, "Athletics ground", "—", 30.85889, 75.86359, "Running track and cricket ground.", true, 3000, List.of("North Gate", "South Gate")),
            new Place("Sports Complex", Venue.Type.SPORTS, "Sports Complex", "G", 30.85817, 75.86348, "Indoor courts and sports office.", true, 300, List.of("Main Door")),
            new Place("Football Ground", Venue.Type.SPORTS, "Football ground", "—", 30.8606, 75.86155, "Main football ground.", true, 1500, List.of("Pavilion Gate")),
            new Place("Day Scholar Canteen", Venue.Type.CAFETERIA, "Canteen", "G", 30.8611, 75.86271, "Main canteen for day scholars.", false, null, List.of()),
            new Place("College Dispensary", Venue.Type.OTHER, "Dispensary", "G", 30.86146, 75.86115, "First aid and the campus doctor.", false, null, List.of()),
            new Place("Main Parking", Venue.Type.PARKING, "GNE Boys Parking", "—", 30.85989, 75.85983, "Parking for students and visitors, next to the main gate.", false, null, List.of()),
            new Place("Testing & Consultancy Cell", Venue.Type.ADMIN, "TCC", "G", 30.85815, 75.86035, "Industry consultancy and testing office; meeting room.", true, 40, List.of("Reception")));

    public static Place byName(String name) {
        return PLACES.stream().filter(p -> p.name().equals(name)).findFirst().orElseThrow();
    }
}
