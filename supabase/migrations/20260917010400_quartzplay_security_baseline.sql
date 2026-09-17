-- QuartzPlay Security baseline: no Supabase Data API access for anon or authenticated.
-- Generated from the production schema catalog on 2026-09-17 (schema only: no data, owners, or privileges).
-- Applied to staging only; production already contains these objects.

ALTER TABLE public.agencia_movimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agencia_sesiones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agencia_tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agencias ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.autoexclusiones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.avisos_vistos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.betslips ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bloqueos_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bonos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bonos_agencias ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bonos_costos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bonos_otorgados ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_alertas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_integraciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_juegos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_movimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_proveedores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_rounds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.casino_sesiones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cc_movimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.combo_generado ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.combos_compartidos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.combos_flash ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.combos_manuales ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comisiones_historial ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.compartidas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.compartidas_visitas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.desafios_comisiones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.escaneos_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eventos_ajustes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eventos_bloqueos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.exposicion ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iacoin_cotizaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iacoin_movimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iaqp_apuestas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iaqp_movimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iaqp_rondas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iaqp_semillas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.impresiones_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.influencer_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.limites_apuesta ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.limites_jugador ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.liquidaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.moderacion_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.muro_comentarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.muro_denuncias ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.muro_imagenes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.muro_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.muro_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.p2p_apuestas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.p2p_disputas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.p2p_movimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.productos_catalogo ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.productos_permisos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proveedores_permisos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.psp_cargas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.psp_retiros ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recompensas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.retiros ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.riesgo_alertas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.riesgo_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sesiones_juego ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.soporte_mensajes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.soporte_tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sports_bets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.superbono_aportes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.superbono_ganadores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.superbono_pozo ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.terminal_escaneos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.terminales ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usuarios_activos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vinculos_telegram ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.web_banners ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
