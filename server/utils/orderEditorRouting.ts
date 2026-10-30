import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Kind, parse, type FieldNode, type ValueNode } from 'graphql';

/**
 * Decides whether a proxied GraphQL request may use the order-editor key, from
 * the parsed document rather than the client-supplied operation name.
 */

// Mirrors the SDK's DEFAULT_ORDER_EDITOR_MUTATIONS (top-level field names).
export const ORDER_EDITOR_MUTATIONS = new Set([
  'orderSetStatus',
  'passwordResetLink',
  'triggerQuoteSendRequest',
  'triggerOrderSendConfirm',
]);

// Elevated only when the caller signals intent with `X-Client-ID: order-editor` and has a session.
export const ORDER_EDITOR_OPT_IN_MUTATIONS = new Set(['contactRegister']);

export const LAST_ORDER_COOKIE = 'propeller_last_order';
export const LAST_ORDER_MAX_AGE = 60 * 60;

export type KeyChoice = 'general' | 'order-editor' | 'order-editor-session';

interface SingleField {
  operation: 'query' | 'mutation' | 'subscription';
  field: FieldNode;
  /** Variables declared with a default value. */
  defaulted: Set<string>;
}

type Variables = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The one top-level field of a single-operation document, or null for anything else. */
export function singleTopLevelField(query: unknown): SingleField | null {
  if (typeof query !== 'string' || !query.trim()) return null;
  let doc;
  try {
    doc = parse(query, { noLocation: true });
  } catch {
    return null;
  }
  const ops = [];
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) ops.push(def);
    else if (def.kind !== Kind.FRAGMENT_DEFINITION) return null;
  }
  if (ops.length !== 1) return null;
  const op = ops[0]!;
  const fields: FieldNode[] = [];
  for (const sel of op.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) return null;
    if (sel.name.value === '__typename') continue;
    fields.push(sel);
  }
  if (fields.length !== 1) return null;
  const defaulted = new Set(
    (op.variableDefinitions ?? []).filter((v) => v.defaultValue).map((v) => v.variable.name.value),
  );
  return { operation: op.operation as SingleField['operation'], field: fields[0]!, defaulted };
}

const UNRESOLVED = Symbol('unresolved');

// A variable left to its declared default is treated as unknown.
function argValue({ field, defaulted }: SingleField, name: string, variables: Variables): unknown {
  const arg = field.arguments?.find((a) => a.name.value === name);
  if (!arg) return undefined;
  const value: ValueNode = arg.value;
  switch (value.kind) {
    case Kind.NULL:
      return null;
    case Kind.INT:
      return value.value;
    case Kind.VARIABLE:
      if (value.name.value in variables) return variables[value.name.value];
      return defaulted.has(value.name.value) ? UNRESOLVED : null;
    default:
      return UNRESOLVED;
  }
}

function orderIdString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value)) return value;
  return null;
}

function anonymousOrderAllowed(single: SingleField, variables: Variables, lastOrderId: string | null): boolean {
  if (!lastOrderId) return false;
  const { field } = single;
  const known = new Set(['orderId', 'orderUUID']);
  if (field.arguments?.some((a) => !known.has(a.name.value))) return false;
  const uuid = argValue(single, 'orderUUID', variables);
  if (uuid !== undefined && uuid !== null) return false;
  return orderIdString(argValue(single, 'orderId', variables)) === lastOrderId;
}

export interface ClassifyInput {
  body: unknown;
  isAnonymous: boolean;
  orderEditorOptIn: boolean;
  /** Order id from a verified `propeller_last_order` cookie. */
  lastOrderId: string | null;
}

export function classifyOperation({ body, isAnonymous, orderEditorOptIn, lastOrderId }: ClassifyInput): KeyChoice {
  if (!isRecord(body)) return 'general';
  const single = singleTopLevelField(body.query);
  if (!single) return 'general';
  const name = single.field.name.value;
  const variables = isRecord(body.variables) ? body.variables : {};

  if (single.operation === 'mutation') {
    if (ORDER_EDITOR_MUTATIONS.has(name)) return 'order-editor';
    if (ORDER_EDITOR_OPT_IN_MUTATIONS.has(name) && orderEditorOptIn && !isAnonymous) return 'order-editor-session';
    return 'general';
  }
  if (single.operation === 'query' && name === 'order' && isAnonymous) {
    return anonymousOrderAllowed(single, variables, lastOrderId) ? 'order-editor' : 'general';
  }
  return 'general';
}

function hmac(orderId: string, key: string): string {
  return createHmac('sha256', key).update(`${LAST_ORDER_COOKIE}:${orderId}`).digest('hex');
}

/** Cookie value `orderId.hmac`, keyed with the order-editor API key. */
export function signLastOrder(orderId: number | string, key: string): string {
  const id = String(orderId);
  return `${id}.${hmac(id, key)}`;
}

/** The order id when the cookie's signature checks out, else null. */
export function verifyLastOrder(cookie: string | undefined, key: string): string | null {
  if (!cookie || !key) return null;
  const match = /^([1-9]\d{0,15})\.([0-9a-f]{64})$/.exec(cookie);
  if (!match) return null;
  const expected = Buffer.from(hmac(match[1]!, key), 'hex');
  const given = Buffer.from(match[2]!, 'hex');
  return timingSafeEqual(expected, given) ? match[1]! : null;
}

/** The order id a relayed cartProcess mutation just created, if any. */
export function createdOrderId(body: unknown, responseText: string): string | null {
  if (!isRecord(body)) return null;
  const single = singleTopLevelField(body.query);
  if (!single || single.operation !== 'mutation' || single.field.name.value !== 'cartProcess') return null;
  let json: unknown;
  try {
    json = JSON.parse(responseText);
  } catch {
    return null;
  }
  if (!isRecord(json) || !isRecord(json.data)) return null;
  const key = single.field.alias?.value ?? single.field.name.value;
  const result = json.data[key];
  return isRecord(result) ? orderIdString(result.cartOrderId) : null;
}
