package in.gndec.events;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import in.gndec.events.common.RateLimiter;
import in.gndec.events.user.User;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTest {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected Fixtures fx;

    @Autowired
    protected RateLimiter rateLimiter;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        TestDatabase.register(registry);
    }

    @BeforeEach
    void cleanDatabase() {
        fx.wipe();
        rateLimiter.reset();
    }

    protected ResultActions get_(String url, User as) throws Exception {
        var req = get(url);
        if (as != null) {
            req.header("Authorization", fx.bearer(as));
        }
        return mvc.perform(req);
    }

    protected ResultActions post_(String url, User as, String json) throws Exception {
        var req = post(url).contentType(MediaType.APPLICATION_JSON).content(json == null ? "{}" : json);
        if (as != null) {
            req.header("Authorization", fx.bearer(as));
        }
        return mvc.perform(req);
    }

    protected ResultActions put_(String url, User as, String json) throws Exception {
        var req = put(url).contentType(MediaType.APPLICATION_JSON).content(json);
        if (as != null) {
            req.header("Authorization", fx.bearer(as));
        }
        return mvc.perform(req);
    }

    protected static <T> T read(MvcResult r, String path) throws Exception {
        return JsonPath.read(r.getResponse().getContentAsString(), path);
    }

    /** Runs the tasks at the same moment on separate threads and returns their results. */
    protected static <T> List<T> parallel(List<Callable<T>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        try {
            java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> t : tasks) {
                futures.add(pool.submit(() -> {
                    go.await();
                    return t.call();
                }));
            }
            go.countDown();
            List<T> out = new ArrayList<>();
            for (Future<T> f : futures) {
                out.add(f.get());
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }
}
