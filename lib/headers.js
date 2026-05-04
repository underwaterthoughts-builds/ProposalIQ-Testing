// Build a Content-Disposition header value with a filename that is safe to
// embed in HTTP headers. Strips CR/LF (header injection), strips quotes
// (breaks the quoted-string), and falls back to a generic name if the input
// is empty or all-stripped. Encodes the original UTF-8 name via RFC 5987 so
// non-ASCII filenames survive (browsers prefer filename* when both present).
function contentDisposition(disposition, originalName, fallback = 'download') {
  const name = String(originalName || '').replace(/[\r\n"]/g, '').trim() || fallback;
  const ascii = name.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, '%2A');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

module.exports = { contentDisposition };
