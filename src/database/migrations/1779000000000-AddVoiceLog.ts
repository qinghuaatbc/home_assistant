import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddVoiceLog1779000000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS voice_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcript TEXT NOT NULL,
        response TEXT,
        lang TEXT DEFAULT 'en',
        action TEXT,
        "createdAt" DATETIME DEFAULT (datetime('now'))
      )
    `)
  }
  async down(runner: QueryRunner) {
    await runner.query(`DROP TABLE IF EXISTS voice_log`)
  }
}
