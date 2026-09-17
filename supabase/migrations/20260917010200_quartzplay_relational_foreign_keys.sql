-- QuartzPlay Relational slice 3/4: foreign keys.
-- Generated from the production schema catalog on 2026-09-17 (schema only: no data, owners, or privileges).
-- Applied to staging only; production already contains these objects.

ALTER TABLE ONLY public.iaqp_apuestas
    ADD CONSTRAINT iaqp_apuestas_ronda_id_fkey FOREIGN KEY (ronda_id) REFERENCES public.iaqp_rondas(id);

ALTER TABLE ONLY public.iaqp_movimientos
    ADD CONSTRAINT iaqp_movimientos_ronda_id_fkey FOREIGN KEY (ronda_id) REFERENCES public.iaqp_rondas(id);

ALTER TABLE ONLY public.iaqp_rondas
    ADD CONSTRAINT iaqp_rondas_semilla_id_fkey FOREIGN KEY (semilla_id) REFERENCES public.iaqp_semillas(id);
