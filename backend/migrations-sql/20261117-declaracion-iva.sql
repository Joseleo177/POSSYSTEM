-- Declaración de IVA del período (forma 30), migración 20261117100000-declaracion-iva.js.
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend (el modelo IvaDeclaration lee esta
-- tabla al abrir Reportes → Fiscal → Declaración de IVA). Es idempotente. Va DESPUÉS de
-- 20261116-compras-fiscales.sql: la declaración lee el Libro de compras.

BEGIN;

CREATE TABLE IF NOT EXISTS iva_declarations (
  id                      SERIAL PRIMARY KEY,
  company_id              INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  periodo                 VARCHAR(6) NOT NULL,
  quincena                VARCHAR(3) NOT NULL DEFAULT 'mes',
  fecha_desde             DATE NOT NULL,
  fecha_hasta             DATE NOT NULL,
  state                   VARCHAR(10) NOT NULL DEFAULT 'borrador',
  documentos_ventas       INTEGER NOT NULL DEFAULT 0,
  documentos_compras      INTEGER NOT NULL DEFAULT 0,
  sin_iva_ventas          INTEGER NOT NULL DEFAULT 0,
  ventas_exentas          NUMERIC(16, 2) NOT NULL DEFAULT 0,
  ventas_base_general     NUMERIC(16, 2) NOT NULL DEFAULT 0,
  debito_general          NUMERIC(16, 2) NOT NULL DEFAULT 0,
  ventas_base_adicional   NUMERIC(16, 2) NOT NULL DEFAULT 0,
  debito_adicional        NUMERIC(16, 2) NOT NULL DEFAULT 0,
  ventas_base_reducida    NUMERIC(16, 2) NOT NULL DEFAULT 0,
  debito_reducida         NUMERIC(16, 2) NOT NULL DEFAULT 0,
  compras_exentas         NUMERIC(16, 2) NOT NULL DEFAULT 0,
  compras_base_general    NUMERIC(16, 2) NOT NULL DEFAULT 0,
  credito_general         NUMERIC(16, 2) NOT NULL DEFAULT 0,
  compras_base_adicional  NUMERIC(16, 2) NOT NULL DEFAULT 0,
  credito_adicional       NUMERIC(16, 2) NOT NULL DEFAULT 0,
  compras_base_reducida   NUMERIC(16, 2) NOT NULL DEFAULT 0,
  credito_reducida        NUMERIC(16, 2) NOT NULL DEFAULT 0,
  creditos_prorrata       NUMERIC(16, 2) NOT NULL DEFAULT 0,
  prorrata_manual         BOOLEAN NOT NULL DEFAULT false,
  excedente_anterior      NUMERIC(16, 2) NOT NULL DEFAULT 0,
  retenciones_anteriores  NUMERIC(16, 2) NOT NULL DEFAULT 0,
  retenciones_periodo     NUMERIC(16, 2) NOT NULL DEFAULT 0,
  anticipo_porcentaje     NUMERIC(5, 2) NOT NULL DEFAULT 0,
  planilla                VARCHAR(40),
  fecha_pago              DATE,
  referencia_pago         VARCHAR(80),
  calculated_at           TIMESTAMPTZ,
  declared_at             TIMESTAMPTZ,
  declared_by             INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS iva_declarations_periodo ON iva_declarations (company_id, periodo, quincena);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE iva_declarations ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261117100000-declaracion-iva.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261117100000-declaracion-iva.js');

COMMIT;

-- Verificación final: debe devolver UNA fila.
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'iva_declarations';
