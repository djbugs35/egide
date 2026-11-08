// Protocole WebSocket du serveur de partie : trames, découpage TCP, refus.
import assert from "node:assert/strict";
import test from "node:test";
import {CHARGE_ENTRANTE_MAX, cle_acceptation, creer_lecteur, OPCODES, origine_admise, trame, TrameInvalide} from "../src/serveur/websocket.js";

/** Rendre la trame masquée qu'enverrait un client. */
function trame_client(opcode, charge, {fin = true, masquee = true} = {}) {
  const masque = Buffer.from([1, 2, 3, 4]);
  const longueur = charge.length < 126 ? Buffer.from([(masquee ? 0x80 : 0) | charge.length]) : Buffer.from([(masquee ? 0x80 : 0) | 127, 0, 0, 0, 0, ...[24, 16, 8, 0].map((d) => (charge.length >>> d) & 0xff)]);
  const corps = Buffer.from(charge.map((octet, i) => octet ^ masque[i % 4]));
  return Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode]), longueur, ...(masquee ? [masque, corps] : [charge])]);
}

test("clé d'acceptation : l'exemple de la RFC 6455", () => {
  assert.equal(cle_acceptation("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("trame serveur : la longueur s'écrit sur 7, 16 ou 64 bits selon la charge", () => {
  assert.deepEqual([...trame(OPCODES.texte, Buffer.from("ab"))], [0x81, 2, 97, 98]);
  const moyenne = trame(OPCODES.texte, Buffer.alloc(300));
  assert.equal(moyenne[1], 126);
  assert.equal(moyenne.readUInt16BE(2), 300);
  assert.equal(moyenne.length, 304);
  const grande = trame(OPCODES.texte, Buffer.alloc(70_000));
  assert.equal(grande[1], 127);
  assert.equal(grande.readBigUInt64BE(2), 70_000n);
  assert.equal(grande.length, 70_010);
});

test("lecture : une trame coupée n'importe où par TCP est rendue une fois complète", () => {
  const entiere = trame_client(OPCODES.texte, Buffer.from('{"type":"pause"}'));
  for (let coupe = 1; coupe < entiere.length; coupe++) {
    const lire = creer_lecteur();
    assert.deepEqual(lire(entiere.subarray(0, coupe)), []);
    const [message] = lire(entiere.subarray(coupe));
    assert.equal(message.charge.toString(), '{"type":"pause"}');
  }
});

test("lecture : plusieurs trames dans un même morceau sortent toutes, dans l'ordre", () => {
  const morceau = Buffer.concat([trame_client(OPCODES.texte, Buffer.from("a")), trame_client(OPCODES.ping, Buffer.from("b"))]);
  assert.deepEqual(creer_lecteur()(morceau).map((m) => [m.opcode, m.charge.toString()]), [[OPCODES.texte, "a"], [OPCODES.ping, "b"]]);
});

test("lecture : trame non masquée, fragmentée ou trop longue refusée", () => {
  assert.throws(() => creer_lecteur()(trame_client(OPCODES.texte, Buffer.from("a"), {masquee: false})), TrameInvalide);
  assert.throws(() => creer_lecteur()(trame_client(OPCODES.texte, Buffer.from("a"), {fin: false})), TrameInvalide);
  assert.throws(() => creer_lecteur()(trame_client(OPCODES.texte, Buffer.alloc(CHARGE_ENTRANTE_MAX + 1))), TrameInvalide);
});

test("origine : un client hors navigateur et une page locale passent, un site tiers non", () => {
  assert.ok(origine_admise(undefined));
  assert.ok(origine_admise("http://127.0.0.1:8766"));
  assert.ok(origine_admise("http://localhost:8766"));
  assert.ok(!origine_admise("https://site-tiers.example"));
  assert.ok(!origine_admise("http://127.0.0.1.site-tiers.example"));
  assert.ok(!origine_admise("null"));
});
