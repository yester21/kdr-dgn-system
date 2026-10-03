// zip.js — 의존성 0 ZIP 라이터 (store 방식, UTF-8 파일명, CRC32)
// 파일 목록: [{ path, content(string) }]

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2))) & 0xffff;
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { time, date };
}

export function makeZip(files, { now = new Date() } = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime(now);

  for (const file of files) {
    const nameBytes = enc.encode(file.path);
    const dataBytes = enc.encode(file.content ?? '');
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);      // 시그니처
    lv.setUint16(4, 20, true);              // 버전
    lv.setUint16(6, 0x0800, true);          // 플래그: UTF-8 파일명
    lv.setUint16(8, 0, true);               // 메서드: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);              // extra 길이
    local.set(nameBytes, 30);

    chunks.push(local, dataBytes);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);              // 버전 생성
    cv.setUint16(6, 20, true);              // 버전 필요
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    // 30~: extra/comment/disk/attrs = 0
    cv.setUint32(42, offset, true);         // 로컬 헤더 오프셋
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + dataBytes.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);    // 디스크 내 엔트리
  ev.setUint16(10, central.length, true);   // 전체 엔트리
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, eocd], { type: 'application/zip' });
}
