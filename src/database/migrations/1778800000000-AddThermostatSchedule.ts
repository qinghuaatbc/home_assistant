import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddThermostatSchedule1778800000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS thermostat_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        "entityId" TEXT NOT NULL,
        "dayOfWeek" INTEGER NOT NULL,
        hour INTEGER NOT NULL,
        temperature REAL NOT NULL,
        enabled INTEGER DEFAULT 1
      )
    `)
    await runner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_thermostat_slot
        ON thermostat_schedule ("entityId", "dayOfWeek", hour)
    `)
  }
  async down(runner: QueryRunner) {
    await runner.query(`DROP TABLE IF EXISTS thermostat_schedule`)
  }
}
