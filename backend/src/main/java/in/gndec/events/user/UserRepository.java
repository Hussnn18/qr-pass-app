package in.gndec.events.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    @Query("select u from User u join u.profile p where p.urn = :urn")
    Optional<User> findByUrn(String urn);

    List<User> findByRoleAndStatusOrderByFullName(Role role, User.Status status);

    long countByRole(Role role);

    long countByStatus(User.Status status);

    @Query("select u from User u join fetch u.profile p where u.role = in.gndec.events.user.Role.STUDENT and u.status = in.gndec.events.user.User.Status.ACTIVE and p.enrolled = true")
    List<User> findActiveEnrolledStudents();
}
