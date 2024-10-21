import type { DBSchema } from "idb";

interface MyDB extends DBSchema {
  user: {
    key: number;
    value: {
      id: number;
      email: string;
    };
  };
  profile: {
    key: number;
    value: {
      id: number;
      bio: string;
      userId: number;
    };
  };
  post: {
    key: number;
    value: {
      id: number;
      createdAt: Date;
      updatedAt: Date;
      title: string;
      published: boolean;
      authorId: number;
    };
  };
  category: {
    key: number;
    value: {
      id: number;
      name: string;
    };
  };
}
