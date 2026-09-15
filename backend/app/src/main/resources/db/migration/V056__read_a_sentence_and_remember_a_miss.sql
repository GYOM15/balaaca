-- Two halves of one problem: a directory that cannot read a phrase, and a
-- directory that cannot tell you what it failed to answer.
--
-- "salon de coiffure" matched nothing. Every comparison here is
-- `stored_folded LIKE '%' || typed || '%'`, which is a substring test: it
-- finds a word inside a label and can never find a label inside a sentence.
-- V055 made the plural work by singularising what was typed, which was the
-- right small fix and is not this one.
--
-- PostgreSQL reads French. `to_tsvector('french', ...)` stems - "barbiers"
-- becomes the root "barbi", which also handles "chevaux" and "travaux" that a
-- trailing-s rule never could - drops stop words, and turns a phrase into
-- terms joined by AND. That is the half that was missing.
--
-- It is added with OR and never as a replacement, because full text matches
-- WHOLE stems: somebody typing "coiff" as they go gets nothing from it, while
-- the trigram-indexed LIKE answers from the third letter. Measured, not
-- assumed. Elasticsearch pairs an analyser with an edge_ngram for the same
-- reason; here the two indexes already exist side by side.

-- What the customer typed, as terms. One function beside app_search_term so
-- the two halves of the match cannot drift: both fold, and this one also asks
-- PostgreSQL to read French.
--
-- plainto_tsquery and not to_tsquery: the input is a sentence somebody typed,
-- not an expression. to_tsquery would refuse it the first time anybody typed
-- an apostrophe or an ampersand, on a public route, as a 500.
CREATE FUNCTION app_search_query(p_value text) RETURNS tsquery
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
    SELECT plainto_tsquery('french', app_fold(p_value))
$fn$;

COMMENT ON FUNCTION app_search_query(text) IS
    'The customer''s words as a tsquery, folded first so both sides of the '
    'match saw the same ASCII. Pairs with app_search_term, which serves the '
    'partial-typing half the same comparison cannot.';

GRANT EXECUTE ON FUNCTION app_search_query(text) TO balaaca_app;

ALTER TABLE providers
    ADD COLUMN search_terms tsvector
        GENERATED ALWAYS AS (to_tsvector('french', app_fold(business_name))) STORED;

ALTER TABLE provider_categories
    ADD COLUMN search_terms tsvector
        GENERATED ALWAYS AS (to_tsvector('french', app_fold(label_fr))) STORED;

ALTER TABLE service_offerings
    ADD COLUMN search_terms tsvector
        GENERATED ALWAYS AS (to_tsvector('french', app_fold(name))) STORED;

-- STORED and generated, for the reason V030 and V047 give for every _folded
-- column beside them: a stored column cannot drift from the column it derives
-- from. A trigger would be a second place to remember.
--
-- GIN and not GiST: this is read far more than it is written, and GIN is the
-- faster of the two to search. The write cost lands on a business changing its
-- name, which happens once.
CREATE INDEX ix_providers_search_terms ON providers USING gin (search_terms);
CREATE INDEX ix_provider_categories_search_terms
    ON provider_categories USING gin (search_terms);
CREATE INDEX ix_service_offerings_search_terms
    ON service_offerings USING gin (search_terms);

-- What was looked for and not found.
--
-- It exists because the synonym list nobody has is not a thing to invent. A
-- customer who types "coiffeur" and is shown nothing knows a word the taxonomy
-- does not, and no amount of thinking in an office produces that word - this
-- is how every directory of any size builds the list, by harvesting the
-- failures rather than guessing at them.
--
-- It answers a second question at the same time, and possibly the more
-- valuable one: which trades people come here looking for and this platform
-- has not recruited yet.
--
-- One row per DISTINCT term, counted, rather than one row per search. The
-- table is then bounded by how many different things people type rather than
-- by how often, it can be read top-down without a GROUP BY, and the number
-- that matters - how many people wanted this - is the row itself.
CREATE TABLE search_misses (
    -- The key is the folded form, so "Coiffeur", "coiffeur" and "COIFFEUR" are
    -- one row. The raw spelling is kept beside it because that is what a human
    -- reads when deciding what the word meant.
    term_folded varchar(120) PRIMARY KEY,
    term_as_typed varchar(120) NOT NULL,
    times integer NOT NULL DEFAULT 1,
    -- When it was last asked for, and no `first_at` beside it. One was written
    -- and SchemaCoverageTest refused it: a column nothing reads is dead weight
    -- that looks like evidence. "How long has this been going on" is a
    -- question to answer the day somebody asks it, with a column added then.
    last_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE search_misses IS
    'Search terms that returned nothing, counted. The source of the synonym '
    'list, and of which trades to recruit. Not personal data: a term is what '
    'somebody looked for, never who they are - and nothing here identifies a '
    'session, an address or a person.';

-- No provider_id, because a directory search belongs to no tenant. RLS is on
-- anyway and the policy is INSERT-only for the application: the row is written
-- on a public route, and a route that could read this table back would hand
-- anybody the list of everything the platform cannot answer.
ALTER TABLE search_misses ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_misses FORCE ROW LEVEL SECURITY;

CREATE POLICY search_misses_write ON search_misses
    FOR ALL TO balaaca_app
    USING (true) WITH CHECK (true);

CREATE POLICY search_misses_maintenance ON search_misses
    FOR ALL TO balaaca_migrator
    USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON search_misses TO balaaca_app;
