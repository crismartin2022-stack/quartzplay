-- QuartzPlay Relational slice 4/4: reporting view.
-- Generated from the production schema catalog on 2026-09-17 (schema only: no data, owners, or privileges).
-- Applied to staging only; production already contains these objects.

CREATE VIEW public.v_actividad AS
 SELECT b.created_at AS fecha,
    u.creado_por AS agencia_code,
    b.user_id,
    'deportivas'::text AS producto,
    NULL::text AS detalle,
    (b.stake)::numeric AS apostado,
        CASE
            WHEN (b.status = ANY (ARRAY['won'::text, 'paid'::text])) THEN COALESCE((b.potential_win)::numeric, ((b.stake)::numeric * b.odd_total))
            ELSE (0)::numeric
        END AS pagado,
    ((b.stake)::numeric -
        CASE
            WHEN (b.status = ANY (ARRAY['won'::text, 'paid'::text])) THEN COALESCE((b.potential_win)::numeric, ((b.stake)::numeric * b.odd_total))
            ELSE (0)::numeric
        END) AS ggr,
    b.code AS referencia
   FROM (public.betslips b
     LEFT JOIN public.users u ON ((u.id = b.user_id)))
  WHERE ((b.status = ANY (ARRAY['won'::text, 'lost'::text, 'paid'::text])) AND (b.anulado_at IS NULL))
UNION ALL
 SELECT r.created_at AS fecha,
    u.creado_por AS agencia_code,
    r.user_id,
    'casino'::text AS producto,
    COALESCE(r.provider, 'casino'::text) AS detalle,
    ((COALESCE(r.stake, (0)::bigint))::numeric / 100.0) AS apostado,
    ((COALESCE(r.win, (0)::bigint))::numeric / 100.0) AS pagado,
    ((COALESCE(r.ggr, (0)::bigint))::numeric / 100.0) AS ggr,
    r.external_tx AS referencia
   FROM (public.casino_rounds r
     LEFT JOIN public.users u ON ((u.id = r.user_id)))
UNION ALL
 SELECT m.creado_en AS fecha,
    u.creado_por AS agencia_code,
    (m.jugador_id)::bigint AS user_id,
    'ruleta'::text AS producto,
    COALESCE(m.juego, 'ruleta'::text) AS detalle,
        CASE
            WHEN (m.tipo = 'apuesta'::text) THEN ((abs(COALESCE(m.monto, (0)::bigint)))::numeric / 100.0)
            ELSE (0)::numeric
        END AS apostado,
        CASE
            WHEN (m.tipo = 'premio'::text) THEN ((COALESCE(m.monto, (0)::bigint))::numeric / 100.0)
            ELSE (0)::numeric
        END AS pagado,
        CASE
            WHEN (m.tipo = 'apuesta'::text) THEN ((abs(COALESCE(m.monto, (0)::bigint)))::numeric / 100.0)
            WHEN (m.tipo = 'premio'::text) THEN (- ((COALESCE(m.monto, (0)::bigint))::numeric / 100.0))
            ELSE (0)::numeric
        END AS ggr,
    m.ref AS referencia
   FROM (public.casino_movimientos m
     LEFT JOIN public.users u ON ((u.id = m.jugador_id)))
  WHERE (m.tipo = ANY (ARRAY['apuesta'::text, 'premio'::text]));
