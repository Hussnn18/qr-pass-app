package in.gndec.events;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SmartCampusEventsApplication {

	public static void main(String[] args) {
		SpringApplication.run(SmartCampusEventsApplication.class, args);
	}

}
