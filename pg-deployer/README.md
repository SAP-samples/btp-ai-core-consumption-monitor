# PostgreSQL deployer

Standalone one-off app that deploys the CDS schema and initial CSV data to the
bound **PostgreSQL on SAP BTP (hyperscaler option)** service (`postgresql-db`).

It is **not** used for local development (local dev uses SQLite via `cds watch`)
and is **not** part of the default HANA deployment (`mta.yaml`). It is only wired
into `mta-pg.yaml` and runs once per deploy as a Cloud Foundry task.

## How it works

1. During the MTA build (`mta-pg.yaml` → `before-all`), the CDS model is compiled
   to `gen/pg-deployer/db/csn.json` and the `db/data/*.csv` seed files are copied
   alongside it.
2. On deploy, this app starts with `cds-deploy`, which reads the compiled model +
   CSV data and creates the tables / loads initial data in PostgreSQL.
3. Credentials are picked up automatically from `VCAP_SERVICES` (binding label
   `postgresql-db`). The app has `no-route`/`no-start` and runs as a one-off task.

Schema evolution is supported — re-deploying updates the schema in place without
dropping existing data.
