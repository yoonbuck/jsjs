/**
 * Resolves Test262 module requests without involving a host path or URL API.
 *
 * Test262 identifiers are repository-relative slash-separated strings. Keeping
 * their normalization here lets the shared runner mean the same thing in Node,
 * a browser, and the JSC shell.
 */

/**
 * Rejects root identifiers that host path and URL APIs could interpret
 * differently.
 *
 * @param {string} path
 * @returns {string}
 */
export function assertPortableTest262Path(path) {
  if (typeof path !== 'string' || path === '') {
    throw new TypeError('Test262 path must be a non-empty string');
  }
  if (path.includes('\\')) {
    throw new RangeError('Test262 path cannot contain literal backslashes');
  }

  rejectEncodedStructuralPath(path);
  rejectUrlSensitivePath(path);

  if (
    path.startsWith('/') ||
    path
      .split('/')
      .some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new RangeError(
      'Test262 path must be a canonical repository-relative path',
    );
  }

  return path;
}

/**
 * @param {string} specifier
 * @param {string} referrer
 * @returns {string}
 */
export function resolveTest262ModulePath(specifier, referrer) {
  if (typeof specifier !== 'string') {
    throw new TypeError('Test262 module specifier must be a string');
  }
  if (typeof referrer !== 'string' || referrer === '') {
    throw new TypeError('Test262 module referrer must be a non-empty string');
  }
  assertPortableTest262Path(referrer);
  if (specifier.includes('\\')) {
    throw new RangeError(
      'Test262 module request cannot contain literal backslashes',
    );
  }
  rejectEncodedStructuralPath(specifier);
  rejectUrlSensitivePath(specifier);
  if (!isRelativeSpecifier(specifier)) {
    throw new TypeError(
      `Test262 module specifier must be relative: ${specifier}`,
    );
  }

  const segments = referrer.split('/');
  segments.pop();

  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        throw new RangeError(
          'Test262 module request cannot traverse above the Test262 root',
        );
      }
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new RangeError(
      'Test262 module request cannot resolve to the Test262 root',
    );
  }

  return assertPortableTest262Path(segments.join('/'));
}

/**
 * @param {string} specifier
 * @returns {boolean}
 */
function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Rejects percent encodings that a URL-oriented host may later interpret as a
 * separator or dot segment, after this portable string resolver has returned.
 *
 * @param {string} path
 * @returns {void}
 */
function rejectEncodedStructuralPath(path) {
  for (const segment of path.split('/')) {
    if (/%(?:2f|5c)/iu.test(segment)) {
      throw new RangeError(
        'Test262 module request cannot contain encoded path separators',
      );
    }

    if (/%2e/iu.test(segment)) {
      const decodedDots = segment.replace(/%2e/giu, '.');
      if (decodedDots === '.' || decodedDots === '..') {
        throw new RangeError(
          'Test262 module request cannot contain encoded dot segments',
        );
      }
    }
  }
}

/**
 * URL-oriented hosts decode percent escapes and interpret query/fragment
 * delimiters, while the JSC shell reads identifiers as literal file paths.
 * Reject those characters so every adapter addresses the same module.
 *
 * @param {string} path
 * @returns {void}
 */
function rejectUrlSensitivePath(path) {
  if (/[%?#:|\u0000-\u0020\u007f]/u.test(path)) {
    throw new RangeError(
      'Test262 module request cannot contain URL-sensitive characters',
    );
  }
}
