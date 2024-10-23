import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  user: {
    key: [id: string];
    value: {
      id: string;
      name: string;
      email: string;
      emailVerified: Date;
      image: string;
      createdAt: Date;
      updatedAt: Date;
      migratedFromV2: boolean;
    };
  };
  account: {
    key: [provider: string, providerAccountId: string];
    value: {
      userId: string;
      type: string;
      provider: string;
      providerAccountId: string;
      refresh_token: string;
      access_token: string;
      expires_at: number;
      token_type: string;
      scope: string;
      id_token: string;
      session_state: string;
      createdAt: Date;
      updatedAt: Date;
    };
  };
  session: {
    key: [sessionToken: string];
    value: {
      sessionToken: string;
      userId: string;
      expires: Date;
      createdAt: Date;
      updatedAt: Date;
    };
  };
  verificationToken: {
    key: [identifier: string, token: string];
    value: { identifier: string; token: string; expires: Date };
  };
}
