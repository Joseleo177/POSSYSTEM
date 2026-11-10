'use strict';

// Declaración de IVA del período (forma 30 del SENIAT, "resumen del artículo 72"), 10-11-2026. Igual que
// gme_contabilidad_ve (Odoo 19, declaracion_iva.py): las casillas salen de los libros de ventas y de
// compras del período, en bolívares; el excedente de créditos y las retenciones que no se descontaron
// pasan a la siguiente. Se guarda porque una declaración presentada no puede cambiar con los libros, y
// porque la siguiente toma de ella lo que le quedó. Ver services/fiscal/declaracionIva.js.
//
// quincena: 'mes' (contribuyente ordinario) o '1' / '2' (contribuyente especial, quincenal).
// creditos_prorrata: créditos deducibles; se calcula, pero `prorrata_manual` deja corregirlo (la
// prorrata acumulada del año, por ejemplo). Los totales se calculan al leer.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
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
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS iva_declarations`);
  },
};
