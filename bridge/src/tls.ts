import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";

export type TlsMaterial = { cert: string; key: string; fingerprint: string };

function fingerprintOf(certPem: string): string {
  try {
    return new X509Certificate(certPem).fingerprint256;
  } catch {
    return "";
  }
}

/** Returns TLS material from explicit files, or a generated self-signed cert
 *  cached under ~/.opencode-remote/tls. */
export async function ensureTls(certPath?: string, keyPath?: string): Promise<TlsMaterial> {
  if (certPath && keyPath) {
    const cert = readFileSync(certPath, "utf8");
    return { cert, key: readFileSync(keyPath, "utf8"), fingerprint: fingerprintOf(cert) };
  }

  const dir = join(homedir(), ".opencode-remote", "tls");
  const certFile = join(dir, "cert.pem");
  const keyFile = join(dir, "key.pem");
  if (existsSync(certFile) && existsSync(keyFile)) {
    const cert = readFileSync(certFile, "utf8");
    return { cert, key: readFileSync(keyFile, "utf8"), fingerprint: fingerprintOf(cert) };
  }

  const { default: selfsigned } = await import("selfsigned");
  const pems = await selfsigned.generate([{ name: "commonName", value: "opencode-bridge" }], {
    days: 3650,
    keySize: 2048,
    algorithm: "sha256",
  } as never);
  mkdirSync(dir, { recursive: true });
  writeFileSync(certFile, pems.cert, "utf8");
  writeFileSync(keyFile, pems.private, "utf8");
  return { cert: pems.cert, key: pems.private, fingerprint: fingerprintOf(pems.cert) };
}
