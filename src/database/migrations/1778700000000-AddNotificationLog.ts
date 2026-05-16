import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddNotificationLog1778700000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT,
        icon TEXT,
        "createdAt" DATETIME DEFAULT (datetime('now'))
      )
    `)
  }
  async down(runner: QueryRunner) {
    await runner.query(`DROP TABLE IF EXISTS notification_log`)
  }
}
