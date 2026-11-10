import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function replayKey(callId, tool, args) {
  const hash = createHash('sha256').update(JSON.stringify(canonical(args))).digest('hex');
  return `${callId}:${tool}:${hash}`;
}

export const argsHash = args => replayKey(0, '', args).split(':').at(-1);

// Replay-only by construction: no live callback, SDK import, subprocess or network.
export class ToolReplay {
  constructor(records, { normalize = value => value } = {}) {
    this.records = new Map();
    this.calls = [];
    this.normalize = normalize;
    for (const record of records) {
      if (!Number.isSafeInteger(record.call_id) || record.call_id < 1 || typeof record.tool !== 'string'
          || !/^[a-f0-9]{64}$/.test(record.args_sha256 ?? '') || !Object.hasOwn(record, 'response')) throw new Error('Invalid replay record identity/response');
      const key = `${record.call_id}:${record.tool}:${record.args_sha256}`;
      if (this.records.has(key)) throw new Error(`Duplicate replay record: ${key}`);
      this.records.set(key, structuredClone(record));
    }
  }

  async call(tool, args) {
    const callId = this.calls.length + 1;
    const key = replayKey(callId, tool, this.normalize(args));
    const record = this.records.get(key);
    if (!record) throw new Error(`Missing replay record: ${key}`);
    this.records.delete(key);
    this.calls.push({ call_id: callId, key, tool, args: structuredClone(args), response: structuredClone(record.response) });
    return structuredClone(record.response);
  }

  assertConsumed() {
    if (this.records.size) throw new Error(`Unused replay records: ${[...this.records.keys()].join(', ')}`);
  }
}
