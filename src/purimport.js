/* Vibey PureRef (.pur) importer.
 *
 * Reader logic ported from FyorDev/PureRef-format (MIT License):
 * "Reverse engineered the .pur file format" — supports PureRef 1.10/1.11 scenes.
 * https://github.com/FyorDev/PureRef-format
 *
 * Pure, dependency-free: ArrayBuffer in, { images, texts } out.
 * Rotation is reported but not applied (Vibey has no rotation support).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PurImport = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PNG_HEAD = [137, 80, 78, 71, 13, 10, 26, 10];
  const PNG_FOOT = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
  const ITEM_IMAGE = 34;
  const ITEM_TEXT = 32;
  const FF4 = [255, 255, 255, 255];

  function matchAt(bytes, pos, pattern) {
    if (pos + pattern.length > bytes.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      if (bytes[pos + i] !== pattern[i]) return false;
    }
    return true;
  }

  function findPattern(bytes, from, pattern) {
    for (let i = from; i + pattern.length <= bytes.length; i++) {
      if (matchAt(bytes, i, pattern)) return i;
    }
    return -1;
  }

  function hsvToRgb65(h, s, v) {
    h = (((h % 35900) + 35900) % 35900) / 35900;
    s /= 65535; v /= 65535;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 65535), Math.round(g * 65535), Math.round(b * 65535)];
  }

  function Reader(buffer) {
    this.b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.v = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
    this.pos = 0;
  }
  Reader.prototype.left = function () { return this.b.length - this.pos; };
  Reader.prototype.u8 = function () { return this.v.getUint8(this.pos++); };
  Reader.prototype.i8 = function () { const x = this.v.getInt8(this.pos); this.pos += 1; return x; };
  Reader.prototype.u16 = function () { const x = this.v.getUint16(this.pos, false); this.pos += 2; return x; };
  Reader.prototype.u32 = function () { const x = this.v.getUint32(this.pos, false); this.pos += 4; return x; };
  Reader.prototype.i32 = function () { const x = this.v.getInt32(this.pos, false); this.pos += 4; return x; };
  Reader.prototype.u64 = function () {
    const hi = this.v.getUint32(this.pos, false);
    const lo = this.v.getUint32(this.pos + 4, false);
    this.pos += 8;
    return hi * 4294967296 + lo;
  };
  Reader.prototype.f64 = function () { const x = this.v.getFloat64(this.pos, false); this.pos += 8; return x; };
  Reader.prototype.peekU32 = function (off) { return this.v.getUint32(this.pos + off, false); };
  Reader.prototype.skip = function (n) { this.pos += n; };
  Reader.prototype.matrix = function () {
    const m = [this.v.getFloat64(this.pos, false), this.v.getFloat64(this.pos + 8, false),
               this.v.getFloat64(this.pos + 24, false), this.v.getFloat64(this.pos + 32, false)];
    this.pos += 48;
    return m;
  };
  Reader.prototype.rgb = function () { return [this.u16(), this.u16(), this.u16()]; };
  Reader.prototype.string = function () {
    const len = this.u32();
    let s = '';
    const end = this.pos + len;
    for (let i = this.pos; i + 1 < end; i += 2) {
      s += String.fromCharCode((this.b[i] << 8) | this.b[i + 1]);
    }
    this.pos = end;
    return s;
  };

  function readTextItem(r) {
    const end = r.u64();
    const stdLen = r.u32();
    r.skip(stdLen);
    const t = { kind: 'text', text: r.string() };
    t.matrix = r.matrix();
    t.x = r.f64(); t.y = r.f64();
    r.skip(8);
    t.id = r.u32();
    t.z = r.f64();
    const fgHsv = r.i8() === 2;
    t.opacity = r.u16();
    t.rgb = r.rgb();
    if (fgHsv) t.rgb = hsvToRgb65(t.rgb[0], t.rgb[1], t.rgb[2]);
    r.skip(2);
    const bgHsv = r.i8() === 2;
    t.opacityBg = r.u16();
    t.rgbBg = r.rgb();
    if (bgHsv) t.rgbBg = hsvToRgb65(t.rgbBg[0], t.rgbBg[1], t.rgbBg[2]);
    const childCount = r.v.getUint32(r.pos + 2, false);
    r.pos = end;
    t.children = [];
    for (let i = 0; i < childCount; i++) t.children.push(readTextItem(r));
    return t;
  }

  function readImageItem(r, imageItems) {
    const end = r.u64();
    const stdLen = r.u32();
    r.skip(stdLen);
    const it = { kind: 'image' };
    let brute = false;
    if (r.peekU32(0) === 0) { brute = true; r.skip(4); }
    if (r.v.getInt32(r.pos, false) === -1) { r.skip(4); }
    else { it.source = r.string(); }
    if (!brute) {
      if (r.v.getInt32(r.pos, false) === -1) { r.skip(4); }
      else { it.name = r.string(); }
    }
    r.skip(8);
    it.matrix = r.matrix();
    it.x = r.f64(); it.y = r.f64();
    r.skip(8);
    it.id = r.u32();
    it.z = r.f64();
    it.matrixCrop = r.matrix();
    it.xCrop = r.f64(); it.yCrop = r.f64(); it.scaleCrop = r.f64();
    const pointCount = r.u32();
    it.points = [[], []];
    for (let i = 0; i < pointCount; i++) {
      r.skip(4);
      it.points[0].push(r.f64());
      it.points[1].push(r.f64());
    }
    const childCount = r.v.getUint32(r.pos + 21, false);
    r.pos = end;
    it.children = [];
    for (let i = 0; i < childCount; i++) it.children.push(readTextItem(r));
    imageItems.push(it);
    return it;
  }

  function fullParse(bytes) {
    const r = new Reader(bytes);
    if (r.b.length < 224) throw new Error('File too small');
    const canvas = [r.v.getFloat64(112, false), r.v.getFloat64(120, false),
                    r.v.getFloat64(128, false), r.v.getFloat64(136, false)];
    const zoom = r.v.getFloat64(144, false);
    const view = { x: r.v.getInt32(216, false), y: r.v.getInt32(220, false) };
    r.pos = 224;

    const images = [];
    for (;;) {
      const start = findPattern(r.b, r.pos, PNG_HEAD);
      if (start < 0) break;
      const foot = findPattern(r.b, start + 8, PNG_FOOT);
      if (foot < 0) break;
      const end = foot + 12;
      if (start - r.pos >= 4) {
        images.push({ address: [r.pos, r.pos + 4], png: r.b.slice(r.pos, r.pos + 4), transforms: [] });
        r.pos += 4;
      } else {
        images.push({ address: [start, end], png: r.b.slice(start, end), transforms: [] });
        r.pos = end;
      }
    }
    while (r.left() >= 12) {
      const marker = r.peekU32(8);
      if (marker === ITEM_IMAGE || marker === ITEM_TEXT) break;
      images.push({ address: [r.pos, r.pos + 4], png: r.b.slice(r.pos, r.pos + 4), transforms: [] });
      r.pos += 4;
    }

    const imageItems = [];
    const texts = [];
    while (r.left() >= 12) {
      const marker = r.peekU32(8);
      if (marker !== ITEM_IMAGE && marker !== ITEM_TEXT) break;
      if (marker === ITEM_IMAGE) readImageItem(r, imageItems);
      else texts.push(readTextItem(r));
    }

    let folderLocation = '';
    try { folderLocation = r.string(); } catch (e) { folderLocation = ''; }

    for (let i = 0; i < imageItems.length && r.left() >= 20; i++) {
      const redId = r.u32();
      const ref0 = r.u64();
      r.u64();
      const item = imageItems.find((x) => x.id === redId);
      const img = images.find((x) => x.address[0] === ref0);
      if (item && img) img.transforms = [item];
    }

    const isDup = (img) => img.png.length === 4 && !matchAt(img.png, 0, FF4);
    for (const img of images) {
      if (!isDup(img)) continue;
      const targetId = (img.png[0] << 24) | (img.png[1] << 16) | (img.png[2] << 8) | img.png[3];
      const targetIdU = targetId >>> 0;
      const other = images.find((x) => x.transforms.length && x.transforms[0].id === targetIdU);
      if (other) other.transforms = other.transforms.concat(img.transforms);
    }
    const kept = images.filter((x) => !isDup(x));

    const outImages = [];
    for (const img of kept) {
      if (img.png.length < 20 || !matchAt(img.png, 0, PNG_HEAD)) continue; // link w/o data
      for (const t of img.transforms) {
        let w = 0, h = 0;
        if (t.points && t.points[0].length >= 3) {
          w = (t.points[0][2] - t.points[0][0]) * t.matrix[0];
          h = (t.points[1][2] - t.points[1][0]) * t.matrix[3];
        }
        outImages.push({
          data: img.png, x: t.x, y: t.y, w: w, h: h, z: t.z || 0,
          name: t.name || '',
          rotated: Math.abs(t.matrix[1]) > 1e-9 || Math.abs(t.matrix[2]) > 1e-9
        });
      }
      if (!img.transforms.length) {
        outImages.push({ data: img.png, x: 0, y: 0, w: 0, h: 0, z: 0, name: '', rotated: false, unplaced: true });
      }
    }
    return { images: outImages, texts: texts, canvas: canvas, zoom: zoom, view: view, partial: false };
  }

  function scanPNGs(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const images = [];
    let from = 0;
    for (;;) {
      const start = findPattern(b, from, PNG_HEAD);
      if (start < 0) break;
      const foot = findPattern(b, start + 8, PNG_FOOT);
      if (foot < 0) break;
      const end = foot + 12;
      images.push({ data: b.slice(start, end), x: 0, y: 0, w: 0, h: 0, z: images.length, name: '', rotated: false, unplaced: true });
      from = end;
    }
    return { images: images, texts: [], partial: true };
  }

  function parse(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let res = null;
    try { res = fullParse(bytes); } catch (e) { res = null; }
    if (!res || (!res.images.length && !res.texts.length)) {
      res = scanPNGs(bytes);
    }
    if (!res.images.length && !res.texts.length) {
      throw new Error('No importable content found');
    }
    return res;
  }

  return { parse: parse, scanPNGs: scanPNGs };
}));
