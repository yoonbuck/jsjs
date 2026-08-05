/**
 * URL-free path resolution for adapter entry points.
 *
 * The `jsc` shell provides no `URL` constructor, so adapters that need to turn
 * `import.meta.url` into a sibling directory cannot use `new URL(...)`. This
 * helper performs the same relative resolution with string operations only,
 * and returns a value every adapter accepts: a `file:`/`http:` URL string when
 * the base is one, or a plain path when it is not.
 */

/**
 * The URL of the module that owns `meta`.
 *
 * Node and browsers expose `import.meta.url`; the `jsc` shell exposes
 * `import.meta.filename` instead, so portable adapters have to accept both.
 *
 * @param {ImportMeta} meta
 * @returns {string}
 */
export function moduleUrl(meta) {
  const url = meta.url ?? meta.filename;

  if (typeof url !== 'string') {
    throw new TypeError('This runtime exposes no module URL on import.meta');
  }

  return url;
}

/**
 * @param {string} base A module URL, e.g. `moduleUrl(import.meta)`.
 * @param {string} relative A relative path such as `../fixtures/test262/`.
 * @returns {string}
 */
export function resolveRelativePath(base, relative) {
  const separator = base.lastIndexOf('/');
  const segments = (separator === -1 ? base : base.slice(0, separator)).split(
    '/',
  );

  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  const resolved = segments.join('/');

  return relative.endsWith('/') ? `${resolved}/` : resolved;
}
