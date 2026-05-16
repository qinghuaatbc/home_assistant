import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddGeofence1778900000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS geofence_zone (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        "radiusMeters" REAL NOT NULL,
        icon TEXT
      )
    `)
    await runner.query(`
      CREATE TABLE IF NOT EXISTS device_location (
        "deviceId" TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        "zoneId" INTEGER,
        "displayName" TEXT,
        "updatedAt" DATETIME DEFAULT (datetime('now'))
      )
    `)
  }
  async down(runner: QueryRunner) {
    await runner.query(`DROP TABLE IF EXISTS geofence_zone`)
    await runner.query(`DROP TABLE IF EXISTS device_location`)
  }
}
