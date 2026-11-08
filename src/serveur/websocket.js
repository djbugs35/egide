// Protocole WebSocket (RFC 6455), réduit à ce qu'il faut à une liaison locale : aucune dépendance, le dépôt n'a pas de
// paquet npm et vendor/ ne porte que du code de navigateur. Pur : ni socket, ni horloge.
import {createHash} from "node:crypto";

export const OPCODES = {texte: 1, fermeture: 8, ping: 9, pong: 10};
// Un client n'envoie que des commandes : 1 Mio laisse passer une grosse modification de scénario, pas n'importe quoi.
export const CHARGE_ENTRANTE_MAX = 1 << 20;

const GUID_RFC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const ORIGINE_LOCALE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const LONGUEUR_16_BITS = 126;
const LONGUEUR_64_BITS = 127;
const TAILLE_MASQUE = 4;

export class TrameInvalide extends Error {}

/** Rendre l'en-tête Sec-WebSocket-Accept de la clé `cle` du client. */
export const cle_acceptation = (cle) => createHash("sha1").update(cle + GUID_RFC).digest("base64");

/**
 * Rendre vrai si l'en-tête Origin est absent (client hors navigateur) ou local. Sans ce contrôle, n'importe quelle page
 * ouverte dans un navigateur pourrait commander le serveur : un WebSocket échappe à la politique de même origine.
 */
export const origine_admise = (origine) => origine === undefined || ORIGINE_LOCALE.test(origine);

/** Rendre la trame serveur (non masquée, en un seul morceau) de code `opcode` et de contenu `charge` (Buffer). */
export function trame(opcode, charge) {
  const tete = charge.length < LONGUEUR_16_BITS ? Buffer.from([0x80 | opcode, charge.length]) : Buffer.alloc(charge.length < 65_536 ? 4 : 10);
  if (charge.length >= LONGUEUR_16_BITS) {
    tete[0] = 0x80 | opcode;
    tete[1] = charge.length < 65_536 ? LONGUEUR_16_BITS : LONGUEUR_64_BITS;
    if (charge.length < 65_536) tete.writeUInt16BE(charge.length, 2);
    else tete.writeBigUInt64BE(BigInt(charge.length), 2);
  }
  return Buffer.concat([tete, charge]);
}

/** Rendre {longueur, debut} de la trame en tête de `octets` ; null s'il manque des octets. */
function lire_longueur(octets) {
  const annoncee = octets[1] & 0x7f;
  if (annoncee < LONGUEUR_16_BITS) return {longueur: annoncee, debut: 2};
  if (annoncee === LONGUEUR_16_BITS) return octets.length < 4 ? null : {longueur: octets.readUInt16BE(2), debut: 4};
  return octets.length < 10 ? null : {longueur: Number(octets.readBigUInt64BE(2)), debut: 10};
}

/** Rendre une copie de `charge` démasquée par `masque`. */
function demasquer(charge, masque) {
  const claire = Buffer.alloc(charge.length);
  for (let i = 0; i < charge.length; i++) claire[i] = charge[i] ^ masque[i % TAILLE_MASQUE];
  return claire;
}

/** Lever TrameInvalide si la trame en tête de `octets` n'est pas masquée et entière, ou si elle est trop longue. */
function verifier_trame(octets, longueur) {
  if ((octets[0] & 0x80) === 0 || (octets[0] & 0x0f) === 0) throw new TrameInvalide("trame fragmentée non prise en charge");
  if ((octets[1] & 0x80) === 0) throw new TrameInvalide("trame client non masquée (RFC 6455 § 5.1)");
  if (longueur > CHARGE_ENTRANTE_MAX) throw new TrameInvalide(`trame de ${longueur} octets, au-delà de ${CHARGE_ENTRANTE_MAX}`);
}

/**
 * Rendre la fonction lire(morceau: Buffer) qui rend les messages [{opcode, charge}] complétés par ce morceau. TCP coupe
 * où il veut : le reste attend le morceau suivant. Lève TrameInvalide sur une trame refusée.
 */
export function creer_lecteur() {
  let reserve = Buffer.alloc(0);
  return (morceau) => {
    reserve = Buffer.concat([reserve, morceau]);
    const messages = [];
    while (reserve.length >= 2) {
      const entete = lire_longueur(reserve);
      if (!entete) break;
      verifier_trame(reserve, entete.longueur);
      const fin = entete.debut + TAILLE_MASQUE + entete.longueur;
      if (reserve.length < fin) break;
      const masque = reserve.subarray(entete.debut, entete.debut + TAILLE_MASQUE);
      messages.push({opcode: reserve[0] & 0x0f, charge: demasquer(reserve.subarray(entete.debut + TAILLE_MASQUE, fin), masque)});
      reserve = reserve.subarray(fin);
    }
    return messages;
  };
}
