/**
 * The one shape of a paginated list: the rows of the page and, beside them,
 * the size of the whole filtered set. Every history list answers with it, so a
 * client reads them all the same way.
 *
 * Paging is what a long list needs and nothing more. `total` comes from its own
 * count over the same filter and never from folding the page, and no aggregate
 * is ever computed over `items`: the panel reads its figures from the datasets.
 */
export interface PageView<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
