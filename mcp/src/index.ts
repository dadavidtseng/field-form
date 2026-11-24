import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { CommentTag, SYNC_PORT, type Op } from '@field-form/shared';
import { z } from 'zod';
import { describeSpace, findSpace, resolveTarget } from './describe';
import { FieldFormClient } from './syncClient';

// Field Form for Claude, over stdio. Read-heavy by design: Claude joins as one more office
// device, so it can read every space and leave comments for the crew, and the sync server
// refuses anything else (geometry, measurements, renames, deletes) exactly as it does for Marcus.
// stdout carries the protocol: log to stderr only.

const url = process.env.FIELD_FORM_SYNC_URL ?? `ws://localhost:${SYNC_PORT}`;
const ff = new FieldFormClient(url);

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ ...text(message), isError: true });

/** Run a tool body, turning thrown errors into a tool error Claude can read and act on. */
const guarded =
  <A>(body: (args: A) => Promise<ReturnType<typeof text>>) =>
  async (args: A) => {
    try {
      return await body(args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };

async function openSpace(space: string) {
  const summary = findSpace(await ff.listSpaces(), space);
  const layout = await ff.loadSpace(summary.id);
  if (!layout) throw new Error(`Space "${summary.name}" has no content yet.`);
  return { summary, layout };
}

async function submit(layoutId: string, op: Op, done: string) {
  const result = await ff.submit(layoutId, op);
  return result.ok ? text(done) : fail(`The sync server refused it (${result.code}): ${result.message}`);
}

const server = new McpServer({ name: 'field-form', version: '0.1.0' });

server.registerTool(
  'list_spaces',
  {
    description:
      'List every Field Form space (room, deck, fence, floor…) on the sync server, most recently edited first. ' +
      '"live" means a field crew has it open right now.',
    inputSchema: z.object({}),
  },
  guarded(async () => {
    const spaces = await ff.listSpaces();
    if (spaces.length === 0) return text('No spaces yet. The field crew creates them in the app.');
    return text(
      spaces.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        walls: s.walls,
        shape: s.closed ? 'closed shape' : 'open line',
        live: s.live,
        updatedAt: new Date(s.updatedAt).toISOString(),
      })),
    );
  }),
);

server.registerTool(
  'get_space',
  {
    description:
      'Everything about one space: perimeter or length, area, closure check, every wall and feature with its ' +
      'measurement and where it came from (tape, caliper or typed), what is still to measure, whether it is ready ' +
      'to quote, and all comments. Unmeasured values show the sketch estimate, which is not a measurement.',
    inputSchema: z.object({
      space: z.string().describe('The space id, or part of its name, e.g. "kitchen"'),
      units: z.enum(['imperial', 'metric']).default('imperial'),
    }),
  },
  guarded(async ({ space, units }) => {
    const { summary, layout } = await openSpace(space);
    return text({ id: summary.id, live: summary.live, ...describeSpace(layout, units) });
  }),
);

server.registerTool(
  'add_comment',
  {
    description:
      'Leave a comment for the field crew as the office, pinned to a wall, a feature or the whole space. ' +
      'It appears on their device at once. Use it to ask for a re-check, flag a problem or answer a question. ' +
      'This is the only way to change a space: measurements and geometry belong to the crew on site.',
    inputSchema: z.object({
      space: z.string().describe('The space id, or part of its name'),
      on: z
        .string()
        .optional()
        .describe(
          'A wall or feature name or id from get_space ("Wall 2", "Last wall", "Door 1"); omit for the whole space',
        ),
      tag: CommentTag.optional().describe('verify = please re-measure; out_of_square = corners look off'),
      text: z.string().max(500).optional(),
    }),
  },
  guarded(async ({ space, on, tag, text: body }) => {
    if (!tag && !body?.trim()) return fail('A comment needs a tag, some text, or both.');
    const { summary, layout } = await openSpace(space);
    const target = resolveTarget(layout, on);
    const id = randomUUID();
    const op: Op = {
      t: 'comment.add',
      comment: { id, target, tag, text: body?.trim() || undefined, by: 'office', at: Date.now(), resolved: false },
    };
    return submit(summary.id, op, `Comment ${id} added to "${summary.name}" (${on ?? 'whole space'}).`);
  }),
);

server.registerTool(
  'resolve_comment',
  {
    description: 'Mark a comment resolved (or reopen it). Get comment ids from get_space.',
    inputSchema: z.object({
      space: z.string().describe('The space id, or part of its name'),
      commentId: z.string(),
      resolved: z.boolean().default(true),
    }),
  },
  guarded(async ({ space, commentId, resolved }) => {
    const { summary, layout } = await openSpace(space);
    if (!layout.comments?.[commentId]) return fail(`No comment ${commentId} in "${summary.name}".`);
    const op: Op = { t: 'comment.resolve', id: commentId, resolved };
    return submit(summary.id, op, `Comment ${commentId} ${resolved ? 'resolved' : 'reopened'}.`);
  }),
);

await server.connect(new StdioServerTransport());
console.error(`field-form MCP server ready (sync server ${url})`);
