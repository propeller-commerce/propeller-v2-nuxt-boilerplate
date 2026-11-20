import {
  Kind,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
  visit,
} from 'graphql';
import { documentHash } from './registrationRouting.ts';
import { signCookieValue, verifyCookieValue } from './signedCookie.ts';
import type { Viewer } from './viewer.ts';

/**
 * Decides whether a proxied GraphQL request may use the order-editor key, from the parsed document
 * (never the client-supplied operationName).
 */

// Checkout mutations the backend authorizes only under the order-editor key; elevated only for the
// order this browser just placed (signed last-order cookie), once each. passwordResetLink is never
// elevated: it returns the reset URL to the caller, which would hand out any account.
export const ORDER_EDITOR_MUTATIONS: ReadonlySet<string> = new Set([
  'orderSetStatus',
  'triggerQuoteSendRequest',
  'triggerOrderSendConfirm',
]);
// sha256 of print(parse(document)) of the SDK's documents for them, the only ones the shop sends
// (vue-ui placeOrder / QuoteActions); sdkDocuments.test.ts fails after an SDK upgrade that changes
// them. The order-editor key would resolve any selection a caller adds to the returned order.
export const ORDER_EDITOR_DOCUMENT_HASHES: ReadonlySet<string> = new Set([
  '7c84383485efcd2ea7f81d4965794ebee5284decfec084f22034b2ee0d8f4ec4', // orderSetStatus
  '34f4860120011946647baa8b540dbc95e7cd08468523bc6aa15efae54d3189f4', // triggerQuoteSendRequest
  '379c5f6817ecd10f6bd1cd0fc6b8cae0a4730e677e5821a9406433f867a5fcd7', // triggerOrderSendConfirm
]);
// The flag added to the last-order cookie (and the server's spent log) once each has run.
const MUTATION_FLAG: Record<string, string> = {
  orderSetStatus: 's',
  triggerQuoteSendRequest: 'q',
  triggerOrderSendConfirm: 'c',
};

// Elevated only with `X-Client-ID: order-editor` for a verified AUTHORIZATION_MANAGER of input.parentId,
// and only as the SDK's document (the authorization settings' registerContact; the same hash as
// Next). Any other contactRegister document is public self-registration, not elevated.
export const ORDER_EDITOR_OPT_IN_MUTATIONS: ReadonlySet<string> = new Set(['contactRegister']);
export const CONTACT_REGISTER_DOCUMENT_HASH = '7abc947729c6e1d20cb1049c380569402add63473ad54a6cb84e0fbfc2413137';

export const LAST_ORDER_COOKIE = 'propeller_last_order';
export const LAST_ORDER_MAX_AGE = 60 * 60;
export const LAST_ORDER_PURPOSE = 'last-order';

export interface SingleField {
  operation: OperationDefinitionNode['operation'];
  definition: OperationDefinitionNode;
  field: FieldNode;
}

/** The order this browser placed last, and the flags of the elevated mutations already run for it. */
export interface LastOrder {
  orderId: number;
  used: string;
}

export type KeyChoice =
  | { key: 'general' }
  /** Checkout mutation for the last order. Order reads are decided by orderReadAllowed. */
  | { key: 'order-editor'; flag: string }
  /** contactRegister: elevate only for a verified AUTHORIZATION_MANAGER of `companyId`. */
  | { key: 'manager'; companyId: number }
  /** Accepting a quote (QUOTATION → NEW): elevate only when the verified viewer placed `orderId`. */
  | { key: 'quote-accept'; orderId: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** The one operation's one top-level field (ignoring __typename), or null for anything else. */
export function singleTopLevelField(doc: DocumentNode | null): SingleField | null {
  if (!doc) return null;
  const ops: OperationDefinitionNode[] = [];
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) ops.push(def);
    else if (def.kind !== Kind.FRAGMENT_DEFINITION) return null;
  }
  if (ops.length !== 1) return null;
  const definition = ops[0]!;
  const fields: FieldNode[] = [];
  for (const sel of definition.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) return null;
    if (sel.name.value !== '__typename') fields.push(sel);
  }
  if (fields.length !== 1) return null;
  return { operation: definition.operation, definition, field: fields[0]! };
}

const UNRESOLVED = Symbol('unresolved');

function resolveValue(node: ValueNode, definition: OperationDefinitionNode, variables: unknown): unknown {
  switch (node.kind) {
    case Kind.VARIABLE: {
      const vars = isRecord(variables) ? variables : {};
      const name = node.name.value;
      if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
      // A variable left to its declared default is treated as unknown.
      return definition.variableDefinitions?.some((v) => v.variable.name.value === name && v.defaultValue)
        ? UNRESOLVED
        : undefined;
    }
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.STRING:
    case Kind.ENUM:
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map((v) => resolveValue(v, definition, variables));
    case Kind.OBJECT:
      return Object.fromEntries(node.fields.map((f) => [f.name.value, resolveValue(f.value, definition, variables)]));
  }
}

function argument(single: SingleField, name: string, variables: unknown): unknown {
  const arg = single.field.arguments?.find((a) => a.name.value === name);
  return arg ? resolveValue(arg.value, single.definition, variables) : undefined;
}

/** `input` of a mutation as an object (from variables or inline), or null. */
function inputObject(single: SingleField, variables: unknown): Record<string, unknown> | null {
  const input = argument(single, 'input', variables);
  return isRecord(input) ? input : null;
}

function positiveId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** `input.parentId` of a single contactRegister mutation, else null. */
export function contactRegisterParentId(single: SingleField | null, variables: unknown): number | null {
  if (single?.operation !== 'mutation' || single.field.name.value !== 'contactRegister') return null;
  return positiveId(inputObject(single, variables)?.parentId);
}

// The checkout sets a new order to NEW (order), REQUEST (quote request) or UNFINISHED (via a PSP,
// whose webhook finalizes it), with payment OPEN. Nothing else is elevated.
const CHECKOUT_STATUSES = new Set(['NEW', 'REQUEST', 'UNFINISHED']);
const CHECKOUT_PAY_STATUSES = new Set<unknown>([undefined, null, 'OPEN']);

function isCheckoutStatus(input: Record<string, unknown>): boolean {
  return CHECKOUT_STATUSES.has(input.status as string) && CHECKOUT_PAY_STATUSES.has(input.payStatus);
}

// QuoteActions sends exactly { orderId, status: 'NEW' } for the quote the contact accepts.
function isQuoteAcceptance(input: Record<string, unknown>): boolean {
  return input.status === 'NEW' && Object.keys(input).every((k) => k === 'orderId' || k === 'status');
}

export interface ClassifyInput {
  doc: DocumentNode;
  single: SingleField | null;
  variables: unknown;
  /** No Authorization header and no session cookie. */
  isAnonymous: boolean;
  /** `X-Client-ID: order-editor` was sent. */
  orderEditorOptIn: boolean;
  /** From a verified last-order cookie, `used` merged with the server's spent log. */
  lastOrder: LastOrder | null;
}

export function classifyOperation({ doc, single, variables, isAnonymous, orderEditorOptIn, lastOrder }: ClassifyInput): KeyChoice {
  if (!single) return { key: 'general' };
  const name = single.field.name.value;

  if (single.operation === 'mutation') {
    if (ORDER_EDITOR_MUTATIONS.has(name)) {
      const input = inputObject(single, variables);
      if (!input) return { key: 'general' };
      const orderId = positiveId(input.orderId);
      const flag = MUTATION_FLAG[name]!;
      const checkout =
        !!lastOrder &&
        orderId === lastOrder.orderId &&
        !lastOrder.used.includes(flag) &&
        (name !== 'orderSetStatus' || isCheckoutStatus(input));
      if (checkout) return { key: 'order-editor', flag };
      if (name === 'orderSetStatus' && !isAnonymous && orderId && isQuoteAcceptance(input)) {
        return { key: 'quote-accept', orderId };
      }
      return { key: 'general' };
    }
    if (ORDER_EDITOR_OPT_IN_MUTATIONS.has(name) && orderEditorOptIn && !isAnonymous) {
      const companyId = positiveId(inputObject(single, variables)?.parentId);
      return companyId && documentHash(doc) === CONTACT_REGISTER_DOCUMENT_HASH ? { key: 'manager', companyId } : { key: 'general' };
    }
  }
  // Queries never elevate here: order reads are decided by orderReadAllowed.
  return { key: 'general' };
}

/**
 * A document selecting a checkout mutation (ORDER_EDITOR_MUTATIONS) runs only elevated (the last
 * order's checkout step, or the viewer's own quote acceptance) and only as the SDK's own document:
 * never with the storefront key, never with a selection of the caller's.
 */
export function checkoutMutationAllowed(doc: DocumentNode, elevated: boolean): boolean {
  let selects = false;
  visit(doc, {
    [Kind.FIELD](node) {
      if (ORDER_EDITOR_MUTATIONS.has(node.name.value)) selects = true;
    },
  });
  return !selects || (elevated && ORDER_EDITOR_DOCUMENT_HASHES.has(documentHash(doc)));
}

// ── Order reads: only for their owner ───────────────────────────────────────

/**
 * Query fields that read orders. No other type has a field of these names (CartProcessResponse.order
 * is a mutation's answer), so a match at any depth of a query is one of them.
 */
export const ORDER_READ_FIELDS: ReadonlySet<string> = new Set(['order', 'orders', 'orderGetPDF', 'quoteGetPDF']);

/** An order's owner and status, read with the order-editor key before serving an order read. */
export const ORDER_OWNER_QUERY = 'query proxyOrderOwner($orderId: Int) { order(orderId: $orderId) { status userId } }';

/**
 * Query fields reading an order's revisions, addresses, shipments, tender or payments by a
 * caller-chosen id. The storefront never sends them and the storefront key answers some for anyone:
 * refused at any depth unless the document is one of the SDK's own order reads (Next and Vue alike).
 */
export const ORDER_DATA_FIELDS: ReadonlySet<string> = new Set([
  'orderRevision',
  'orderRevisions',
  'orderAddress',
  'orderAddresses',
  'addressesByOrderId',
  'shipment',
  'shipments',
  'shipmentItem',
  'shipmentItems',
  'tender',
  'payment',
  'payments',
]);

// sha256 of print(parse(document)) of the installed SDK's order-read documents (the same as Next's);
// orderReads.test.ts fails after an SDK upgrade that changes them. Only these run with the
// order-editor key: it would run any other selection too (Order.company → its contacts).
export const ORDER_READ_DOCUMENT_HASHES: Readonly<Record<string, string>> = {
  order: '77fa18953b2fb00d852f3590b6f37f52e0fbe1b5fda3769666ab8bf818fa8d67',
  orders: '6d98254c16406c4bcf45c843ff50d0acf17e8205d221c52c50b75041cc387bbd',
  orderGetPDF: '0ba45ae37e76772ee44907fbcf5bc75ec0367053f5ad3859a58d65c5e27fdd2b',
  quoteGetPDF: 'b668082802f84663e95c1beab0d3d3246b52cbcac88d3b389d84ebfeb803d1e3',
};

/** Whether a query in `doc` (mutations aside) selects an order-read field, fragments and aliases included. */
export function readsOrders(doc: DocumentNode): boolean {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of doc.definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  const seen = new Set<string>();
  const walk = (set: SelectionSetNode): boolean =>
    set.selections.some((sel) => {
      if (sel.kind === Kind.FIELD) {
        const name = sel.name.value;
        if (ORDER_READ_FIELDS.has(name) || ORDER_DATA_FIELDS.has(name)) return true;
        return !!sel.selectionSet && walk(sel.selectionSet);
      }
      if (sel.kind === Kind.INLINE_FRAGMENT) return walk(sel.selectionSet);
      const fragment = fragments.get(sel.name.value);
      if (!fragment || seen.has(sel.name.value)) return false;
      seen.add(sel.name.value);
      return walk(fragment.selectionSet);
    });
  return doc.definitions.some(
    (def) => def.kind === Kind.OPERATION_DEFINITION && def.operation !== 'mutation' && walk(def.selectionSet),
  );
}

export interface OrderReadInput {
  doc: DocumentNode;
  single: SingleField | null;
  variables: unknown;
  /** The verified viewer; null for a guest or a token upstream doesn't accept. */
  viewer: Viewer | null;
  /** From a verified last-order cookie. */
  lastOrder: LastOrder | null;
  /** The order's owner and status, read with the order-editor key; null (or a throw) when unknown. */
  orderOwner: (orderId: number) => Promise<{ userId?: unknown; status?: unknown } | null>;
}

// The statuses the account pages list: vue-ui useOrders' default (orders), QUOTATION (quotes),
// REQUEST (quote requests). The order-editor key skips Propeller's own visibility rules, so drafts
// and anything else stay out.
export const LISTED_ORDER_STATUSES: ReadonlySet<unknown> = new Set(['NEW', 'CONFIRMED', 'VALIDATED', 'ORDER', 'QUOTATION', 'REQUEST']);

const isDraft = (status: unknown) => typeof status !== 'string' || status.startsWith('DRAFT');

/** `orders` input filtered on the viewer's own id, its own companies only, and listed statuses. */
function ownOrderSearch(input: unknown, viewer: Viewer): boolean {
  if (!isRecord(input)) return false;
  const statuses = Array.isArray(input.status) ? input.status : [input.status];
  if (!statuses.length || !statuses.every((s) => LISTED_ORDER_STATUSES.has(s))) return false;
  // GraphQL coerces a single value into the list.
  const userIds = Array.isArray(input.userId) ? input.userId : [input.userId];
  if (userIds.length !== 1 || userIds[0] !== viewer.userId) return false;
  if (input.companyIds === undefined || input.companyIds === null) return true;
  if (viewer.type !== 'Contact') return false;
  const companyIds = Array.isArray(input.companyIds) ? input.companyIds : [input.companyIds];
  return companyIds.every((id) => viewer.companyIds.includes(id as number));
}

/**
 * May a document that readsOrders() be served? Only the SDK's own order, orders, orderGetPDF or
 * quoteGetPDF document (ORDER_READ_DOCUMENT_HASHES), and:
 *   - a guest (no verified viewer): `order(orderId)` of the browser's signed last order (thank-you page);
 *   - `order` / `orderGetPDF` / `quoteGetPDF` by orderId, when the verified viewer placed the order and
 *     it is no draft;
 *   - `orders` filtered on the verified viewer's own userId (and companies) and listed statuses.
 * Everything else is refused, a failed owner lookup included. An allowed read goes upstream with
 * the order-editor key and without the Bearer, so the storefront key's own rules never matter.
 */
export async function orderReadAllowed({ doc, single, variables, viewer, lastOrder, orderOwner }: OrderReadInput): Promise<boolean> {
  const name = single?.operation === 'query' ? single.field.name.value : '';
  if (!single || !ORDER_READ_FIELDS.has(name) || documentHash(doc) !== ORDER_READ_DOCUMENT_HASHES[name]) return false;
  if (name === 'orders') return !!viewer && ownOrderSearch(argument(single, 'input', variables), viewer);
  // A UUID lookup could resolve a different order.
  const uuid = argument(single, 'orderUUID', variables);
  if (uuid !== undefined && uuid !== null) return false;
  const orderId = positiveId(argument(single, 'orderId', variables));
  if (!orderId) return false;
  if (!viewer) return name === 'order' && lastOrder?.orderId === orderId;
  try {
    const owner = await orderOwner(orderId);
    return !!owner && owner.userId === viewer.userId && !isDraft(owner.status);
  } catch {
    return false;
  }
}

/** The order id a relayed cartProcess mutation just created, if any. */
export function createdOrderId(single: SingleField | null, response: unknown): number | null {
  if (!single || single.operation !== 'mutation' || single.field.name.value !== 'cartProcess') return null;
  if (!isRecord(response) || !isRecord(response.data)) return null;
  const result = response.data[single.field.alias?.value ?? 'cartProcess'];
  const id = isRecord(result) ? result.cartOrderId : null;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Signed `propeller_last_order` value; '' without a secret. */
export function signLastOrder(secret: string, orderId: number, used = '', now?: number): string {
  return signCookieValue(secret, LAST_ORDER_PURPOSE, `${orderId}:${used}`, LAST_ORDER_MAX_AGE, now);
}

/** The order and its used flags when the cookie verifies, else null. */
export function verifyLastOrder(secret: string, value: string | null | undefined, now?: number): LastOrder | null {
  const payload = verifyCookieValue(secret, LAST_ORDER_PURPOSE, value, now);
  const match = payload ? /^([1-9]\d{0,14}):([sqc]{0,3})$/.exec(payload) : null;
  return match ? { orderId: Number(match[1]), used: match[2]! } : null;
}

/**
 * Server-side record of the elevated mutations already run per order. The cookie's flags alone can
 * be undone by replaying an older cookie; this can't (per process, kept as long as the cookie lives).
 */
export function createSpentLog({ ttlMs = LAST_ORDER_MAX_AGE * 1000, maxEntries = 10_000, now = Date.now } = {}) {
  const entries = new Map<number, { flags: string; at: number }>();
  return {
    flags(orderId: number): string {
      const entry = entries.get(orderId);
      if (!entry || now() - entry.at > ttlMs) return '';
      return entry.flags;
    },
    add(orderId: number, flag: string): void {
      const flags = this.flags(orderId);
      entries.delete(orderId);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as number);
      entries.set(orderId, { flags: flags.includes(flag) ? flags : flags + flag, at: now() });
    },
    /**
     * Spend `flag` unless it is spent already, in one synchronous step: false when another request
     * got there first. Call it after the request's last await, right before the upstream call, so
     * parallel requests can't all pass.
     */
    reserve(orderId: number, flag: string): boolean {
      if (this.flags(orderId).includes(flag)) return false;
      this.add(orderId, flag);
      return true;
    },
    /** Undo a reservation whose upstream call failed. */
    remove(orderId: number, flag: string): void {
      const entry = entries.get(orderId);
      if (entry) entry.flags = entry.flags.replace(flag, '');
    },
    size: () => entries.size,
  };
}

/**
 * Run the upstream call for a checkout flag reserve() just spent, and release the flag when the
 * call throws (network error, unreadable body) or `failed(result)`: the mutation didn't run, so the
 * shopper can retry it. Without a reservation it only runs `call`.
 */
export async function settleReserved<T>(
  log: { remove(orderId: number, flag: string): void },
  reserved: { orderId: number; flag: string } | null,
  call: () => Promise<T>,
  failed: (result: T) => boolean,
): Promise<T> {
  let result: T;
  try {
    result = await call();
  } catch (e) {
    if (reserved) log.remove(reserved.orderId, reserved.flag);
    throw e;
  }
  if (reserved && failed(result)) log.remove(reserved.orderId, reserved.flag);
  return result;
}
