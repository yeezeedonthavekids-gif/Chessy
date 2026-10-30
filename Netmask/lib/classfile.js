// Minimal Java .class parser: pulls the constant pool so the scanner can see
// every string literal, referenced class and method without running anything.

const TAG = {
  UTF8: 1, INT: 3, FLOAT: 4, LONG: 5, DOUBLE: 6, CLASS: 7, STRING: 8,
  FIELDREF: 9, METHODREF: 10, IMETHODREF: 11, NAMEANDTYPE: 12,
  METHODHANDLE: 15, METHODTYPE: 16, DYNAMIC: 17, INVOKEDYNAMIC: 18,
  MODULE: 19, PACKAGE: 20,
};

function decodeModifiedUtf8(buf, start, len) {
  // Java's "modified UTF-8" is close enough to UTF-8 for analysis purposes,
  // except for the 0xC0 0x80 null encoding which we normalise.
  let out = '';
  let i = start;
  const end = start + len;
  while (i < end) {
    const a = buf[i++];
    if (a < 0x80) { out += String.fromCharCode(a); continue; }
    if ((a & 0xe0) === 0xc0 && i < end) {
      const b = buf[i++];
      out += String.fromCharCode(((a & 0x1f) << 6) | (b & 0x3f));
      continue;
    }
    if ((a & 0xf0) === 0xe0 && i + 1 < end) {
      const b = buf[i++];
      const c = buf[i++];
      out += String.fromCharCode(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f));
      continue;
    }
    out += '�';
  }
  return out;
}

function parseClass(buf) {
  if (buf.length < 10 || buf.readUInt32BE(0) !== 0xcafebabe) return null;
  const major = buf.readUInt16BE(6);
  const count = buf.readUInt16BE(8);
  const pool = new Array(count);
  let p = 10;

  for (let i = 1; i < count; i++) {
    if (p >= buf.length) return null;
    const tag = buf[p++];
    switch (tag) {
      case TAG.UTF8: {
        const len = buf.readUInt16BE(p); p += 2;
        pool[i] = { tag, value: decodeModifiedUtf8(buf, p, len) };
        p += len;
        break;
      }
      case TAG.INT: case TAG.FLOAT:
        p += 4; break;
      case TAG.LONG: case TAG.DOUBLE:
        p += 8; i++; break; // takes two slots
      case TAG.CLASS: case TAG.STRING: case TAG.METHODTYPE:
      case TAG.MODULE: case TAG.PACKAGE:
        pool[i] = { tag, ref: buf.readUInt16BE(p) }; p += 2; break;
      case TAG.FIELDREF: case TAG.METHODREF: case TAG.IMETHODREF:
      case TAG.NAMEANDTYPE: case TAG.DYNAMIC: case TAG.INVOKEDYNAMIC:
        pool[i] = { tag, a: buf.readUInt16BE(p), b: buf.readUInt16BE(p + 2) }; p += 4; break;
      case TAG.METHODHANDLE:
        p += 3; break;
      default:
        return null; // corrupt or deliberately malformed
    }
  }

  const utf = (idx) => (pool[idx] && pool[idx].tag === TAG.UTF8 ? pool[idx].value : '');
  const className = (idx) => (pool[idx] && pool[idx].tag === TAG.CLASS ? utf(pool[idx].ref) : '');

  const strings = [];
  const classes = new Set();
  const methods = new Set(); // "owner.name"

  for (let i = 1; i < count; i++) {
    const e = pool[i];
    if (!e) continue;
    if (e.tag === TAG.STRING) strings.push(utf(e.ref));
    else if (e.tag === TAG.CLASS) classes.add(utf(e.ref));
    else if (e.tag === TAG.METHODREF || e.tag === TAG.IMETHODREF) {
      const nat = pool[e.b];
      if (nat && nat.tag === TAG.NAMEANDTYPE) methods.add(`${className(e.a)}.${utf(nat.a)}`);
    }
  }

  // this_class sits right after access_flags
  let thisName = '';
  if (p + 4 <= buf.length) thisName = className(buf.readUInt16BE(p + 2));

  return { major, thisName, strings, classes: [...classes], methods: [...methods] };
}

module.exports = { parseClass };
