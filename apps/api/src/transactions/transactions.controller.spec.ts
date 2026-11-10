import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { trackerOf } from '../common/guards/tracker.js';

// The controller cannot be loaded under Jest: it imports the throttler, which is
// CommonJS and requires an ES module in a cycle. So the structure of the
// controller is checked on its source, and the tracker, which holds the logic,
// is a function of its own.
const source = readFileSync(
  fileURLToPath(new URL('./transactions.controller.ts', import.meta.url)),
  'utf8',
);

function methodBlock(name: string): string {
  // The decorators of a method, up to its signature.
  const signature = source.indexOf(`  ${name}(`);
  const start = source.lastIndexOf('\n\n', signature);
  return source.slice(start, signature);
}

describe('TransactionsController: the creation limit', () => {
  it('007 AC-4: authentication is a guard of the whole controller, so it runs before the limit of one method', () => {
    const classDecorators = source.slice(
      source.indexOf("@Controller('transactions')"),
      source.indexOf('export class TransactionsController'),
    );
    expect(classDecorators).toContain('@UseGuards(SupabaseAuthGuard)');
  });

  it('007 AC-4: creating a transaction is limited per user, as a guard of that method only', () => {
    expect(methodBlock('create')).toContain('@UseGuards(UserThrottlerGuard)');
    expect(methodBlock('findAll')).not.toContain('UserThrottlerGuard');
    expect(methodBlock('reclassify')).not.toContain('UserThrottlerGuard');
  });

  it('007 AC-4: the limit is 20 requests in 5 minutes', () => {
    expect(methodBlock('create')).toMatch(
      /@Throttle\(\{\s*'create-transaction':\s*\{\s*limit:\s*20,\s*ttl:\s*300_000\s*\}\s*\}\)/,
    );
  });
});

describe('the tracker of the creation limit', () => {
  it('007 AC-4: it counts by the id of the user', () => {
    expect(
      trackerOf({ user: { id: 'user-1' }, ip: '10.0.0.1', headers: {} }, 1),
    ).toBe('user-1');
  });

  it('007 AC-4: two users behind the same address do not share a count', () => {
    const a = trackerOf({ user: { id: 'a' }, ip: '10.0.0.1', headers: {} }, 1);
    const b = trackerOf({ user: { id: 'b' }, ip: '10.0.0.1', headers: {} }, 1);
    expect(a).not.toBe(b);
  });

  it('007 AC-4: with no user it falls back to the address of the client, not of the proxy', () => {
    expect(
      trackerOf(
        {
          headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' },
          socket: { remoteAddress: '10.0.0.1' },
        },
        1,
      ),
    ).toBe('203.0.113.9');
  });
});
