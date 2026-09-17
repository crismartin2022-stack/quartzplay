-- QuartzPlay Relational slice 2/4: standalone indexes (the seven runtime bootstrap indexes are guarded with IF NOT EXISTS).
-- Generated from the production schema catalog on 2026-09-17 (schema only: no data, owners, or privileges).
-- Applied to staging only; production already contains these objects.

CREATE INDEX activos_ultimo ON public.usuarios_activos USING btree (ultimo_at DESC);

CREATE INDEX agencias_parent ON public.agencias USING btree (parent_code);

CREATE INDEX agencias_ruta ON public.agencias USING btree (ruta);

CREATE UNIQUE INDEX agencias_username_unico ON public.agencias USING btree (lower(username)) WHERE (username IS NOT NULL);

CREATE INDEX agmov_agencia_fecha ON public.agencia_movimientos USING btree (agencia_code, created_at DESC);

CREATE INDEX agmov_tipo_fecha ON public.agencia_movimientos USING btree (tipo, created_at DESC);

CREATE INDEX agmov_user_fecha ON public.agencia_movimientos USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX ajustes_unico ON public.eventos_ajustes USING btree (event_id, COALESCE(mercado, ''::text), COALESCE(seleccion, ''::text), alcance, COALESCE(agencia_code, ''::text));

CREATE INDEX alertas_abiertas ON public.riesgo_alertas USING btree (estado, severidad);

CREATE UNIQUE INDEX alertas_huella ON public.riesgo_alertas USING btree (huella) WHERE (huella IS NOT NULL);

CREATE INDEX audit_actor ON public.auditoria USING btree (actor, created_at DESC);

CREATE INDEX audit_evento ON public.auditoria USING btree (evento, created_at DESC);

CREATE INDEX audit_fecha ON public.auditoria USING btree (created_at DESC);

CREATE INDEX autoex_hasta ON public.autoexclusiones USING btree (hasta) WHERE (activa = true);

CREATE INDEX autoex_user ON public.autoexclusiones USING btree (user_id, activa);

CREATE INDEX avisos_vigentes ON public.avisos USING btree (created_at DESC);

CREATE INDEX betslips_code ON public.betslips USING btree (code);

CREATE INDEX betslips_fecha ON public.betslips USING btree (created_at DESC);

CREATE INDEX betslips_fecha_estado ON public.betslips USING btree (created_at, status);

CREATE INDEX betslips_ip ON public.betslips USING btree (ip) WHERE (ip IS NOT NULL);

CREATE INDEX betslips_paid_by ON public.betslips USING btree (paid_by);

CREATE INDEX betslips_pendientes ON public.betslips USING btree (status, created_at) WHERE (status = 'pending'::text);

CREATE INDEX betslips_status ON public.betslips USING btree (status);

CREATE INDEX betslips_terminal ON public.betslips USING btree (terminal_codigo) WHERE (terminal_codigo IS NOT NULL);

CREATE INDEX betslips_user ON public.betslips USING btree (user_id, created_at DESC);

CREATE INDEX betslips_user_fecha ON public.betslips USING btree (user_id, created_at DESC);

CREATE INDEX bloqueos_deporte ON public.eventos_bloqueos USING btree (sport_key) WHERE (sport_key IS NOT NULL);

CREATE INDEX bloqueos_evento ON public.eventos_bloqueos USING btree (event_id) WHERE (event_id IS NOT NULL);

CREATE INDEX bonos_ag ON public.bonos_agencias USING btree (agencia_code);

CREATE INDEX bonos_costos_agencia ON public.bonos_costos USING btree (agencia_code, created_at DESC);

CREATE INDEX bonos_costos_fecha ON public.bonos_costos USING btree (created_at DESC);

CREATE UNIQUE INDEX bonos_costos_unico ON public.bonos_costos USING btree (otorgado_id) WHERE (otorgado_id IS NOT NULL);

CREATE INDEX bonos_otorg_user ON public.bonos_otorgados USING btree (user_id, estado);

CREATE INDEX casino_alertas_abiertas ON public.casino_alertas USING btree (estado, severidad, created_at DESC);

CREATE UNIQUE INDEX casino_alertas_huella ON public.casino_alertas USING btree (huella) WHERE (huella IS NOT NULL);

CREATE INDEX casino_mov_fecha ON public.casino_movimientos USING btree (creado_en DESC);

CREATE INDEX casino_mov_jugador ON public.casino_movimientos USING btree (jugador_id);

CREATE UNIQUE INDEX casino_ref_unico ON public.casino_movimientos USING btree (ref) WHERE (ref IS NOT NULL);

CREATE INDEX casino_rounds_fecha ON public.casino_rounds USING btree (created_at DESC);

CREATE INDEX casino_rounds_user ON public.casino_rounds USING btree (user_id);

CREATE INDEX cc_agencia ON public.cc_movimientos USING btree (agencia_code, created_at DESC);

CREATE INDEX ccmov_agencia_fecha ON public.cc_movimientos USING btree (agencia_code, created_at DESC);

CREATE INDEX combo_gen_ag ON public.combo_generado USING btree (agencia_code, fecha);

CREATE INDEX combo_gen_user ON public.combo_generado USING btree (user_id, fecha);

CREATE INDEX combos_creador ON public.combos_manuales USING btree (creado_por);

CREATE INDEX combos_origen ON public.combos_manuales USING btree (origen, visible);

CREATE INDEX compartidas_betslip ON public.compartidas USING btree (betslip_code);

CREATE INDEX compartidas_user ON public.compartidas USING btree (user_id, created_at DESC);

CREATE INDEX csesion_ext ON public.casino_sesiones USING btree (sesion_ext) WHERE (sesion_ext IS NOT NULL);

CREATE INDEX csesion_user ON public.casino_sesiones USING btree (user_id, created_at DESC);

CREATE INDEX desaf_com_agencia ON public.desafios_comisiones USING btree (agencia_code, created_at DESC);

CREATE INDEX desaf_com_desafio ON public.desafios_comisiones USING btree (desafio_id);

CREATE INDEX escaneos_terminal ON public.terminal_escaneos USING btree (terminal_id, created_at DESC);

CREATE INDEX exposicion_evento ON public.exposicion USING btree (event_id, seleccion);

CREATE INDEX flash_vence ON public.combos_flash USING btree (vence_at DESC);

CREATE INDEX iacoin_cot_moneda ON public.iacoin_cotizaciones USING btree (moneda, created_at DESC);

CREATE UNIQUE INDEX iacoin_cot_vigente ON public.iacoin_cotizaciones USING btree (moneda) WHERE (vigente = true);

CREATE INDEX iacoin_mov_agencia ON public.iacoin_movimientos USING btree (agencia_code, created_at DESC);

CREATE INDEX iacoin_mov_tipo ON public.iacoin_movimientos USING btree (tipo, created_at DESC);

CREATE INDEX iacoin_mov_user ON public.iacoin_movimientos USING btree (user_id, created_at DESC);

CREATE INDEX iaqp_apuestas_jugador ON public.iaqp_apuestas USING btree (jugador_id, creada_en DESC);

CREATE UNIQUE INDEX iaqp_apuestas_ref ON public.iaqp_apuestas USING btree (ronda_id, ref) WHERE (ref IS NOT NULL);

CREATE INDEX iaqp_apuestas_ronda ON public.iaqp_apuestas USING btree (ronda_id);

CREATE INDEX iaqp_mov_jugador ON public.iaqp_movimientos USING btree (jugador_id, creado_en DESC);

CREATE INDEX iaqp_mov_pendientes ON public.iaqp_movimientos USING btree (estado) WHERE (estado <> 'confirmado'::text);

CREATE UNIQUE INDEX iaqp_mov_ref ON public.iaqp_movimientos USING btree (ref_externa) WHERE (ref_externa IS NOT NULL);

CREATE INDEX iaqp_rondas_mesa ON public.iaqp_rondas USING btree (mesa_id, abierta_en DESC);

CREATE UNIQUE INDEX iaqp_rondas_unica ON public.iaqp_rondas USING btree (semilla_id, nonce);

CREATE UNIQUE INDEX iaqp_semillas_hash ON public.iaqp_semillas USING btree (hash_publicado);

CREATE INDEX IF NOT EXISTS idx_agencia_tickets ON public.agencia_tickets USING btree (agencia_code);

CREATE INDEX IF NOT EXISTS idx_agencias_code ON public.agencias USING btree (code);

CREATE INDEX IF NOT EXISTS idx_agencias_user ON public.agencias USING btree (username);

CREATE INDEX IF NOT EXISTS idx_bets_user ON public.sports_bets USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_betslips_code ON public.betslips USING btree (code);

CREATE INDEX IF NOT EXISTS idx_inf_events ON public.influencer_events USING btree (influencer_code);

CREATE INDEX IF NOT EXISTS idx_users_tg ON public.users USING btree (telegram_id);

CREATE INDEX img_pendientes ON public.muro_imagenes USING btree (estado, created_at) WHERE (estado = 'pendiente'::text);

CREATE INDEX img_user ON public.muro_imagenes USING btree (user_id, created_at DESC);

CREATE INDEX inf_events_code ON public.influencer_events USING btree (influencer_code, created_at DESC);

CREATE INDEX juegos_catalogo ON public.casino_juegos USING btree (activo, es_vivo, integracion) WHERE (activo = true);

CREATE INDEX juegos_clave ON public.casino_juegos USING btree (clave_juego);

CREATE INDEX juegos_marca ON public.casino_juegos USING btree (marca, activo);

CREATE UNIQUE INDEX juegos_unico ON public.casino_juegos USING btree (integracion, game_id);

CREATE INDEX juegos_vivo ON public.casino_juegos USING btree (es_vivo, activo);

CREATE UNIQUE INDEX lim_jug_unico ON public.limites_jugador USING btree (user_id, tipo, periodo);

CREATE INDEX lim_jug_user ON public.limites_jugador USING btree (user_id, activo);

CREATE INDEX limites_agencia ON public.limites_apuesta USING btree (agencia_code);

CREATE UNIQUE INDEX limites_global_moneda ON public.limites_apuesta USING btree (moneda) WHERE (alcance = 'global'::text);

CREATE INDEX liq_agencia ON public.liquidaciones USING btree (agencia_code, created_at DESC);

CREATE INDEX mensajes_hilo ON public.mensajes USING btree (agencia_code, created_at DESC);

CREATE INDEX mensajes_sin_leer ON public.mensajes USING btree (agencia_code, leido) WHERE (leido = false);

CREATE INDEX mod_user ON public.moderacion_log USING btree (user_id, created_at DESC);

CREATE INDEX mov_agencia ON public.agencia_movimientos USING btree (agencia_code, created_at DESC);

CREATE INDEX muro_agencia ON public.muro_posts USING btree (agencia_code);

CREATE INDEX muro_com_post ON public.muro_comentarios USING btree (post_id, created_at);

CREATE INDEX muro_den_abiertas ON public.muro_denuncias USING btree (estado, created_at);

CREATE INDEX muro_fecha ON public.muro_posts USING btree (created_at DESC) WHERE (oculto = false);

CREATE INDEX muro_user ON public.muro_posts USING btree (user_id, created_at DESC);

CREATE INDEX p2p_abiertas ON public.p2p_apuestas USING btree (estado, created_at DESC);

CREATE INDEX p2p_aceptador ON public.p2p_apuestas USING btree (aceptador_id);

CREATE INDEX p2p_busqueda ON public.p2p_apuestas USING btree (estado, event_id, created_at DESC) WHERE (estado = 'abierta'::text);

CREATE INDEX p2p_creador ON public.p2p_apuestas USING btree (creador_id);

CREATE INDEX p2p_disp_abiertas ON public.p2p_disputas USING btree (estado, created_at);

CREATE UNIQUE INDEX p2p_disp_unica ON public.p2p_disputas USING btree (apuesta_id);

CREATE INDEX p2p_estado_fecha ON public.p2p_apuestas USING btree (estado, created_at DESC);

CREATE INDEX p2p_evento ON public.p2p_apuestas USING btree (event_id) WHERE (event_id IS NOT NULL);

CREATE INDEX p2p_mov_apuesta ON public.p2p_movimientos USING btree (apuesta_id);

CREATE INDEX p2p_mov_user ON public.p2p_movimientos USING btree (user_id, created_at DESC);

CREATE INDEX prod_perm_agencia ON public.productos_permisos USING btree (agencia_code);

CREATE UNIQUE INDEX prod_perm_unico ON public.productos_permisos USING btree (agencia_code, producto);

CREATE INDEX prov_perm_agencia ON public.proveedores_permisos USING btree (agencia_code);

CREATE INDEX prov_perm_marca ON public.proveedores_permisos USING btree (marca);

CREATE UNIQUE INDEX prov_perm_unico ON public.proveedores_permisos USING btree (agencia_code, marca);

CREATE INDEX recompensas_fecha ON public.recompensas USING btree (created_at DESC);

CREATE INDEX recompensas_user ON public.recompensas USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX recompensas_visita ON public.recompensas USING btree (visita_id) WHERE (visita_id IS NOT NULL);

CREATE INDEX retiros_estado ON public.retiros USING btree (estado, creado_at DESC);

CREATE INDEX rounds_agencia ON public.casino_rounds USING btree (agencia_code, created_at DESC);

CREATE UNIQUE INDEX rounds_external_tx ON public.casino_rounds USING btree (external_tx) WHERE (external_tx IS NOT NULL);

CREATE INDEX rounds_fecha ON public.casino_rounds USING btree (created_at DESC);

CREATE INDEX rounds_game ON public.casino_rounds USING btree (game_id) WHERE (game_id IS NOT NULL);

CREATE INDEX rounds_user_fecha ON public.casino_rounds USING btree (user_id, created_at DESC);

CREATE INDEX sb_aportes_pozo ON public.superbono_aportes USING btree (pozo_id);

CREATE INDEX sb_gan_pozo ON public.superbono_ganadores USING btree (pozo_id);

CREATE INDEX sb_gan_user ON public.superbono_ganadores USING btree (user_id, visto);

CREATE INDEX ses_juego_user ON public.sesiones_juego USING btree (user_id, cerrada);

CREATE INDEX sesiones_agencia ON public.agencia_sesiones USING btree (agencia_code);

CREATE INDEX sesiones_expira ON public.agencia_sesiones USING btree (expira_at);

CREATE INDEX sop_msg_ticket ON public.soporte_mensajes USING btree (ticket_id, created_at);

CREATE INDEX sports_bets_user ON public.sports_bets USING btree (user_id);

CREATE INDEX terminales_agencia ON public.terminales USING btree (agencia_code, activa);

CREATE INDEX tickets_ag ON public.soporte_tickets USING btree (agencia_code, estado);

CREATE INDEX tickets_agencia ON public.agencia_tickets USING btree (agencia_code, created_at DESC);

CREATE INDEX tickets_betslip ON public.agencia_tickets USING btree (betslip_code);

CREATE INDEX tickets_user ON public.soporte_tickets USING btree (user_id, created_at DESC);

CREATE INDEX users_agencia ON public.users USING btree (creado_por);

CREATE INDEX users_documento ON public.users USING btree (documento) WHERE (documento IS NOT NULL);

CREATE INDEX users_ip ON public.users USING btree (ip_ultima);

CREATE INDEX users_last_seen ON public.users USING btree (last_seen DESC NULLS LAST);

CREATE UNIQUE INDEX users_telegram_unico ON public.users USING btree (telegram_id) WHERE (telegram_id IS NOT NULL);

CREATE UNIQUE INDEX users_username_unico ON public.users USING btree (lower(username)) WHERE (username IS NOT NULL);

CREATE INDEX visitas_compartida ON public.compartidas_visitas USING btree (compartida_id);

CREATE UNIQUE INDEX visitas_unica ON public.compartidas_visitas USING btree (compartida_id, COALESCE(device_hash, ip));

CREATE INDEX wallet_user ON public.wallet_transactions USING btree (user_id, created_at DESC);
