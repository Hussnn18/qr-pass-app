package in.gndec.events.common;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/** Paged list response. Pages are 1-based in the API to match the UI's page numbers. */
public record PageResponse<T>(List<T> items, int page, int size, long total, int pages) {

    public static <E, T> PageResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(page.getContent().stream().map(mapper).toList(),
                page.getNumber() + 1, page.getSize(), page.getTotalElements(), Math.max(page.getTotalPages(), 1));
    }

    /** Paginates a list that was already filtered in memory. */
    public static <T> PageResponse<T> ofList(List<T> all, int page, int size) {
        int pages = Math.max((int) Math.ceil(all.size() / (double) size), 1);
        int p = Math.min(Math.max(page, 1), pages);
        int from = Math.min((p - 1) * size, all.size());
        return new PageResponse<>(all.subList(from, Math.min(from + size, all.size())), p, size, all.size(), pages);
    }

    public static Pageable request(int page, int size, Sort sort) {
        return PageRequest.of(Math.max(page, 1) - 1, Math.min(Math.max(size, 1), 100), sort);
    }
}
