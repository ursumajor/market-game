-- Re-scores every resolved market with the fixed pot (see awardPot in src/lib/scoring.ts):
-- each question (a recorded market, or all trades on an online question) has a pot of
-- 100 points per participant, and every raw transfer is multiplied by pot / total winnings.
WITH t AS (
	SELECT tr.id, tr.raw, tr.maker_id, tr.taker_id, coalesce(m.question_id, m.id) AS scope
	FROM transfers tr JOIN markets m ON m.id = tr.market_id
),
nets AS (
	SELECT scope, user_id, sum(v) AS net FROM (
		SELECT scope, taker_id AS user_id, raw AS v FROM t
		UNION ALL
		SELECT scope, maker_id AS user_id, -raw AS v FROM t
	) GROUP BY scope, user_id
),
scales AS (
	SELECT scope, count(*) AS participants, sum(CASE WHEN net > 0 THEN net ELSE 0 END) AS winnings
	FROM nets GROUP BY scope
)
UPDATE transfers SET points = (
	SELECT CASE WHEN s.winnings > 0 THEN t.raw * 100.0 * s.participants / s.winnings ELSE 0 END
	FROM t JOIN scales s ON s.scope = t.scope
	WHERE t.id = transfers.id
);
