// node test/vault.test.js
const V = require('../vault.js');
(async () => {
  const data = { movs: [{ id: 'a', amount: 5000, description: 'Súper ñandú' }], settings: { x: 1 } };
  const k = await V.newKey('mi clave segura');
  const env = await V.seal(k, data);
  const ok = [];
  ok.push(['no hay texto plano', !JSON.stringify(env).includes('ñandú') && !JSON.stringify(env).includes('5000')]);
  const k2 = await V.keyForEnvelope('mi clave segura', env);
  ok.push(['abre con la clave', JSON.stringify(await V.open(k2, env)) === JSON.stringify(data)]);
  const bad = await V.keyForEnvelope('otra clave', env);
  let err = null; try { await V.open(bad, env); } catch (e) { err = e.message; }
  ok.push(['rechaza clave incorrecta', err === 'bad_password']);
  const tampered = Object.assign({}, env, { data: env.data.slice(0, -4) + 'AAAA' });
  err = null; try { await V.open(k2, tampered); } catch (e) { err = e.message; }
  ok.push(['detecta archivo alterado', err === 'bad_password']);
  const env2 = await V.seal(k, data);
  ok.push(['iv distinto en cada copia', env2.iv !== env.iv]);
  ok.forEach(([n, v]) => console.log(v ? '✓' : '✗', n));
  process.exit(ok.every((x) => x[1]) ? 0 : 1);
})();
