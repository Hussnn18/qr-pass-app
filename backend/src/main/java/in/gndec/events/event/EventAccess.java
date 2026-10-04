package in.gndec.events.event;

import in.gndec.events.common.ApiException;
import in.gndec.events.common.CurrentUser;
import org.springframework.stereotype.Component;

/** Ownership rule (requirement O1-10): admins manage every event, organizers only their own. */
@Component
public class EventAccess {

    public boolean canManage(Event e) {
        if (CurrentUser.hasRole("ADMIN")) {
            return true;
        }
        Long me = CurrentUser.idOrNull();
        return me != null && CurrentUser.hasRole("ORGANIZER") && e.isOrganizer(me);
    }

    public void requireManage(Event e) {
        if (!canManage(e)) {
            throw ApiException.forbidden("Only this event's organizers or an admin can do that.");
        }
    }
}
