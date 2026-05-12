import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1778559548506 implements MigrationInterface {
  name = 'InitialSchema1778559548506'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "states_history" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "entity_id" varchar NOT NULL,
        "state" varchar,
        "attributes" text,
        "last_changed" varchar,
        "last_updated" varchar,
        "context_id" varchar,
        "context_user_id" varchar,
        "context_parent_id" varchar,
        "created_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_states_entity_id" ON "states_history" ("entity_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_states_entity_updated" ON "states_history" ("entity_id", "last_updated")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "entity_registry" (
        "entity_id" varchar PRIMARY KEY NOT NULL,
        "platform" varchar NOT NULL,
        "unique_id" varchar,
        "name" varchar,
        "original_name" varchar,
        "icon" varchar,
        "device_id" varchar,
        "area_id" varchar,
        "disabled" boolean NOT NULL DEFAULT (0),
        "disabled_by" varchar,
        "unit_of_measurement" varchar,
        "device_class" varchar,
        "modified_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_entity_unique_id" ON "entity_registry" ("unique_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_entity_device_id" ON "entity_registry" ("device_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_entity_area_id" ON "entity_registry" ("area_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_registry" (
        "device_id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "manufacturer" varchar,
        "model" varchar,
        "sw_version" varchar,
        "hw_version" varchar,
        "area_id" varchar,
        "identifiers_json" text,
        "integration" varchar,
        "via_device_id" varchar,
        "configuration_url" varchar,
        "modified_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "area_registry" (
        "area_id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "aliases_json" text,
        "picture" varchar,
        "modified_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "username" varchar NOT NULL,
        "password_hash" varchar NOT NULL,
        "display_name" varchar,
        "is_admin" boolean NOT NULL DEFAULT (0),
        "is_active" boolean NOT NULL DEFAULT (1),
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_users_username" UNIQUE ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "long_lived_tokens" (
        "id" varchar PRIMARY KEY NOT NULL,
        "user_id" varchar NOT NULL,
        "name" varchar NOT NULL,
        "token_hash" varchar NOT NULL,
        "expires_at" text,
        "last_used_at" text,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_llt_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_llt_token_hash" ON "long_lived_tokens" ("token_hash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "long_lived_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "area_registry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_registry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entity_registry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "states_history"`);
  }
}
