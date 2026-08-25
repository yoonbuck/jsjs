export const P1C_COLLATERAL_PATHS = Object.freeze([
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-elem.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-ary-rest.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-id.js',
  'test/language/expressions/arrow-function/dstr/dflt-ary-ptrn-rest-obj-prop-id.js',
]);

export const P1C_COLLATERAL_BASE_CLASSIFICATIONS = Object.freeze(
  P1C_COLLATERAL_PATHS.map((path) =>
    Object.freeze({
      path,
      variants: 2,
      partition: 'core',
      status: 'selected-passing',
      blocker: null,
      features: Object.freeze(['default-parameters', 'destructuring-binding']),
      flags: Object.freeze(['generated']),
      includes: Object.freeze([]),
      provenance: Object.freeze([
        'anchor:sec-arrow-function-definitions-runtime-semantics-evaluation',
        'feature:default-parameters',
        'feature:destructuring-binding',
      ]),
    }),
  ),
);

export const P1C_COLLATERAL_BLOCKED_CLASSIFICATIONS = Object.freeze(
  P1C_COLLATERAL_BASE_CLASSIFICATIONS.map((entry) =>
    Object.freeze({
      ...entry,
      status: 'blocked:early-errors-and-declaration-instantiation',
      blocker: 'early-errors-and-declaration-instantiation',
    }),
  ),
);

export const P1C_CORRECTED_APPLIED_RECORD_SHA256 =
  '64db02e17f5d7e7f26805eee912d625b53a989e4c4ae17b15165bea3118bfefa';
