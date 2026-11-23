/* QD XLSX: tạo file Excel (.xlsx) thật ngay trên trình duyệt, có định dạng đẹp, không cần thư viện ngoài.
   - Dải tiêu đề màu, dòng phụ, khối "Thông tin báo cáo", "Số liệu tóm tắt", bảng có dòng tiêu đề màu,
     kẻ viền nhạt, sọc xen kẽ, số có dấu phân cách hàng nghìn, cố định dòng tiêu đề, nút lọc, độ rộng cột tự động,
     in ngang vừa 1 trang bề rộng, lặp lại dòng tiêu đề mỗi trang in, đánh số trang.
   QDXlsx.download('Ten_file.xlsx', { color: '#16a34a', sheets: [{ name, title, subtitle, blocks: [...] }] })
   Khối: { type: 'meta',  title, rows: [[nhãn, giá trị], ...] }
         { type: 'kpi',   title, items: [[nhãn, giá trị, ghi chú], ...] }
         { type: 'table', title, cols: [{ h: 'Tên cột', t: 'n' | 's' | 'p' | 'c' | 't' | '' }], rows: [[...]], total: [...], main: true }
           t: n = số (#.##0), s = số có dấu +/- (xanh / đỏ), p = phần trăm (0..1), c = căn giữa, t = giữ nguyên dạng chữ (mã, số TK) */
window.QDXlsx = (function () {
    'use strict';
    var enc = new TextEncoder();

    /* ---------- ZIP (không nén) ---------- */
    var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    function crc32(u) { var c = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function zip(files) {
        var parts = [], cen = [], off = 0, d = new Date();
        var tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        files.forEach(function (f) {
            var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
            var h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
            h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
            h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
            parts.push(new Uint8Array(h.buffer), name, data);
            var c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
            c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
            c.setUint16(28, name.length, true); c.setUint32(42, off, true);
            cen.push(new Uint8Array(c.buffer), name);
            off += 30 + name.length + data.length;
        });
        var cenLen = cen.reduce(function (a, p) { return a + p.length; }, 0);
        var e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cenLen, true); e.setUint32(16, off, true);
        var all = parts.concat(cen, [new Uint8Array(e.buffer)]), len = all.reduce(function (a, p) { return a + p.length; }, 0), out = new Uint8Array(len), p = 0;
        all.forEach(function (a) { out.set(a, p); p += a.length; });
        return out;
    }

    /* ---------- Tiện ích ---------- */
    function x(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function hex(c, def) { c = String(c || def || '').replace('#', '').trim(); if (c.length === 3) c = c.replace(/(.)/g, '$1$1'); return /^[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : (def || '0F766E').replace('#', ''); }
    function mix(c, w, k) { var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16), m = function (v, t) { return Math.round(v + (t - v) * k); }; w = w || 255; return [m(r, w), m(g, w), m(b, w)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('').toUpperCase(); }
    function col(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
    function ref(r, c) { return col(c) + (r + 1); }
    function textLen(v) { return String(v == null ? '' : v).split('\n').reduce(function (a, l) { return Math.max(a, l.length); }, 0); }
    function sheetName(s, used) {
        var n = String(s || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet', b = n, i = 2;
        while (used[n.toLowerCase()]) n = b.slice(0, 28) + ' ' + (i++);
        used[n.toLowerCase()] = 1; return n;
    }

    /* ---------- Bảng kiểu (styles.xml) ---------- */
    function Styles() {
        var S = { fonts: ['<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>'], fills: ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
            borders: ['<border><left/><right/><top/><bottom/><diagonal/></border>'], fmts: [], xfs: ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], map: {} };
        function idx(list, xml) { var i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; }
        S.get = function (o) {
            o = o || {}; var key = JSON.stringify(o); if (S.map[key] != null) return S.map[key];
            var font = '<font>' + (o.b ? '<b/>' : '') + (o.i ? '<i/>' : '') + '<sz val="' + (o.sz || 11) + '"/><color rgb="FF' + (o.color || '1F2937') + '"/><name val="Calibri"/><family val="2"/></font>';
            var fill = o.fill ? '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>' : null;
            var side = function (n, v) { return v ? '<' + n + ' style="' + v[0] + '"><color rgb="FF' + v[1] + '"/></' + n + '>' : '<' + n + '/>'; };
            var bd = (o.bl || o.br || o.bt || o.bb) ? '<border>' + side('left', o.bl) + side('right', o.br) + side('top', o.bt) + side('bottom', o.bb) + '<diagonal/></border>' : null;
            var nf = 0;
            if (o.fmt === '@') nf = 49; else if (o.fmt) { var fi = S.fmts.indexOf(o.fmt); if (fi < 0) { S.fmts.push(o.fmt); fi = S.fmts.length - 1; } nf = 164 + fi; }
            var al = (o.h || o.v || o.wrap || o.indent) ? '<alignment' + (o.h ? ' horizontal="' + o.h + '"' : '') + ' vertical="' + (o.v || 'center') + '"' + (o.wrap ? ' wrapText="1"' : '') + (o.indent ? ' indent="' + o.indent + '"' : '') + '/>' : '<alignment vertical="center"/>';
            var xf = '<xf numFmtId="' + nf + '" fontId="' + idx(S.fonts, font) + '" fillId="' + (fill ? idx(S.fills, fill) : 0) + '" borderId="' + (bd ? idx(S.borders, bd) : 0) + '" xfId="0"'
                + (nf ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fill ? ' applyFill="1"' : '') + (bd ? ' applyBorder="1"' : '') + ' applyAlignment="1">' + al + '</xf>';
            return (S.map[key] = idx(S.xfs, xf));
        };
        S.xml = function () {
            return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                + (S.fmts.length ? '<numFmts count="' + S.fmts.length + '">' + S.fmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + x(f) + '"/>'; }).join('') + '</numFmts>' : '')
                + '<fonts count="' + S.fonts.length + '">' + S.fonts.join('') + '</fonts><fills count="' + S.fills.length + '">' + S.fills.join('') + '</fills>'
                + '<borders count="' + S.borders.length + '">' + S.borders.join('') + '</borders>'
                + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                + '<cellXfs count="' + S.xfs.length + '">' + S.xfs.join('') + '</cellXfs>'
                + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        };
        return S;
    }

    /* ---------- Một trang tính ---------- */
    function Sheet(name) {
        var W = { name: name, rows: {}, merges: [], ht: {}, w: {}, maxR: 0, maxC: 0, freeze: 0, filter: null, printRows: null };
        W.set = function (r, c, v, s) { (W.rows[r] = W.rows[r] || {})[c] = { v: v, s: s }; if (r > W.maxR) W.maxR = r; if (c > W.maxC) W.maxC = c; };
        W.merge = function (r1, c1, r2, c2) { if (r1 === r2 && c1 === c2) return; W.merges.push(ref(r1, c1) + ':' + ref(r2, c2)); };
        W.need = function (c, len) { if (len > (W.w[c] || 0)) W.w[c] = len; };
        W.xml = function (landscape) {
            var cols = '', sd = '';
            for (var c = 0; c <= W.maxC; c++) cols += '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (W.w[c] || 10).toFixed(1) + '" customWidth="1"/>';
            for (var r = 0; r <= W.maxR; r++) {
                var row = W.rows[r], h = W.ht[r];
                if (!row && !h) continue;
                sd += '<row r="' + (r + 1) + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>';
                if (row) Object.keys(row).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
                    var cell = row[c], v = cell.v, a = ref(r, c), st = cell.s ? ' s="' + cell.s + '"' : '';
                    if (v === null || v === undefined || v === '') sd += '<c r="' + a + '"' + st + '/>';
                    else if (typeof v === 'number' && isFinite(v)) sd += '<c r="' + a + '"' + st + '><v>' + v + '</v></c>';
                    else sd += '<c r="' + a + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
                });
                sd += '</row>';
            }
            var tl = ref(W.freeze, W.freezeCols || 0), ap = W.freezeCols ? 'bottomRight' : 'bottomLeft';
            var pane = W.freeze ? '<pane' + (W.freezeCols ? ' xSplit="' + W.freezeCols + '"' : '') + ' ySplit="' + W.freeze + '" topLeftCell="' + tl + '" activePane="' + ap + '" state="frozen"/><selection pane="' + ap + '" activeCell="' + tl + '" sqref="' + tl + '"/>' : '';
            return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:' + ref(W.maxR, W.maxC) + '"/>'
                + '<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="100">' + pane + '</sheetView></sheetViews>'
                + '<sheetFormatPr defaultRowHeight="15"/><cols>' + cols + '</cols><sheetData>' + sd + '</sheetData>'
                + (W.filter ? '<autoFilter ref="' + W.filter + '"/>' : '')
                + (W.merges.length ? '<mergeCells count="' + W.merges.length + '">' + W.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '')
                + '<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
                + '<pageSetup paperSize="9" orientation="' + (landscape ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0"/>'
                + '<headerFooter><oddFooter>&amp;L&amp;8QD Elite&amp;R&amp;8Trang &amp;P / &amp;N</oddFooter></headerFooter></worksheet>';
        };
        return W;
    }

    /* ---------- Dựng file từ mô tả ---------- */
    function build(spec) {
        var S = Styles(), C = hex(spec.color, '0F766E'), used = {}, sheets = [];
        var LINE = 'E2E8F0', ZEBRA = 'F8FAFC', TINT = mix(C, 255, 0.88), SOFT = mix(C, 255, 0.94), INK = '1F2937', MUTED = '64748B';
        var thin = ['thin', LINE], box = { bl: thin, br: thin, bt: thin, bb: thin };
        function st(o) { var r = {}; [box, o || {}].forEach(function (s) { Object.keys(s).forEach(function (k) { r[k] = s[k]; }); }); return S.get(r); }
        var K = {
            title: S.get({ b: 1, sz: 16, color: 'FFFFFF', fill: C, indent: 1 }),
            sub: S.get({ i: 1, sz: 10, color: MUTED, indent: 1 }),
            sec: S.get({ b: 1, sz: 12, color: C, bb: ['medium', C] }),
            head: S.get({ b: 1, color: 'FFFFFF', fill: C, h: 'center', wrap: 1, bl: ['thin', C], br: ['thin', 'FFFFFF'], bt: ['thin', C], bb: ['thin', C] }),
            mk: st({ b: 1, color: '334155', fill: SOFT, indent: 1 }),
            mv: st({ indent: 1 }),
            kl: st({ b: 1, color: '334155', fill: SOFT, indent: 1 }),
            kv: st({ b: 1, sz: 13, color: C, h: 'right' }),
            kn: st({ i: 1, sz: 10, color: MUTED, indent: 1 })
        };
        var FMT = { n: '#,##0', d: '#,##0.00', s: '+#,##0;-#,##0;0', sd: '+#,##0.00;-#,##0.00;0', p: '0.0%' };
        function cellStyle(t, v, zebra, total) {
            var o = {}; if (zebra) o.fill = ZEBRA; if (total) { o.b = 1; o.fill = TINT; o.bt = ['medium', C]; }
            if (typeof v === 'number') {
                var dec = Math.round(v) !== v;
                o.h = t === 'c' ? 'center' : 'right';
                o.fmt = t === 'p' ? FMT.p : t === 's' ? (dec ? FMT.sd : FMT.s) : (dec ? FMT.d : FMT.n);
                if (t === 's' && v) { o.color = v > 0 ? '15803D' : 'DC2626'; o.b = 1; }
                if (t === 'c' && !dec) o.fmt = '0';
            } else {
                if (t === 't') o.fmt = '@';
                if (t === 'c' || t === 't' && textLen(v) <= 14) o.h = 'center'; else o.indent = 1;
            }
            return st(o);
        }
        function toVal(t, v) {
            if (v === null || v === undefined) return '';
            if (typeof v === 'number') return isFinite(v) ? v : '';
            if (t === 'n' || t === 's' || t === 'p') { var s = String(v).trim().replace(/[.,](?=\d{3}(\D|$))/g, ''); if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s); return v; }
            if (t === 't' && /^[+-]\d+(\.\d+)?$/.test(String(v).trim())) return Number(String(v).trim());   // "+5" / "-3" -> số có dấu
            return String(v);
        }
        var defined = [];
        spec.sheets.forEach(function (sp, si) {
            var W = Sheet(sheetName(sp.name, used)), r = 0;
            var tables = (sp.blocks || []).filter(function (b) { return b.type === 'table'; });
            var N = Math.max(spec.minCols || 4, sp.cols || 0, tables.reduce(function (a, t) { return Math.max(a, t.cols.length); }, 0));
            var titleLen = 0;
            if (sp.title && !sp.noTitle) {
                W.set(r, 0, sp.title, K.title); for (var c = 1; c < N; c++) W.set(r, c, '', K.title); W.merge(r, 0, r, N - 1); W.ht[r] = 34; titleLen = textLen(sp.title) * 1.45 + 4; r++;
                if (sp.subtitle) { W.set(r, 0, sp.subtitle, K.sub); W.merge(r, 0, r, N - 1); W.ht[r] = 20; titleLen = Math.max(titleLen, textLen(sp.subtitle) * 0.9 + 2); r++; }
                r++;
            }
            function section(t) {
                if (!t) return;
                for (var c = 0; c < N; c++) W.set(r, c, c ? '' : t, K.sec);
                W.merge(r, 0, r, N - 1); W.ht[r] = 24; r++;
            }
            (sp.blocks || []).forEach(function (b) {
                if (b.type === 'meta' && b.rows && b.rows.length) {
                    section(b.title);
                    b.rows.forEach(function (m) {
                        W.set(r, 0, m[0], K.mk); W.need(0, textLen(m[0]) + 3);
                        for (var c = 1; c < N; c++) W.set(r, c, c === 1 ? String(m[1] == null ? '' : m[1]) : '', K.mv);
                        if (N > 2) W.merge(r, 1, r, N - 1); W.ht[r] = 20; r++;
                    });
                    r++;
                }
                if (b.type === 'kpi' && b.items && b.items.length) {
                    section(b.title);
                    b.items.forEach(function (k) {
                        W.set(r, 0, k[0], K.kl); W.need(0, textLen(k[0]) + 3);
                        W.set(r, 1, String(k[1] == null ? '' : k[1]), K.kv); W.need(1, textLen(k[1]) * 1.25 + 3);
                        for (var c = 2; c < N; c++) W.set(r, c, c === 2 ? (k[2] || '') : '', K.kn);
                        if (N > 3) W.merge(r, 2, r, N - 1); W.ht[r] = 24; r++;
                    });
                    r++;
                }
                if (b.type === 'table') {
                    section(b.title);
                    var cols = b.cols, h0 = r;
                    cols.forEach(function (cd, c) { W.set(r, c, cd.h, K.head); W.need(c, Math.min(textLen(cd.h) + 3, 18)); });
                    for (var c2 = cols.length; c2 < N; c2++) if (!b.main) W.set(r, c2, '', 0);
                    W.ht[r] = 30; r++;
                    (b.rows || []).forEach(function (row, i) {
                        cols.forEach(function (cd, c) {
                            var v = toVal(cd.t, row[c]);
                            W.set(r, c, v, cellStyle(cd.t === 't' && typeof v === 'number' ? 's' : cd.t, v, i % 2 === 1, false));
                            W.need(c, (typeof v === 'number' ? String(Math.round(Math.abs(v))).length * 1.34 + 3 : textLen(v)) + 3);
                        });
                        W.ht[r] = 20; r++;
                    });
                    var last = r - 1;
                    if (b.total) {
                        cols.forEach(function (cd, c) { var v = toVal(cd.t, b.total[c]); W.set(r, c, v, cellStyle(cd.t === 's' ? 'n' : cd.t, v, false, true)); W.need(c, textLen(v) + 4); });
                        W.ht[r] = 22; r++;
                    }
                    if (b.main) {
                        if (!sp.noFreeze) { W.freeze = h0 + 1; W.freezeCols = Math.max(0, Math.min(cols.length - 1, sp.freezeCols || 0)); }
                        if (b.rows && b.rows.length) W.filter = ref(h0, 0) + ':' + ref(last, cols.length - 1);
                        W.printRows = h0;
                    }
                    r++;
                }
            });
            for (var c3 = 0; c3 < N; c3++) W.w[c3] = Math.max(spec.minW || 6, Math.min(spec.maxW || 55, W.w[c3] || 10));
            var tot = 0; for (var c4 = 0; c4 < N; c4++) tot += W.w[c4];
            if (titleLen > tot) W.w[N - 1] += titleLen - tot;   // đủ chỗ cho dòng tiêu đề
            if (W.printRows != null) defined.push('<definedName name="_xlnm.Print_Titles" localSheetId="' + si + '">\'' + W.name.replace(/'/g, "''") + '\'!$' + (W.printRows + 1) + ':$' + (W.printRows + 1) + '</definedName>');
            if (W.filter) defined.push('<definedName name="_xlnm._FilterDatabase" localSheetId="' + si + '" hidden="1">\'' + W.name.replace(/'/g, "''") + '\'!' + W.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') + '</definedName>');
            W.landscape = N > 5 || tot > 95;
            sheets.push(W);
        });
        var files = [
            { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                + sheets.map(function (w, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')
                + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
            { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
            { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x(spec.title || (spec.sheets[0] || {}).title || 'Báo cáo') + '</dc:title><dc:creator>QD Elite</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
            { name: 'docProps/app.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>QD Elite</Application></Properties>' },
            { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="' + Math.max(0, Math.min(sheets.length - 1, spec.active || 0)) + '"/></bookViews><sheets>'
                + sheets.map(function (w, i) { return '<sheet name="' + x(w.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>'
                + (defined.length ? '<definedNames>' + defined.join('') + '</definedNames>' : '') + '</workbook>' },
            { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + sheets.map(function (w, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('')
                + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' }
        ];
        sheets.forEach(function (w, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: w.xml(w.landscape) }); });
        files.push({ name: 'xl/styles.xml', data: S.xml() });
        return zip(files);
    }

    function download(name, spec) {
        var data = build(spec);
        name = String(name || 'Bao_Cao').replace(/\.(xlsx?|csv)$/i, '') + '.xlsx';
        var blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        return name;
    }

    /* Đổi bảng HTML cũ (các hàm xuất đời trước) sang .xlsx đẹp: mỗi <table> có dòng <th> -> 1 bảng; bảng không có <th> -> khối thông tin */
    function fromHtml(html, title, color) {
        var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html'), blocks = [], c0 = color;
        Array.prototype.forEach.call(doc.querySelectorAll('table'), function (tb) {
            var trs = Array.prototype.slice.call(tb.rows), hi = -1;
            trs.some(function (tr, i) { if (tr.querySelector('th')) { hi = i; return true; } return false; });
            var txt = function (td) { return (td.innerText || td.textContent || '').replace(/\s+/g, ' ').trim(); };
            if (hi < 0) {
                var rows = [], sec = '';
                trs.forEach(function (tr) { var cs = Array.prototype.slice.call(tr.cells); if (cs.length === 1) sec = sec || txt(cs[0]); else if (cs.length >= 2) rows.push([txt(cs[0]), cs.slice(1).map(txt).join(' · ')]); });
                if (rows.length) blocks.push({ type: 'meta', title: sec || 'Thông tin', rows: rows });
                return;
            }
            var th = trs[hi].cells, bg = trs[hi].querySelector('[bgcolor]');
            if (!c0 && bg) c0 = bg.getAttribute('bgcolor');
            var heads = Array.prototype.map.call(th, txt), body = trs.slice(hi + 1).map(function (tr) { return Array.prototype.map.call(tr.cells, function (td) { return { v: txt(td), t: /mso-number-format:\s*'?\\?@/.test(td.getAttribute('style') || '') }; }); });
            var cols = heads.map(function (h, i) {
                var vals = body.map(function (r) { return r[i]; }).filter(function (c) { return c && c.v !== ''; });
                if (vals.some(function (c) { return c.t; })) return { h: h, t: 't' };
                if (/^stt$|^#$|^hạng$/i.test(h)) return { h: h, t: 'c' };
                if (vals.length && vals.every(function (c) { return /^[+-]\d+(\.\d+)?$/.test(c.v) || /^-?\d+$/.test(c.v); }) && vals.some(function (c) { return /^\+/.test(c.v); })) return { h: h, t: 's' };
                if (vals.length && vals.every(function (c) { return /^-?\d{1,15}(\.\d+)?$/.test(c.v) && !/^0\d/.test(c.v); })) return { h: h, t: 'n' };
                return { h: h, t: '' };
            });
            blocks.push({ type: 'table', cols: cols, rows: body.map(function (r) { return r.map(function (c) { return c.v; }); }), main: false });
        });
        var tbs = blocks.filter(function (b) { return b.type === 'table'; });
        if (tbs.length) tbs[tbs.length - 1].main = tbs.length === 1;
        return { color: c0 || '#0f766e', sheets: [{ name: title, title: String(title || 'Báo cáo').toUpperCase(), subtitle: 'Quân Đoàn T"L"Headshot · QD Elite · Xuất lúc ' + new Date().toLocaleString('vi-VN'), blocks: blocks }] };
    }

    return { build: build, download: download, fromHtml: fromHtml };
})();
    
