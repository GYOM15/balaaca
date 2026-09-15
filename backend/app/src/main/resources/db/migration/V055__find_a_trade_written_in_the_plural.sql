-- "barbiers" finds nothing, and "barbier" finds the trade.
--
-- Every match in the directory is `stored_folded LIKE '%' || typed || '%'`, so
-- a customer typing LESS than the label still matches - "barbi" reaches
-- "Barbier". Typing MORE does not, and the commonest "more" in French is the
-- plural: people search for a category of person, not for the label of a
-- taxonomy. "barbiers", "tresses", "couturiers" all answered nothing.
--
-- What this does NOT do, deliberately, is match in both directions. The
-- obvious fix - also test whether the label appears inside the query - looks
-- symmetric and is not: a short label starts matching unrelated words.
-- `position('spa' in 'espace')` is 2, so anybody searching for an "espace"
-- would be shown massage parlours. A rule that manufactures nonsense from real
-- words is worse than one that misses a plural.
--
-- Stripping a trailing s or x from what was TYPED is strictly more permissive
-- and cannot lose a match: the result is a prefix of the original, and a
-- prefix matches everywhere the original did. So this only ever finds more,
-- never less, which is the property that makes it safe to apply to all three
-- matched columns at once.
--
-- Multi-word queries are still not served: "salon de coiffure" matches
-- nothing, because no stored label contains that phrase. That needs
-- tokenisation rather than a longer LIKE, and it is written down in
-- docs/BACKLOG.md rather than half-done here.

CREATE FUNCTION app_search_term(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
    -- Folded first, so the strip sees the same lower-case ASCII every stored
    -- column was folded into. `x` as well as `s`: French pluralises
    -- "travaux", "chevaux", and a directory of trades has both.
    SELECT regexp_replace(app_fold(p_value), '(s|x)$', '')
$fn$;

COMMENT ON FUNCTION app_search_term(text) IS
    'What the customer typed, folded and singularised, for matching against '
    'the _folded columns. Only ever widens a match: the result is a prefix of '
    'the folded input, so nothing that matched before stops matching.';

GRANT EXECUTE ON FUNCTION app_search_term(text) TO balaaca_app;
