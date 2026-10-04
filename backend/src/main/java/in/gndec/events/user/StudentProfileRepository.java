package in.gndec.events.user;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface StudentProfileRepository extends JpaRepository<StudentProfile, Long> {

    boolean existsByUrn(String urn);

    List<StudentProfile> findByUrnIn(Collection<String> urns);

    long countByDepartmentCode(String departmentCode);

    long countByEnrolledFalse();

    @Query("select p.urn from StudentProfile p where p.urn in :urns")
    List<String> findExistingUrns(Collection<String> urns);
}
