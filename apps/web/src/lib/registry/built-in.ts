/**
 * The built-in register definitions.
 *
 * They live in /workbook so that the server function which imports the
 * workbook can read them too, and are re-exported here so nothing in the
 * application has to know that. The records that go with them deliberately
 * do NOT follow this route: workbook/seed.ts is imported only on the server,
 * because it holds the team's real index.
 */
export { BUILT_IN_REGISTERS, COMPLETENESS_FIELDS } from '@workbook/registers'
