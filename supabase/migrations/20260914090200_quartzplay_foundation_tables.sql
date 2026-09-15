BEGIN;

CREATE TABLE public.agencia_movimientos (
    id integer DEFAULT nextval('agencia_movimientos_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    tipo text NOT NULL,
    user_id bigint,
    betslip_code text,
    monto bigint,
    detalle text,
    operador text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agencia_sesiones (
    token text NOT NULL,
    agencia_code text NOT NULL,
    creada_at timestamp with time zone DEFAULT now(),
    expira_at timestamp with time zone NOT NULL
);

CREATE TABLE public.agencia_tickets (
    id bigint DEFAULT nextval('agencia_tickets_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    betslip_code text,
    tipo text,
    stake bigint,
    potential_win bigint,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    anulado boolean DEFAULT false,
    anulado_at timestamp with time zone
);

CREATE TABLE public.agencias (
    id bigint DEFAULT nextval('agencias_id_seq'::regclass) NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    username text,
    password_hash text,
    address text,
    phone text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    parent_code text,
    ruta text,
    nivel integer DEFAULT 0,
    pct_ggr numeric(6,2) DEFAULT 0,
    pct_ventas numeric(6,2) DEFAULT 0,
    moneda text DEFAULT 'ARS'::text,
    saldo_cc numeric(16,2) DEFAULT 0,
    bloqueado_por text,
    bloqueado_motivo text,
    tipo text DEFAULT 'agencia'::text,
    codigo_ref text,
    alcance text,
    debe_cambiar_pass boolean DEFAULT false,
    permiso text,
    telegram_id bigint,
    puede_anular boolean DEFAULT false,
    puede_cashout boolean DEFAULT true,
    whatsapp text,
    telegram_url text,
    soporte_horario text,
    pct_ggr_casino numeric(6,2) DEFAULT 0,
    pct_desafios numeric(6,2) DEFAULT 0
);

CREATE TABLE public.app_config (
    clave text NOT NULL,
    valor text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.auditoria (
    id bigint DEFAULT nextval('auditoria_id_seq'::regclass) NOT NULL,
    evento text NOT NULL,
    actor text,
    actor_tipo text,
    objetivo text,
    detalle jsonb,
    ip text,
    hash_previo text,
    hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.autoexclusiones (
    id integer DEFAULT nextval('autoexclusiones_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    plazo text NOT NULL,
    motivo text,
    desde timestamp with time zone DEFAULT now() NOT NULL,
    hasta timestamp with time zone,
    levantada_at timestamp with time zone,
    activa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.avisos (
    id integer DEFAULT nextval('avisos_id_seq'::regclass) NOT NULL,
    titulo text NOT NULL,
    cuerpo text,
    nivel text DEFAULT 'info'::text,
    alcance text DEFAULT 'todas'::text,
    agencia_code text,
    vence_at timestamp with time zone,
    creado_por text,
    created_at timestamp with time zone DEFAULT now(),
    destinos text DEFAULT 'agencia'::text
);

CREATE TABLE public.avisos_vistos (
    aviso_id integer NOT NULL,
    agencia_code text NOT NULL,
    visto_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.betslips (
    id bigint DEFAULT nextval('betslips_id_seq'::regclass) NOT NULL,
    code text NOT NULL,
    user_id bigint,
    picks text NOT NULL,
    stake bigint NOT NULL,
    odd_total numeric(12,3),
    potential_win bigint,
    status text DEFAULT 'pending'::text,
    inf_code text,
    paid_at timestamp with time zone,
    paid_by text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    cliente_nombre text,
    resultado text,
    liquidado_at timestamp with time zone,
    liquidado_por text,
    pagado_at timestamp with time zone,
    pagado_por text,
    influencer_code text,
    con_bono boolean DEFAULT false,
    anulado_at timestamp with time zone,
    anulado_por text,
    anulado_motivo text,
    boost_pct numeric(6,2) DEFAULT 0,
    boost_extra bigint DEFAULT 0,
    ip text,
    user_agent text,
    device_hash text,
    es_live boolean DEFAULT false,
    terminal_codigo text
);

CREATE TABLE public.bloqueos_log (
    id integer DEFAULT nextval('bloqueos_log_id_seq'::regclass) NOT NULL,
    quien text,
    objetivo text,
    tipo_obj text,
    accion text,
    motivo text,
    cascada boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bonos (
    id bigint DEFAULT nextval('bonos_id_seq'::regclass) NOT NULL,
    nombre text NOT NULL,
    tipo text,
    monto_fijo bigint,
    porcentaje numeric(6,2),
    tope bigint,
    rollover numeric(6,2),
    activo boolean DEFAULT true,
    creado_at timestamp with time zone DEFAULT now(),
    influencer_code text,
    deposito_minimo bigint,
    cuota_minima numeric(6,2),
    requiere_verificacion boolean DEFAULT false,
    evento text,
    stake_max_tipo text,
    stake_max_valor numeric(12,2),
    cuota_maxima numeric(6,2),
    mercados_excluidos text,
    vigente_desde date,
    vigente_hasta date,
    dias_semana text,
    hora_desde integer,
    hora_hasta integer,
    pct_paga_casa numeric(6,2) DEFAULT 100,
    pct_paga_agencia numeric(6,2) DEFAULT 0
);

CREATE TABLE public.bonos_agencias (
    id bigint DEFAULT nextval('bonos_agencias_id_seq'::regclass) NOT NULL,
    bono_id bigint,
    agencia_code text,
    habilitado boolean DEFAULT true
);

CREATE TABLE public.bonos_costos (
    id integer DEFAULT nextval('bonos_costos_id_seq'::regclass) NOT NULL,
    otorgado_id bigint,
    bono_id bigint,
    user_id bigint,
    agencia_code text,
    producto text DEFAULT 'sports'::text NOT NULL,
    monto numeric(16,2) NOT NULL,
    pct_casa numeric(6,2) DEFAULT 100 NOT NULL,
    pct_agencia numeric(6,2) DEFAULT 0 NOT NULL,
    costo_casa numeric(16,2) DEFAULT 0 NOT NULL,
    costo_agencia numeric(16,2) DEFAULT 0 NOT NULL,
    motivo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bonos_otorgados (
    id bigint DEFAULT nextval('bonos_otorgados_id_seq'::regclass) NOT NULL,
    bono_id bigint,
    user_id bigint,
    monto bigint,
    rollover_objetivo bigint,
    rollover_cumplido bigint DEFAULT 0,
    estado text DEFAULT 'activo'::text,
    agencia_code text,
    otorgado_at timestamp with time zone DEFAULT now(),
    liberado_at timestamp with time zone
);

CREATE TABLE public.casino_alertas (
    id integer DEFAULT nextval('casino_alertas_id_seq'::regclass) NOT NULL,
    tipo text NOT NULL,
    severidad text NOT NULL,
    titulo text,
    detalle text,
    user_id bigint,
    marca text,
    game_id text,
    agencia_code text,
    apostado numeric(16,2),
    pagado numeric(16,2),
    ggr numeric(16,2),
    jugadas integer,
    analisis_ia text,
    sugerencia text,
    estado text DEFAULT 'abierta'::text NOT NULL,
    revisada_por text,
    revisada_at timestamp with time zone,
    nota text,
    huella text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.casino_integraciones (
    id integer DEFAULT nextval('casino_integraciones_id_seq'::regclass) NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    activa boolean DEFAULT false NOT NULL,
    url text,
    api_code text,
    api_secret text,
    monedas text DEFAULT 'ARS'::text,
    prioridad integer DEFAULT 100 NOT NULL,
    notas text,
    ultimo_sync timestamp with time zone,
    juegos_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.casino_juegos (
    game_id text NOT NULL,
    titulo text,
    marca text,
    imagen text,
    actualizado timestamp with time zone DEFAULT now() NOT NULL,
    id integer DEFAULT nextval('casino_juegos_id_seq'::regclass) NOT NULL,
    integracion text,
    es_vivo boolean DEFAULT false,
    movil boolean DEFAULT true,
    escritorio boolean DEFAULT true,
    clave_juego text,
    activo boolean DEFAULT true
);

CREATE TABLE public.casino_movimientos (
    id bigint DEFAULT nextval('casino_movimientos_id_seq'::regclass) NOT NULL,
    ref text,
    jugador_id integer,
    tipo text,
    monto bigint,
    saldo_previo bigint,
    saldo_post bigint,
    juego text,
    mesa_id text,
    creado_en timestamp with time zone DEFAULT now()
);

CREATE TABLE public.casino_proveedores (
    marca text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    es_vivo boolean DEFAULT false NOT NULL,
    motivo text,
    apagado_por text,
    apagado_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    en_app boolean DEFAULT true,
    en_web boolean DEFAULT true,
    forzar_movil boolean DEFAULT false
);

CREATE TABLE public.casino_rounds (
    id bigint DEFAULT nextval('casino_rounds_id_seq'::regclass) NOT NULL,
    user_id bigint,
    game text,
    provider text,
    stake bigint,
    win bigint,
    ggr bigint,
    external_tx text,
    created_at timestamp with time zone DEFAULT now(),
    game_id text,
    game_titulo text,
    agencia_code text,
    sesion text,
    integracion text
);

CREATE TABLE public.casino_sesiones (
    id integer DEFAULT nextval('casino_sesiones_id_seq'::regclass) NOT NULL,
    sesion text NOT NULL,
    sesion_ext text,
    user_id bigint NOT NULL,
    agencia_code text,
    game_id text NOT NULL,
    game_titulo text,
    moneda text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_uso timestamp with time zone,
    integracion text
);

CREATE TABLE public.cc_movimientos (
    id integer DEFAULT nextval('cc_movimientos_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    contra_code text,
    tipo text,
    monto numeric(16,2),
    saldo_luego numeric(16,2),
    detalle text,
    creado_por text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combo_generado (
    id integer DEFAULT nextval('combo_generado_id_seq'::regclass) NOT NULL,
    user_id bigint,
    agencia_code text,
    fecha date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combos_compartidos (
    id bigint DEFAULT nextval('combos_compartidos_id_seq'::regclass) NOT NULL,
    combo_id bigint,
    destino_code text,
    tipo text,
    creado_por text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combos_flash (
    id integer DEFAULT nextval('combos_flash_id_seq'::regclass) NOT NULL,
    nombre text NOT NULL,
    picks text NOT NULL,
    odd_total numeric(10,3) NOT NULL,
    extra_pct numeric(6,2) DEFAULT 0,
    vence_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.combos_manuales (
    id integer DEFAULT nextval('combos_manuales_id_seq'::regclass) NOT NULL,
    origen text,
    creado_por text,
    nombre text,
    picks text,
    odd_total numeric(12,3),
    visible boolean DEFAULT true,
    agencias text,
    created_at timestamp with time zone DEFAULT now(),
    destino_box boolean DEFAULT false,
    destino_app boolean DEFAULT false,
    destino_agencia boolean DEFAULT false,
    fuente text,
    influencer_code text,
    codigo text,
    primer_evento_at timestamp with time zone,
    auto_batch text
);

CREATE TABLE public.comisiones_historial (
    id integer DEFAULT nextval('comisiones_historial_id_seq'::regclass) NOT NULL,
    agencia_code text,
    pct_ggr_ant numeric(6,2),
    pct_ggr_new numeric(6,2),
    pct_ventas_ant numeric(6,2),
    pct_ventas_new numeric(6,2),
    cambiado_por text,
    created_at timestamp with time zone DEFAULT now(),
    pct_casino_ant numeric(6,2),
    pct_casino_new numeric(6,2)
);

CREATE TABLE public.compartidas (
    id integer DEFAULT nextval('compartidas_id_seq'::regclass) NOT NULL,
    codigo text NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    betslip_code text,
    ip_origen text,
    device_origen text,
    visitas integer DEFAULT 0 NOT NULL,
    pagadas integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.compartidas_visitas (
    id integer DEFAULT nextval('compartidas_visitas_id_seq'::regclass) NOT NULL,
    compartida_id integer NOT NULL,
    ip text,
    device_hash text,
    pagada boolean DEFAULT false NOT NULL,
    motivo_rechazo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.desafios_comisiones (
    id integer DEFAULT nextval('desafios_comisiones_id_seq'::regclass) NOT NULL,
    desafio_id integer NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    apostado numeric(16,4) NOT NULL,
    comision numeric(16,4) NOT NULL,
    pct_aplicado numeric(6,2) NOT NULL,
    gano boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.escaneos_log (
    id integer DEFAULT nextval('escaneos_log_id_seq'::regclass) NOT NULL,
    influencer_code text,
    picks_leidos integer,
    picks_ok integer,
    cuota_total numeric(12,3),
    jugo boolean DEFAULT false,
    betslip_code text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.eventos_ajustes (
    id integer DEFAULT nextval('eventos_ajustes_id_seq'::regclass) NOT NULL,
    event_id text NOT NULL,
    mercado text,
    seleccion text,
    alcance text DEFAULT 'global'::text,
    agencia_code text,
    ajuste_pct numeric(6,2) DEFAULT 0,
    cuota_fija numeric(8,3),
    etiqueta text,
    motivo text,
    creado_por text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.eventos_bloqueos (
    id integer DEFAULT nextval('eventos_bloqueos_id_seq'::regclass) NOT NULL,
    objeto text NOT NULL,
    event_id text,
    sport_key text,
    mercado text,
    alcance text NOT NULL,
    agencia_code text,
    modo text DEFAULT 'ambos'::text,
    motivo text,
    etiqueta text,
    creado_por text,
    vence_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.exposicion (
    id integer DEFAULT nextval('exposicion_id_seq'::regclass) NOT NULL,
    code text,
    event_id text,
    sport_key text,
    seleccion text,
    mercado text,
    monto_riesgo bigint,
    creado_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.iacoin_cotizaciones (
    id integer DEFAULT nextval('iacoin_cotizaciones_id_seq'::regclass) NOT NULL,
    moneda text NOT NULL,
    precio_compra numeric(16,4) NOT NULL,
    precio_venta numeric(16,4) NOT NULL,
    spread_pct numeric(6,2) DEFAULT 3 NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    fuente text,
    sugerido_ia numeric(16,4),
    nota_ia text,
    confirmado_por text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.iacoin_movimientos (
    id integer DEFAULT nextval('iacoin_movimientos_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    tipo text NOT NULL,
    cantidad numeric(16,4) NOT NULL,
    moneda text,
    monto_local numeric(16,2),
    cotizacion numeric(16,4),
    saldo_post numeric(16,4),
    desafio_id integer,
    detalle text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.iaqp_apuestas (
    id bigint DEFAULT nextval('iaqp_apuestas_id_seq'::regclass) NOT NULL,
    ronda_id bigint NOT NULL,
    jugador_id text NOT NULL,
    tipo text NOT NULL,
    valor jsonb,
    monto bigint NOT NULL,
    gana boolean,
    devuelto bigint DEFAULT 0 NOT NULL,
    ref text,
    creada_en timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.iaqp_movimientos (
    id bigint DEFAULT nextval('iaqp_movimientos_id_seq'::regclass) NOT NULL,
    jugador_id text NOT NULL,
    ronda_id bigint,
    tipo text NOT NULL,
    monto bigint NOT NULL,
    ref_externa text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    error text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    confirmado_en timestamp with time zone
);

CREATE TABLE public.iaqp_rondas (
    id bigint DEFAULT nextval('iaqp_rondas_id_seq'::regclass) NOT NULL,
    mesa_id text NOT NULL,
    juego text NOT NULL,
    version_reglas integer DEFAULT 1 NOT NULL,
    semilla_id integer NOT NULL,
    nonce integer NOT NULL,
    semilla_cliente text NOT NULL,
    estado text NOT NULL,
    resultado jsonb,
    apostado bigint DEFAULT 0 NOT NULL,
    devuelto bigint DEFAULT 0 NOT NULL,
    abierta_en timestamp with time zone NOT NULL,
    cerrada_en timestamp with time zone,
    resuelta_en timestamp with time zone
);

CREATE TABLE public.iaqp_semillas (
    id integer DEFAULT nextval('iaqp_semillas_id_seq'::regclass) NOT NULL,
    mesa_id text NOT NULL,
    hash_publicado text NOT NULL,
    semilla text,
    rondas integer DEFAULT 0 NOT NULL,
    abierta_en timestamp with time zone DEFAULT now() NOT NULL,
    revelada_en timestamp with time zone
);

CREATE TABLE public.impresiones_log (
    id integer DEFAULT nextval('impresiones_log_id_seq'::regclass) NOT NULL,
    tipo text,
    referencia text,
    agencia_code text,
    quien text,
    detalle text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.influencer_events (
    id bigint DEFAULT nextval('influencer_events_id_seq'::regclass) NOT NULL,
    influencer_code text,
    user_id bigint,
    event text,
    amount bigint,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.influencers (
    id bigint DEFAULT nextval('influencers_id_seq'::regclass) NOT NULL,
    code text,
    name text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.limites_apuesta (
    id bigint DEFAULT nextval('limites_apuesta_id_seq'::regclass) NOT NULL,
    alcance text NOT NULL,
    agencia_code text,
    monto_min bigint,
    monto_max bigint,
    pago_max bigint,
    moneda text,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by text
);

CREATE TABLE public.limites_jugador (
    id integer DEFAULT nextval('limites_jugador_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    tipo text NOT NULL,
    periodo text NOT NULL,
    monto numeric(16,2),
    minutos integer,
    activo boolean DEFAULT true NOT NULL,
    pendiente_monto numeric(16,2),
    pendiente_desde timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.liquidaciones (
    id integer DEFAULT nextval('liquidaciones_id_seq'::regclass) NOT NULL,
    agencia_code text,
    desde date,
    hasta date,
    total_apostado numeric(16,2),
    total_premios numeric(16,2),
    ggr numeric(16,2),
    pct_ggr numeric(6,2),
    pct_ventas numeric(6,2),
    comision_ggr numeric(16,2),
    comision_ventas numeric(16,2),
    comision_total numeric(16,2),
    generada_por text,
    automatica boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    tipo_beneficiario text,
    periodo text,
    ggr_casino numeric(16,2) DEFAULT 0,
    comision_casino numeric(16,2) DEFAULT 0,
    pct_ggr_casino numeric(6,2) DEFAULT 0
);

CREATE TABLE public.mensajes (
    id integer DEFAULT nextval('mensajes_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    de_admin boolean NOT NULL,
    texto text NOT NULL,
    leido boolean DEFAULT false,
    autor text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.moderacion_log (
    id integer DEFAULT nextval('moderacion_log_id_seq'::regclass) NOT NULL,
    user_id bigint,
    tipo text NOT NULL,
    ref_id integer,
    accion text NOT NULL,
    motivo text,
    por text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.muro_comentarios (
    id integer DEFAULT nextval('muro_comentarios_id_seq'::regclass) NOT NULL,
    post_id integer NOT NULL,
    user_id bigint NOT NULL,
    texto text NOT NULL,
    oculto boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.muro_denuncias (
    id integer DEFAULT nextval('muro_denuncias_id_seq'::regclass) NOT NULL,
    post_id integer,
    comentario_id integer,
    user_id bigint NOT NULL,
    motivo text,
    estado text DEFAULT 'abierta'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.muro_imagenes (
    id integer DEFAULT nextval('muro_imagenes_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    destino text NOT NULL,
    ref_id integer,
    datos text,
    url text,
    mime text,
    bytes integer,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    motivo_rechazo text,
    revisada_por text,
    revisada_at timestamp with time zone,
    analisis_ia text,
    denuncias integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.muro_likes (
    post_id integer NOT NULL,
    user_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.muro_posts (
    id integer DEFAULT nextval('muro_posts_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    tipo text DEFAULT 'combo'::text NOT NULL,
    texto text,
    picks text,
    odd_total numeric(12,3),
    betslip_code text,
    p2p_id integer,
    likes integer DEFAULT 0 NOT NULL,
    comentarios integer DEFAULT 0 NOT NULL,
    copiados integer DEFAULT 0 NOT NULL,
    oculto boolean DEFAULT false NOT NULL,
    oculto_por text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.p2p_apuestas (
    id integer DEFAULT nextval('p2p_apuestas_id_seq'::regclass) NOT NULL,
    creador_id bigint NOT NULL,
    aceptador_id bigint,
    event_id text,
    sport_key text,
    titulo text NOT NULL,
    descripcion text,
    evento_fecha timestamp with time zone,
    monto_creador numeric(16,2) NOT NULL,
    monto_aceptador numeric(16,2) NOT NULL,
    moneda text DEFAULT 'ARS'::text NOT NULL,
    estado text DEFAULT 'abierta'::text NOT NULL,
    ganador text,
    resuelta_por text,
    resuelta_at timestamp with time zone,
    nota_resolucion text,
    comision_pct numeric(6,2) DEFAULT 5 NOT NULL,
    comision_monto numeric(16,2),
    agencia_code text,
    publica boolean DEFAULT true NOT NULL,
    vence_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tomada_at timestamp with time zone,
    en_iacoin boolean DEFAULT true,
    comision_creador numeric(16,4),
    comision_aceptador numeric(16,4),
    agencia_aceptador text
);

CREATE TABLE public.p2p_disputas (
    id integer DEFAULT nextval('p2p_disputas_id_seq'::regclass) NOT NULL,
    apuesta_id integer NOT NULL,
    abierta_por bigint NOT NULL,
    motivo text,
    version_creador text,
    version_aceptador text,
    analisis_ia text,
    sugerencia_ia text,
    estado text DEFAULT 'abierta'::text NOT NULL,
    resuelta_por text,
    resuelta_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.p2p_movimientos (
    id integer DEFAULT nextval('p2p_movimientos_id_seq'::regclass) NOT NULL,
    apuesta_id integer,
    user_id bigint NOT NULL,
    tipo text NOT NULL,
    monto numeric(16,2) NOT NULL,
    saldo_post numeric(16,2),
    detalle text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.productos_catalogo (
    codigo text NOT NULL,
    nombre text NOT NULL,
    icono text,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0
);

CREATE TABLE public.productos_permisos (
    id integer DEFAULT nextval('productos_permisos_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    producto text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    definido_por text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.proveedores_permisos (
    id integer DEFAULT nextval('proveedores_permisos_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    marca text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    definido_por text,
    motivo text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.psp_cargas (
    id bigint DEFAULT nextval('psp_cargas_id_seq'::regclass) NOT NULL,
    request_id text,
    user_id bigint,
    cuit text,
    monto bigint,
    estado text,
    agencia_code text,
    creado_at timestamp with time zone DEFAULT now(),
    acreditado_at timestamp with time zone
);

CREATE TABLE public.psp_retiros (
    id bigint DEFAULT nextval('psp_retiros_id_seq'::regclass) NOT NULL,
    payout_id text,
    user_id bigint,
    destino text,
    monto bigint,
    estado text,
    agencia_code text,
    aprobado_por text,
    creado_at timestamp with time zone DEFAULT now(),
    procesado_at timestamp with time zone
);

CREATE TABLE public.recompensas (
    id integer DEFAULT nextval('recompensas_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    tipo text DEFAULT 'compartir'::text NOT NULL,
    monto numeric(16,2) NOT NULL,
    moneda text DEFAULT 'ARS'::text NOT NULL,
    compartida_id integer,
    visita_id integer,
    pct_casa numeric(6,2) DEFAULT 100 NOT NULL,
    pct_agencia numeric(6,2) DEFAULT 0 NOT NULL,
    costo_casa numeric(16,2) DEFAULT 0 NOT NULL,
    costo_agencia numeric(16,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.retiros (
    id bigint DEFAULT nextval('retiros_id_seq'::regclass) NOT NULL,
    code text,
    user_id bigint,
    monto bigint,
    moneda text,
    estado text DEFAULT 'pendiente'::text,
    agencia_code text,
    creado_at timestamp with time zone DEFAULT now(),
    pagado_at timestamp with time zone,
    pagado_por text
);

CREATE TABLE public.riesgo_alertas (
    id integer DEFAULT nextval('riesgo_alertas_id_seq'::regclass) NOT NULL,
    tipo text NOT NULL,
    severidad text NOT NULL,
    titulo text,
    detalle text,
    evidencia jsonb,
    user_id bigint,
    agencia_code text,
    betslip_code text,
    monto numeric(16,2),
    estado text DEFAULT 'abierta'::text,
    revisada_por text,
    revisada_at timestamp with time zone,
    nota text,
    huella text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.riesgo_config (
    clave text NOT NULL,
    valor text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sesiones_juego (
    id integer DEFAULT nextval('sesiones_juego_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    inicio timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_at timestamp with time zone DEFAULT now() NOT NULL,
    minutos integer DEFAULT 0 NOT NULL,
    avisos integer DEFAULT 0 NOT NULL,
    cerrada boolean DEFAULT false NOT NULL
);

CREATE TABLE public.soporte_mensajes (
    id integer DEFAULT nextval('soporte_mensajes_id_seq'::regclass) NOT NULL,
    ticket_id integer NOT NULL,
    autor text NOT NULL,
    texto text NOT NULL,
    leido boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.soporte_tickets (
    id integer DEFAULT nextval('soporte_tickets_id_seq'::regclass) NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    asunto text,
    estado text DEFAULT 'abierto'::text,
    derivado boolean DEFAULT false,
    motivo_deriva text,
    origen text DEFAULT 'app'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sports_bets (
    id bigint DEFAULT nextval('sports_bets_id_seq'::regclass) NOT NULL,
    user_id bigint,
    picks text,
    stake bigint,
    odd_total numeric(12,3),
    potential_win bigint,
    actual_win bigint,
    status text DEFAULT 'active'::text,
    mode text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.superbono_aportes (
    id integer DEFAULT nextval('superbono_aportes_id_seq'::regclass) NOT NULL,
    pozo_id integer NOT NULL,
    agencia_code text,
    ggr_periodo numeric(16,2) NOT NULL,
    pct numeric(6,2) NOT NULL,
    aporte numeric(16,2) NOT NULL,
    desde date,
    hasta date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.superbono_ganadores (
    id integer DEFAULT nextval('superbono_ganadores_id_seq'::regclass) NOT NULL,
    pozo_id integer NOT NULL,
    user_id bigint NOT NULL,
    agencia_code text,
    monto numeric(16,2) NOT NULL,
    moneda text,
    visto boolean DEFAULT false NOT NULL,
    visto_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.superbono_pozo (
    id integer DEFAULT nextval('superbono_pozo_id_seq'::regclass) NOT NULL,
    estado text DEFAULT 'acumulando'::text NOT NULL,
    acumulado numeric(16,2) DEFAULT 0 NOT NULL,
    objetivo numeric(16,2),
    aportes integer DEFAULT 0 NOT NULL,
    abierto_at timestamp with time zone DEFAULT now() NOT NULL,
    repartido_at timestamp with time zone,
    repartido_por text,
    ganadores integer,
    monto_c_u numeric(16,2)
);

CREATE TABLE public.terminal_escaneos (
    id integer DEFAULT nextval('terminal_escaneos_id_seq'::regclass) NOT NULL,
    terminal_id integer NOT NULL,
    eligio text,
    ip text,
    device_hash text,
    betslip_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.terminales (
    id integer DEFAULT nextval('terminales_id_seq'::regclass) NOT NULL,
    agencia_code text NOT NULL,
    nombre text NOT NULL,
    codigo text NOT NULL,
    ubicacion text,
    activa boolean DEFAULT true NOT NULL,
    permite_web boolean DEFAULT true NOT NULL,
    permite_app boolean DEFAULT true NOT NULL,
    creado_por text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_uso timestamp with time zone
);

CREATE TABLE public.users (
    id bigint DEFAULT nextval('users_id_seq'::regclass) NOT NULL,
    telegram_id bigint,
    username text,
    first_name text,
    balance bigint DEFAULT 0,
    plan text,
    xp integer DEFAULT 0,
    level integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    last_seen timestamp with time zone,
    documento text,
    telefono text,
    nombre_completo text,
    creado_por text,
    bloqueado boolean DEFAULT false,
    bloqueado_por text,
    bloqueado_at timestamp with time zone,
    bloqueado_motivo text,
    debe_cambiar_pass boolean DEFAULT false,
    email text,
    moneda text DEFAULT 'ARS'::text,
    saldo_bono bigint DEFAULT 0,
    rollover_pendiente bigint DEFAULT 0,
    verificado boolean DEFAULT false,
    verificado_at timestamp with time zone,
    ip_registro text,
    ip_ultima text,
    device_hash text,
    riesgo_nivel text DEFAULT 'normal'::text,
    riesgo_nota text,
    riesgo_tope bigint,
    equipo_favorito text,
    password_hash text,
    saldo_recompensa bigint DEFAULT 0,
    saldo_iacoin numeric(16,4) DEFAULT 0,
    autoexcluido boolean DEFAULT false,
    autoexcluido_hasta timestamp with time zone
);

CREATE TABLE public.usuarios_activos (
    user_id bigint NOT NULL,
    ultimo_at timestamp with time zone DEFAULT now() NOT NULL,
    origen text
);

CREATE TABLE public.vinculos_telegram (
    id bigint DEFAULT nextval('vinculos_telegram_id_seq'::regclass) NOT NULL,
    codigo text,
    tipo text,
    objetivo text,
    usado boolean DEFAULT false,
    creado_por text,
    expira_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id bigint DEFAULT nextval('wallet_transactions_id_seq'::regclass) NOT NULL,
    user_id bigint,
    type text,
    amount bigint,
    method text,
    status text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.web_banners (
    id integer DEFAULT nextval('web_banners_id_seq'::regclass) NOT NULL,
    titulo text,
    texto text,
    link text,
    orden integer DEFAULT 0,
    activo boolean DEFAULT true,
    datos text,
    mime text,
    creado_en timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.agencia_movimientos_id_seq OWNED BY public.agencia_movimientos.id;
ALTER SEQUENCE public.agencia_tickets_id_seq OWNED BY public.agencia_tickets.id;
ALTER SEQUENCE public.agencias_id_seq OWNED BY public.agencias.id;
ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;
ALTER SEQUENCE public.autoexclusiones_id_seq OWNED BY public.autoexclusiones.id;
ALTER SEQUENCE public.avisos_id_seq OWNED BY public.avisos.id;
ALTER SEQUENCE public.betslips_id_seq OWNED BY public.betslips.id;
ALTER SEQUENCE public.bloqueos_log_id_seq OWNED BY public.bloqueos_log.id;
ALTER SEQUENCE public.bonos_id_seq OWNED BY public.bonos.id;
ALTER SEQUENCE public.bonos_agencias_id_seq OWNED BY public.bonos_agencias.id;
ALTER SEQUENCE public.bonos_costos_id_seq OWNED BY public.bonos_costos.id;
ALTER SEQUENCE public.bonos_otorgados_id_seq OWNED BY public.bonos_otorgados.id;
ALTER SEQUENCE public.casino_alertas_id_seq OWNED BY public.casino_alertas.id;
ALTER SEQUENCE public.casino_integraciones_id_seq OWNED BY public.casino_integraciones.id;
ALTER SEQUENCE public.casino_juegos_id_seq OWNED BY public.casino_juegos.id;
ALTER SEQUENCE public.casino_movimientos_id_seq OWNED BY public.casino_movimientos.id;
ALTER SEQUENCE public.casino_rounds_id_seq OWNED BY public.casino_rounds.id;
ALTER SEQUENCE public.casino_sesiones_id_seq OWNED BY public.casino_sesiones.id;
ALTER SEQUENCE public.cc_movimientos_id_seq OWNED BY public.cc_movimientos.id;
ALTER SEQUENCE public.combo_generado_id_seq OWNED BY public.combo_generado.id;
ALTER SEQUENCE public.combos_compartidos_id_seq OWNED BY public.combos_compartidos.id;
ALTER SEQUENCE public.combos_flash_id_seq OWNED BY public.combos_flash.id;
ALTER SEQUENCE public.combos_manuales_id_seq OWNED BY public.combos_manuales.id;
ALTER SEQUENCE public.comisiones_historial_id_seq OWNED BY public.comisiones_historial.id;
ALTER SEQUENCE public.compartidas_id_seq OWNED BY public.compartidas.id;
ALTER SEQUENCE public.compartidas_visitas_id_seq OWNED BY public.compartidas_visitas.id;
ALTER SEQUENCE public.desafios_comisiones_id_seq OWNED BY public.desafios_comisiones.id;
ALTER SEQUENCE public.escaneos_log_id_seq OWNED BY public.escaneos_log.id;
ALTER SEQUENCE public.eventos_ajustes_id_seq OWNED BY public.eventos_ajustes.id;
ALTER SEQUENCE public.eventos_bloqueos_id_seq OWNED BY public.eventos_bloqueos.id;
ALTER SEQUENCE public.exposicion_id_seq OWNED BY public.exposicion.id;
ALTER SEQUENCE public.iacoin_cotizaciones_id_seq OWNED BY public.iacoin_cotizaciones.id;
ALTER SEQUENCE public.iacoin_movimientos_id_seq OWNED BY public.iacoin_movimientos.id;
ALTER SEQUENCE public.iaqp_apuestas_id_seq OWNED BY public.iaqp_apuestas.id;
ALTER SEQUENCE public.iaqp_movimientos_id_seq OWNED BY public.iaqp_movimientos.id;
ALTER SEQUENCE public.iaqp_rondas_id_seq OWNED BY public.iaqp_rondas.id;
ALTER SEQUENCE public.iaqp_semillas_id_seq OWNED BY public.iaqp_semillas.id;
ALTER SEQUENCE public.impresiones_log_id_seq OWNED BY public.impresiones_log.id;
ALTER SEQUENCE public.influencer_events_id_seq OWNED BY public.influencer_events.id;
ALTER SEQUENCE public.influencers_id_seq OWNED BY public.influencers.id;
ALTER SEQUENCE public.limites_apuesta_id_seq OWNED BY public.limites_apuesta.id;
ALTER SEQUENCE public.limites_jugador_id_seq OWNED BY public.limites_jugador.id;
ALTER SEQUENCE public.liquidaciones_id_seq OWNED BY public.liquidaciones.id;
ALTER SEQUENCE public.mensajes_id_seq OWNED BY public.mensajes.id;
ALTER SEQUENCE public.moderacion_log_id_seq OWNED BY public.moderacion_log.id;
ALTER SEQUENCE public.muro_comentarios_id_seq OWNED BY public.muro_comentarios.id;
ALTER SEQUENCE public.muro_denuncias_id_seq OWNED BY public.muro_denuncias.id;
ALTER SEQUENCE public.muro_imagenes_id_seq OWNED BY public.muro_imagenes.id;
ALTER SEQUENCE public.muro_posts_id_seq OWNED BY public.muro_posts.id;
ALTER SEQUENCE public.p2p_apuestas_id_seq OWNED BY public.p2p_apuestas.id;
ALTER SEQUENCE public.p2p_disputas_id_seq OWNED BY public.p2p_disputas.id;
ALTER SEQUENCE public.p2p_movimientos_id_seq OWNED BY public.p2p_movimientos.id;
ALTER SEQUENCE public.productos_permisos_id_seq OWNED BY public.productos_permisos.id;
ALTER SEQUENCE public.proveedores_permisos_id_seq OWNED BY public.proveedores_permisos.id;
ALTER SEQUENCE public.psp_cargas_id_seq OWNED BY public.psp_cargas.id;
ALTER SEQUENCE public.psp_retiros_id_seq OWNED BY public.psp_retiros.id;
ALTER SEQUENCE public.recompensas_id_seq OWNED BY public.recompensas.id;
ALTER SEQUENCE public.retiros_id_seq OWNED BY public.retiros.id;
ALTER SEQUENCE public.riesgo_alertas_id_seq OWNED BY public.riesgo_alertas.id;
ALTER SEQUENCE public.sesiones_juego_id_seq OWNED BY public.sesiones_juego.id;
ALTER SEQUENCE public.soporte_mensajes_id_seq OWNED BY public.soporte_mensajes.id;
ALTER SEQUENCE public.soporte_tickets_id_seq OWNED BY public.soporte_tickets.id;
ALTER SEQUENCE public.sports_bets_id_seq OWNED BY public.sports_bets.id;
ALTER SEQUENCE public.superbono_aportes_id_seq OWNED BY public.superbono_aportes.id;
ALTER SEQUENCE public.superbono_ganadores_id_seq OWNED BY public.superbono_ganadores.id;
ALTER SEQUENCE public.superbono_pozo_id_seq OWNED BY public.superbono_pozo.id;
ALTER SEQUENCE public.terminal_escaneos_id_seq OWNED BY public.terminal_escaneos.id;
ALTER SEQUENCE public.terminales_id_seq OWNED BY public.terminales.id;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
ALTER SEQUENCE public.vinculos_telegram_id_seq OWNED BY public.vinculos_telegram.id;
ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;
ALTER SEQUENCE public.web_banners_id_seq OWNED BY public.web_banners.id;

COMMIT;
