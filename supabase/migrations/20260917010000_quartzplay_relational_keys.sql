-- QuartzPlay Relational slice 1/4: primary and unique keys.
-- Generated from the production schema catalog on 2026-09-17 (schema only: no data, owners, or privileges).
-- Applied to staging only; production already contains these objects.

ALTER TABLE ONLY public.agencia_movimientos
    ADD CONSTRAINT agencia_movimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agencia_sesiones
    ADD CONSTRAINT agencia_sesiones_pkey PRIMARY KEY (token);

ALTER TABLE ONLY public.agencia_tickets
    ADD CONSTRAINT agencia_tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agencias
    ADD CONSTRAINT agencias_code_key UNIQUE (code);

ALTER TABLE ONLY public.agencias
    ADD CONSTRAINT agencias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (clave);

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.autoexclusiones
    ADD CONSTRAINT autoexclusiones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.avisos
    ADD CONSTRAINT avisos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.avisos_vistos
    ADD CONSTRAINT avisos_vistos_pkey PRIMARY KEY (aviso_id, agencia_code);

ALTER TABLE ONLY public.betslips
    ADD CONSTRAINT betslips_code_key UNIQUE (code);

ALTER TABLE ONLY public.betslips
    ADD CONSTRAINT betslips_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bloqueos_log
    ADD CONSTRAINT bloqueos_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bonos_agencias
    ADD CONSTRAINT bonos_agencias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bonos_costos
    ADD CONSTRAINT bonos_costos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bonos_otorgados
    ADD CONSTRAINT bonos_otorgados_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bonos
    ADD CONSTRAINT bonos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.casino_alertas
    ADD CONSTRAINT casino_alertas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.casino_integraciones
    ADD CONSTRAINT casino_integraciones_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.casino_integraciones
    ADD CONSTRAINT casino_integraciones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.casino_movimientos
    ADD CONSTRAINT casino_movimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.casino_proveedores
    ADD CONSTRAINT casino_proveedores_pkey PRIMARY KEY (marca);

ALTER TABLE ONLY public.casino_rounds
    ADD CONSTRAINT casino_rounds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.casino_sesiones
    ADD CONSTRAINT casino_sesiones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.casino_sesiones
    ADD CONSTRAINT casino_sesiones_sesion_key UNIQUE (sesion);

ALTER TABLE ONLY public.cc_movimientos
    ADD CONSTRAINT cc_movimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.combo_generado
    ADD CONSTRAINT combo_generado_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.combos_compartidos
    ADD CONSTRAINT combos_compartidos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.combos_flash
    ADD CONSTRAINT combos_flash_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.combos_manuales
    ADD CONSTRAINT combos_manuales_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comisiones_historial
    ADD CONSTRAINT comisiones_historial_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.compartidas
    ADD CONSTRAINT compartidas_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.compartidas
    ADD CONSTRAINT compartidas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.compartidas_visitas
    ADD CONSTRAINT compartidas_visitas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.desafios_comisiones
    ADD CONSTRAINT desafios_comisiones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.escaneos_log
    ADD CONSTRAINT escaneos_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.eventos_ajustes
    ADD CONSTRAINT eventos_ajustes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.eventos_bloqueos
    ADD CONSTRAINT eventos_bloqueos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.exposicion
    ADD CONSTRAINT exposicion_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iacoin_cotizaciones
    ADD CONSTRAINT iacoin_cotizaciones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iacoin_movimientos
    ADD CONSTRAINT iacoin_movimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iaqp_apuestas
    ADD CONSTRAINT iaqp_apuestas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iaqp_movimientos
    ADD CONSTRAINT iaqp_movimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iaqp_rondas
    ADD CONSTRAINT iaqp_rondas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.iaqp_semillas
    ADD CONSTRAINT iaqp_semillas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.impresiones_log
    ADD CONSTRAINT impresiones_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.influencer_events
    ADD CONSTRAINT influencer_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.influencers
    ADD CONSTRAINT influencers_code_key UNIQUE (code);

ALTER TABLE ONLY public.influencers
    ADD CONSTRAINT influencers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.limites_apuesta
    ADD CONSTRAINT limites_apuesta_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.limites_jugador
    ADD CONSTRAINT limites_jugador_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT mensajes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.moderacion_log
    ADD CONSTRAINT moderacion_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.muro_comentarios
    ADD CONSTRAINT muro_comentarios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.muro_denuncias
    ADD CONSTRAINT muro_denuncias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.muro_imagenes
    ADD CONSTRAINT muro_imagenes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.muro_likes
    ADD CONSTRAINT muro_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE ONLY public.muro_posts
    ADD CONSTRAINT muro_posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.p2p_apuestas
    ADD CONSTRAINT p2p_apuestas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.p2p_disputas
    ADD CONSTRAINT p2p_disputas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.p2p_movimientos
    ADD CONSTRAINT p2p_movimientos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.productos_catalogo
    ADD CONSTRAINT productos_catalogo_pkey PRIMARY KEY (codigo);

ALTER TABLE ONLY public.productos_permisos
    ADD CONSTRAINT productos_permisos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.proveedores_permisos
    ADD CONSTRAINT proveedores_permisos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.psp_cargas
    ADD CONSTRAINT psp_cargas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.psp_retiros
    ADD CONSTRAINT psp_retiros_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recompensas
    ADD CONSTRAINT recompensas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.retiros
    ADD CONSTRAINT retiros_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.riesgo_alertas
    ADD CONSTRAINT riesgo_alertas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.riesgo_config
    ADD CONSTRAINT riesgo_config_pkey PRIMARY KEY (clave);

ALTER TABLE ONLY public.sesiones_juego
    ADD CONSTRAINT sesiones_juego_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.soporte_mensajes
    ADD CONSTRAINT soporte_mensajes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.soporte_tickets
    ADD CONSTRAINT soporte_tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sports_bets
    ADD CONSTRAINT sports_bets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.superbono_aportes
    ADD CONSTRAINT superbono_aportes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.superbono_ganadores
    ADD CONSTRAINT superbono_ganadores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.superbono_pozo
    ADD CONSTRAINT superbono_pozo_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.terminal_escaneos
    ADD CONSTRAINT terminal_escaneos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.terminales
    ADD CONSTRAINT terminales_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.terminales
    ADD CONSTRAINT terminales_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.usuarios_activos
    ADD CONSTRAINT usuarios_activos_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.vinculos_telegram
    ADD CONSTRAINT vinculos_telegram_codigo_key UNIQUE (codigo);

ALTER TABLE ONLY public.vinculos_telegram
    ADD CONSTRAINT vinculos_telegram_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.web_banners
    ADD CONSTRAINT web_banners_pkey PRIMARY KEY (id);
