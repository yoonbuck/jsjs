import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assertSame } from '../harness/assert.js';

const LEDGER_FILE = 'tools/test262/es2015-p1c-paths.txt';
const EXPECTED_SHA256 =
  'e40f2a9c1dcd2aeb2cb56c4e3147a49d8d15275724abe002589dbbac05cb65d5';

export default [
  {
    name: 'the durable P1C ledger exactly matches its reviewed source identity',
    run: async () => {
      const [ledgerText, taxonomyText] = await Promise.all([
        readFile(LEDGER_FILE, 'utf8'),
        readFile('tools/test262/es2015-taxonomy.json', 'utf8'),
      ]);
      const paths = ledgerText.endsWith('\n')
        ? ledgerText.slice(0, -1).split('\n')
        : ledgerText.split('\n');
      const taxonomy = JSON.parse(taxonomyText);
      const byPath = new Map(
        taxonomy.classifications.map((entry) => [entry.path, entry]),
      );

      assertSame(paths.length, 81);
      assertSame(new Set(paths).size, 81);
      assertSame(JSON.stringify(paths), JSON.stringify([...paths].sort()));
      assertSame(
        createHash('sha256').update(ledgerText).digest('hex'),
        EXPECTED_SHA256,
      );

      let variants = 0;
      for (const path of paths) {
        const entry = byPath.get(path);
        assertSame(entry?.partition, 'core', path);
        assertSame(
          entry?.status,
          'blocked:early-errors-and-declaration-instantiation',
          path,
        );
        assertSame(
          entry?.blocker,
          'early-errors-and-declaration-instantiation',
          path,
        );
        variants += entry.variants;
      }
      assertSame(variants, 161);
    },
  },
];
