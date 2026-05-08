import { JsonValue } from "@prisma-next/contract/types";
import type { Codec } from "@prisma-next/framework-components/codec";

export const codecInstances = [
  {
    id: "idb/string@1",
    targetTypes: ["string"],
    traits: ["equality", "textual"] as const,
    encode: async (value: string) => value,
    decode: async (value: string) => value,
    encodeJson: (value: string) => value,
    decodeJson: (value: string) => value,
  },
  {
    id: "idb/double@1",
    targetTypes: ["number"],
    traits: ["equality", "numeric", "order"] as const,
    encode: async (value: number) => value,
    decode: async (value: number) => value,
    encodeJson: (value: number) => value,
    decodeJson: (value: number) => value,
  },
  {
    id: "idb/int32@1",
    targetTypes: ["number"],
    traits: ["equality", "numeric", "order"] as const,
    encode: async (value: number) => {
      if (!Number.isInteger(value)) {
        throw new Error(`Value ${value} is not an integer and cannot be encoded as int32.`);
      }
      if (value < -Math.pow(2, 31) || value > Math.pow(2, 31) - 1) {
        throw new Error(`Value ${value} is out of range for int32 and cannot be encoded.`);
      }
      return value;
    },
    decode: async (value: number) => value,
    encodeJson: (value: number) => value,
    decodeJson: (value: number) => value,
  },
  {
    id: "idb/bool@1",
    targetTypes: ["boolean"],
    traits: ["equality", "boolean"] as const,
    encode: async (value: boolean) => value,
    decode: async (value: boolean) => value,
    encodeJson: (value: boolean) => value,
    decodeJson: (value: boolean) => value,
  },
  {
    id: "idb/date@1",
    targetTypes: ["Date"],
    traits: ["equality", "order"] as const,
    encode: async (value: Date) => value,
    decode: async (value: Date) => value,
    encodeJson: (value: Date) => value.toISOString(),
    decodeJson: (value: string) => new Date(value),
  },
  {
    id: "idb/bigint@1",
    targetTypes: ["bigint"],
    traits: ["equality", "numeric", "order"] as const,
    encode: async (value: bigint) => value,
    decode: async (value: bigint) => value,
    encodeJson: (value: bigint) => value.toString(),
    decodeJson: (value: string) => BigInt(value),
  },
  {
    id: "idb/decimal@1",
    targetTypes: ["string"],
    traits: ["equality", "numeric"] as const,
    encode: async (value: string) => value,
    decode: async (value: string) => value,
    encodeJson: (value: string) => value,
    decodeJson: (value: string) => value,
  },
  {
    id: "idb/json@1",
    targetTypes: ["unknown"],
    traits: ["equality"] as const,
    encode: async (value: unknown) => value,
    decode: async (value: unknown) => value,
    // JSON values are already JSON-safe — pass through without re-encoding.
    encodeJson: (value: JsonValue) => value as JsonValue,
    decodeJson: (value: JsonValue) => value,
  },
  {
    id: "idb/bytes@1",
    targetTypes: ["Uint8Array"],
    traits: ["equality"] as const,
    encode: async (value: Uint8Array) => value,
    decode: async (value: Uint8Array) => value,
    // Base64 encode/decode without DOM (btoa/atob) or Node.js (Buffer).
    encodeJson: (value: Uint8Array) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let result = "",
        i = 0;
      while (i < value.length) {
        const a = value[i++] ?? 0,
          b = value[i++] ?? 0,
          c = value[i++] ?? 0;
        result +=
          chars[a >> 2]! +
          chars[((a & 3) << 4) | (b >> 4)]! +
          (i - 1 < value.length || i - 2 < value.length ? chars[((b & 15) << 2) | (c >> 6)]! : "=") +
          (i - 1 < value.length ? chars[c & 63]! : "=");
      }
      return result;
    },
    decodeJson: (value: string) => {
      const b64 = value as string;
      const lookup = new Uint8Array(128);
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").forEach((c, i) => {
        lookup[c.charCodeAt(0)!] = i;
      });
      const stripped = b64.replace(/=+$/, "");
      const out = new Uint8Array(Math.floor((stripped.length * 3) / 4));
      let o = 0;
      for (let i = 0; i < stripped.length; i += 4) {
        const a = lookup[stripped.charCodeAt(i)!]! ?? 0;
        const b = lookup[stripped.charCodeAt(i + 1)!]! ?? 0;
        const c = lookup[stripped.charCodeAt(i + 2)!]! ?? 0;
        const d = lookup[stripped.charCodeAt(i + 3)!]! ?? 0;
        out[o++] = (a << 2) | (b >> 4);
        if (i + 2 < stripped.length) out[o++] = ((b & 15) << 4) | (c >> 2);
        if (i + 3 < stripped.length) out[o++] = ((c & 3) << 6) | d;
      }
      return out;
    },
  },
] satisfies ReadonlyArray<Codec>;
