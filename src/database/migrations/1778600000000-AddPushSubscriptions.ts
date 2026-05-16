import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPushSubscriptions1778600000000 implements MigrationInterface {
  name = 'AddPushSubscriptions1778600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "endpoint" varchar NOT NULL,
        "p256dh" varchar NOT NULL,
        "auth" varchar NOT NULL,
        "label" varchar,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_push_endpoint" UNIQUE ("endpoint")
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`)
  }
}
