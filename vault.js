/* Mis Finanzas — Copyright (c) 2026 Felipe Manrique. Todos los derechos reservados. Ver LICENSE. */
/* Cifrado de las copias: AES-GCM 256 con clave derivada de la contraseña (PBKDF2-SHA256).
   Lo que sube a Drive es un sobre {v, kdf, iter, salt, iv, data}; sin la contraseña no se puede leer. */
(function (root) {
  'use strict';
  const subtle = (root.crypto || globalThis.crypto).subtle;
  const ITER = 600000;
  const enc = new TextEncoder(), dec = new TextDecoder();

  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const random = (n) => (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));

  async function deriveKey(password, salt, iter = ITER) {
    const base = await subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Clave nueva con sal nueva (al elegir la contraseña por primera vez).
  async function newKey(password) {
    const salt = random(16);
    return { key: await deriveKey(password, salt), salt: b64(salt), iter: ITER };
  }

  // Clave para abrir un sobre existente (teléfono nuevo, restaurar).
  async function keyForEnvelope(password, env) {
    return { key: await deriveKey(password, unb64(env.salt), env.iter || ITER), salt: env.salt, iter: env.iter || ITER };
  }

  async function seal(k, obj) {
    const iv = random(12);
    const data = await subtle.encrypt({ name: 'AES-GCM', iv }, k.key, enc.encode(JSON.stringify(obj)));
    return { v: 1, app: 'mis-finanzas', kdf: 'PBKDF2-SHA256', iter: k.iter, salt: k.salt, iv: b64(iv), data: b64(data) };
  }

  // Lanza Error('bad_password') si la contraseña no corresponde.
  async function open(k, env) {
    if (!env || env.v !== 1 || !env.data) throw new Error('bad_file');
    try {
      const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, k.key, unb64(env.data));
      return JSON.parse(dec.decode(plain));
    } catch (e) { throw new Error('bad_password'); }
  }

  const api = { newKey, keyForEnvelope, seal, open };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Vault = api;
})(typeof window !== 'undefined' ? window : globalThis);
