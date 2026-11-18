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

    /** Ids of people whose name, e-mail or URN contains the text (lower-case). */
    @Query("select u.id from User u left join u.profile p where lower(u.fullName) like :like or lower(u.email) like :like or p.urn like :like")
    List<Long> findIdsMatching(String like, org.springframework.data.domain.Pageable page);

    long countByStatus(User.Status status);

    @Query("select u from User u join fetch u.profile p where u.role = in.gndec.events.user.Role.STUDENT and u.status = in.gndec.events.user.User.Status.ACTIVE and p.enrolled = true")
    List<User> findActiveEnrolledStudents();
}
